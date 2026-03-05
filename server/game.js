const {
  BOARD_NODES, BOARD_WIDTH, BOARD_HEIGHT,
  getNode, moveAlongPath, continueFromFork, peekAhead, goBack,
  makeCard, buildBoardDeck, shuffle, resetCardIds,
} = require('./board');

const PLAYER_COLORS = ['#ff6b9d', '#74b9ff', '#55efc4', '#ffd93d', '#a29bfe', '#fab1a0', '#fd79a8', '#81ecec'];

function startGame(room) {
  resetCardIds();
  const playerCount = room.players.length;
  const boardDeck = buildBoardDeck(playerCount);

  const hands = {};
  const positions = {};
  const playerColors = {};
  const playerOrder = room.players.map(p => p.id);
  const playerLives = {};
  const catnip = {};

  playerOrder.forEach((pid, i) => {
    hands[pid] = [];
    positions[pid] = 0;
    playerColors[pid] = PLAYER_COLORS[i % PLAYER_COLORS.length];
    playerLives[pid] = 3;
    catnip[pid] = 0;
  });

  const game = {
    boardDeck,
    hands,
    positions,
    playerColors,
    playerOrder,
    playerLives,
    catnip,
    properties: {}, // nodeId -> playerId (who owns it)
    discardPile: [],
    currentTurnIndex: 0,
    turnsRemaining: 1,
    skipNextTurn: {},
    pendingFork: null,
    pendingCatastrophe: null,
    hasRolled: false,

    currentPlayerSocketId() {
      return this.playerOrder[this.currentTurnIndex];
    },

    advanceTurn() {
      this.turnsRemaining--;
      this.hasRolled = false;
      if (this.turnsRemaining <= 0) {
        this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerOrder.length;
        this.turnsRemaining = 1;
      }

      const nextPlayer = this.currentPlayerSocketId();
      if (this.skipNextTurn[nextPlayer]) {
        delete this.skipNextTurn[nextPlayer];
        this.turnsRemaining--;
        if (this.turnsRemaining <= 0) {
          this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerOrder.length;
          this.turnsRemaining = 1;
        }
      }
    },

    loseLife(playerId) {
      this.playerLives[playerId]--;
      this.pendingCatastrophe = null;
      const lives = this.playerLives[playerId];
      if (lives <= 0) {
        this.eliminatePlayer(playerId);
        return { lives: 0, eliminated: true };
      }
      return { lives, eliminated: false };
    },

    eliminatePlayer(playerId) {
      const idx = this.playerOrder.indexOf(playerId);
      if (idx === -1) return;

      if (this.hands[playerId]) {
        this.discardPile.push(...this.hands[playerId]);
        delete this.hands[playerId];
      }

      // Release their properties
      for (const [nodeId, owner] of Object.entries(this.properties)) {
        if (owner === playerId) delete this.properties[nodeId];
      }

      this.playerOrder.splice(idx, 1);
      if (this.playerOrder.length > 0) {
        this.currentTurnIndex = this.currentTurnIndex % this.playerOrder.length;
      }
      this.playerLives[playerId] = 0;
    },

    checkWinner() {
      if (this.playerOrder.length === 1) return this.playerOrder[0];
      return null;
    },

    checkFinish(playerId) {
      const node = getNode(this.positions[playerId]);
      return node && node.type === 'finish';
    },

    addCatnip(playerId, amount) {
      if (!this.catnip[playerId]) this.catnip[playerId] = 0;
      this.catnip[playerId] = Math.max(0, this.catnip[playerId] + amount);
    },

    getPublicState() {
      return {
        boardDeckCount: this.boardDeck.length,
        currentPlayer: this.currentPlayerSocketId(),
        turnsRemaining: this.turnsRemaining,
        hasRolled: this.hasRolled,
        positions: { ...this.positions },
        properties: { ...this.properties },
        catnip: { ...this.catnip },
        players: Object.keys(this.playerLives).map(id => ({
          id,
          lives: this.playerLives[id],
          cardCount: this.hands[id] ? this.hands[id].length : 0,
          eliminated: this.playerLives[id] <= 0,
          position: this.positions[id],
          color: this.playerColors[id],
          catnip: this.catnip[id] || 0,
        })),
      };
    },

    drawFromBoardDeck() {
      if (this.boardDeck.length === 0) {
        if (this.discardPile.length > 0) {
          this.boardDeck = shuffle([...this.discardPile]);
          this.discardPile = [];
        } else {
          return null;
        }
      }
      return this.boardDeck.pop();
    },

    playBreedPair(playerId, cardIds, targetPlayer) {
      if (cardIds.length !== 2) return { error: 'Must play exactly 2 cards' };
      const hand = this.hands[playerId];
      if (!hand) return { error: 'No hand found' };

      const cards = cardIds.map(id => hand.find(c => c.id === id));
      if (cards.some(c => !c)) return { error: 'Card not in hand' };
      if (cards.some(c => c.type !== 'breed')) return { error: 'Must be breed cards' };
      if (cards[0].subtype !== cards[1].subtype) return { error: 'Breeds must match' };

      for (const cid of cardIds) {
        const idx = hand.findIndex(c => c.id === cid);
        this.discardPile.push(hand.splice(idx, 1)[0]);
      }

      const targetHand = this.hands[targetPlayer];
      if (!targetHand || targetHand.length === 0) return { breed: cards[0].subtype, stolenCard: null };

      const randIdx = Math.floor(Math.random() * targetHand.length);
      const stolen = targetHand.splice(randIdx, 1)[0];
      hand.push(stolen);

      return { breed: cards[0].subtype, stolenCard: stolen };
    },

    playBreedTriple(playerId, cardIds, targetPlayer, requestedType) {
      if (cardIds.length !== 3) return { error: 'Must play exactly 3 cards' };
      const hand = this.hands[playerId];
      if (!hand) return { error: 'No hand found' };

      const cards = cardIds.map(id => hand.find(c => c.id === id));
      if (cards.some(c => !c)) return { error: 'Card not in hand' };
      if (cards.some(c => c.type !== 'breed')) return { error: 'Must be breed cards' };
      if (new Set(cards.map(c => c.subtype)).size !== 1) return { error: 'Breeds must match' };

      for (const cid of cardIds) {
        const idx = hand.findIndex(c => c.id === cid);
        this.discardPile.push(hand.splice(idx, 1)[0]);
      }

      const targetHand = this.hands[targetPlayer];
      if (!targetHand) return { breed: cards[0].subtype, stolenCard: null };

      const idx = targetHand.findIndex(c => c.type === requestedType || c.subtype === requestedType);
      if (idx === -1) return { breed: cards[0].subtype, stolenCard: null };

      const stolen = targetHand.splice(idx, 1)[0];
      hand.push(stolen);

      return { breed: cards[0].subtype, stolenCard: stolen };
    },
  };

  return game;
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// Resolve the space a player landed on
function resolveSpace(game, playerId) {
  const nodeId = game.positions[playerId];
  const node = getNode(nodeId);

  switch (node.type) {
    case 'start':
    case 'fork':
      return { type: node.type, effect: 'nothing' };

    case 'safe': {
      // Safe spaces give 1 catnip
      game.addCatnip(playerId, 1);
      return { type: 'safe', effect: 'catnip', catnipGained: 1 };
    }

    case 'draw': {
      const card = game.drawFromBoardDeck();
      if (card) {
        game.hands[playerId].push(card);
        return { type: 'draw', effect: 'card-drawn', card };
      }
      return { type: 'draw', effect: 'deck-empty' };
    }

    case 'property': {
      const owner = game.properties[nodeId];
      if (!owner) {
        // Unclaimed — auto claim
        game.properties[nodeId] = playerId;
        return { type: 'property', effect: 'claimed', nodeId };
      } else if (owner === playerId) {
        // Own property — earn 1 catnip
        game.addCatnip(playerId, 1);
        return { type: 'property', effect: 'own-property', catnipGained: 1 };
      } else {
        // Someone else's — pay 1 catnip rent (or 1 card if broke)
        const rent = 1;
        if (game.catnip[playerId] >= rent) {
          game.addCatnip(playerId, -rent);
          game.addCatnip(owner, rent);
          return { type: 'property', effect: 'rent-paid', owner, rent };
        } else {
          // No catnip — pay with a random card
          const hand = game.hands[playerId];
          if (hand && hand.length > 0) {
            const randIdx = Math.floor(Math.random() * hand.length);
            const card = hand.splice(randIdx, 1)[0];
            game.hands[owner].push(card);
            return { type: 'property', effect: 'rent-card', owner, card };
          }
          // No cards either — nothing happens
          return { type: 'property', effect: 'rent-broke', owner };
        }
      }
    }

    case 'shop': {
      // Player can buy cards here (handled via socket event)
      game.addCatnip(playerId, 1);
      return { type: 'shop', effect: 'shop-available' };
    }

    case 'catastrophe': {
      const hand = game.hands[playerId];
      const defuseCard = hand ? hand.find(c => c.type === 'defuse') : null;

      if (defuseCard) {
        const idx = hand.findIndex(c => c.id === defuseCard.id);
        game.discardPile.push(hand.splice(idx, 1)[0]);
        return { type: 'catastrophe', effect: 'defused', defuseCard };
      }

      // Lose a life AND go back 3 spaces
      const result = game.loseLife(playerId);
      if (!result.eliminated) {
        const back = goBack(nodeId, 3);
        game.positions[playerId] = back.finalPosition;
        return { type: 'catastrophe', effect: 'life-lost', ...result, goBack: back };
      }
      return { type: 'catastrophe', effect: 'life-lost', ...result };
    }

    case 'trap':
      game.skipNextTurn[playerId] = true;
      return { type: 'trap', effect: 'skip-next-turn' };

    case 'shortcut': {
      const target = node.shortcutTo;
      game.positions[playerId] = target;
      return { type: 'shortcut', effect: 'jumped', from: nodeId, to: target };
    }

    case 'finish':
      return { type: 'finish', effect: 'winner' };

    default:
      return { type: node.type, effect: 'nothing' };
  }
}

function playCard(game, playerId, cardId, targetPlayer) {
  if (game.currentPlayerSocketId() !== playerId) {
    return { error: 'Not your turn' };
  }
  if (game.hasRolled) {
    return { error: 'Already rolled — play cards before rolling' };
  }

  const hand = game.hands[playerId];
  if (!hand) return { error: 'No hand found' };

  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Card not in hand' };

  const card = hand[cardIndex];

  if (card.type === 'catastrophe') return { error: "Can't play catastrophe cards" };
  if (card.type === 'defuse') return { error: 'Defuse cards are played automatically' };
  if (card.type === 'breed') return { error: 'Use breed pairs/triples instead' };

  hand.splice(cardIndex, 1);
  game.discardPile.push(card);

  switch (card.type) {
    case 'catnap':
      return { card, skipTurn: true };

    case 'zoomies':
      if (!targetPlayer) return { error: 'Must choose a target player' };
      return { card, zoomiesTarget: targetPlayer };

    case 'curiosity': {
      const spaces = peekAhead(game.positions[playerId], 6);
      return { card, peek: spaces };
    }

    case 'hairball':
      shuffle(game.boardDeck);
      return { card, shuffled: true };

    case 'pounce': {
      if (!targetPlayer) return { error: 'Must choose a target player' };
      const targetHand = game.hands[targetPlayer];
      if (!targetHand || targetHand.length === 0) return { card, stolenCard: null };
      const randIdx = Math.floor(Math.random() * targetHand.length);
      const stolen = targetHand.splice(randIdx, 1)[0];
      hand.push(stolen);
      return { card, stolenCard: stolen };
    }

    case 'hiss':
      return { error: 'HISS! can only be played as a counter' };

    default:
      return { error: 'Unknown card type' };
  }
}

function playHiss(game, playerId) {
  const hand = game.hands[playerId];
  if (!hand) return { error: 'No hand found' };

  const hissIndex = hand.findIndex(c => c.type === 'hiss');
  if (hissIndex === -1) return { error: 'No HISS! card in hand' };

  const card = hand.splice(hissIndex, 1)[0];
  game.discardPile.push(card);
  return { card };
}

// Shop: spend 3 catnip to draw 2 cards
function shopBuy(game, playerId) {
  const cost = 3;
  if ((game.catnip[playerId] || 0) < cost) return { error: 'Not enough catnip (need 3)' };
  game.addCatnip(playerId, -cost);

  const cards = [];
  for (let i = 0; i < 2; i++) {
    const card = game.drawFromBoardDeck();
    if (card) {
      game.hands[playerId].push(card);
      cards.push(card);
    }
  }
  return { cards, cost };
}

module.exports = {
  startGame,
  rollDice,
  resolveSpace,
  playCard,
  playHiss,
  shopBuy,
  PLAYER_COLORS,
};
