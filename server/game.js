let cardIdCounter = 0;

function makeCard(type, subtype) {
  return { id: ++cardIdCounter, type, subtype };
}

function buildDeck(playerCount) {
  const cards = [];

  // Catastrophe cards: N+2 total, split across 4 types
  const catastropheTypes = ['toilet', 'vase', 'tree', 'yarn'];
  const totalCatastrophes = playerCount + 2;
  for (let i = 0; i < totalCatastrophes; i++) {
    cards.push(makeCard('catastrophe', catastropheTypes[i % 4]));
  }

  // Land on Your Feet (defuse): N+3 total — but N are dealt directly, so put 3 extras in deck
  // Actually we deal 1 to each player separately, so put remaining in deck
  const totalDefuses = playerCount + 3;
  const extraDefuses = totalDefuses - playerCount; // 3 extras go in deck
  for (let i = 0; i < extraDefuses; i++) {
    cards.push(makeCard('defuse'));
  }

  // Action cards
  for (let i = 0; i < 4; i++) cards.push(makeCard('catnap'));
  for (let i = 0; i < 4; i++) cards.push(makeCard('zoomies'));
  for (let i = 0; i < 5; i++) cards.push(makeCard('curiosity'));
  for (let i = 0; i < 4; i++) cards.push(makeCard('hairball'));
  for (let i = 0; i < 4; i++) cards.push(makeCard('pounce'));
  for (let i = 0; i < 5; i++) cards.push(makeCard('hiss'));

  // Cat breeds
  const breeds = ['tabby', 'siamese', 'tuxedo', 'persian', 'sphynx'];
  for (const breed of breeds) {
    for (let i = 0; i < 4; i++) cards.push(makeCard('breed', breed));
  }

  return cards;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startGame(room) {
  cardIdCounter = 0;
  const playerCount = room.players.length;

  // Build deck WITHOUT catastrophes first (for dealing)
  const allCards = buildDeck(playerCount);
  const catastropheCards = allCards.filter(c => c.type === 'catastrophe');
  const safeCards = allCards.filter(c => c.type !== 'catastrophe');

  shuffle(safeCards);

  const hands = {};
  const playerOrder = room.players.map(p => p.id);
  const playerLives = {};

  // Deal 7 cards + 1 defuse to each player
  for (const pid of playerOrder) {
    hands[pid] = [makeCard('defuse')]; // Guaranteed 1 defuse
    for (let i = 0; i < 7; i++) {
      if (safeCards.length > 0) {
        hands[pid].push(safeCards.pop());
      }
    }
    playerLives[pid] = 3;
  }

  // Remaining safe cards + catastrophe cards = draw pile
  const deck = shuffle([...safeCards, ...catastropheCards]);

  const game = {
    deck,
    hands,
    playerOrder,
    playerLives,
    discardPile: [],
    currentTurnIndex: 0,
    turnsRemaining: 1,
    defuseTimer: null,
    pendingCatastrophe: null, // { playerId, card }

    currentPlayerSocketId() {
      return this.playerOrder[this.currentTurnIndex];
    },

    advanceTurn() {
      this.turnsRemaining--;
      if (this.turnsRemaining <= 0) {
        this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerOrder.length;
        this.turnsRemaining = 1;
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
      // Remove from turn order
      const idx = this.playerOrder.indexOf(playerId);
      if (idx === -1) return;

      // Discard their hand
      if (this.hands[playerId]) {
        this.discardPile.push(...this.hands[playerId]);
        delete this.hands[playerId];
      }

      this.playerOrder.splice(idx, 1);
      if (this.playerOrder.length > 0) {
        this.currentTurnIndex = this.currentTurnIndex % this.playerOrder.length;
      }
      this.playerLives[playerId] = 0;
    },

    checkWinner() {
      if (this.playerOrder.length === 1) {
        return this.playerOrder[0];
      }
      return null;
    },

    getPublicState() {
      return {
        deckCount: this.deck.length,
        currentPlayer: this.currentPlayerSocketId(),
        turnsRemaining: this.turnsRemaining,
        players: Object.keys(this.playerLives).map(id => ({
          id,
          lives: this.playerLives[id],
          cardCount: this.hands[id] ? this.hands[id].length : 0,
          eliminated: this.playerLives[id] <= 0
        }))
      };
    },

    playBreedPair(playerId, cardIds, targetPlayer) {
      if (cardIds.length !== 2) return { error: 'Must play exactly 2 cards' };

      const hand = this.hands[playerId];
      if (!hand) return { error: 'No hand found' };

      const cards = cardIds.map(id => hand.find(c => c.id === id));
      if (cards.some(c => !c)) return { error: 'Card not in hand' };
      if (cards.some(c => c.type !== 'breed')) return { error: 'Must be breed cards' };
      if (cards[0].subtype !== cards[1].subtype) return { error: 'Breeds must match' };

      // Remove from hand, add to discard
      for (const cid of cardIds) {
        const idx = hand.findIndex(c => c.id === cid);
        this.discardPile.push(hand.splice(idx, 1)[0]);
      }

      // Steal random card from target
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

      // Remove from hand
      for (const cid of cardIds) {
        const idx = hand.findIndex(c => c.id === cid);
        this.discardPile.push(hand.splice(idx, 1)[0]);
      }

      // Steal named card type from target
      const targetHand = this.hands[targetPlayer];
      if (!targetHand) return { breed: cards[0].subtype, stolenCard: null };

      const idx = targetHand.findIndex(c => c.type === requestedType || c.subtype === requestedType);
      if (idx === -1) return { breed: cards[0].subtype, stolenCard: null };

      const stolen = targetHand.splice(idx, 1)[0];
      hand.push(stolen);

      return { breed: cards[0].subtype, stolenCard: stolen };
    }
  };

  return game;
}

function playCard(game, playerId, cardId, targetPlayer) {
  if (game.currentPlayerSocketId() !== playerId) {
    return { error: 'Not your turn' };
  }

  const hand = game.hands[playerId];
  if (!hand) return { error: 'No hand found' };

  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return { error: 'Card not in hand' };

  const card = hand[cardIndex];

  // Can't play catastrophe or defuse manually (defuse only on catastrophe draw)
  if (card.type === 'catastrophe') return { error: "Can't play catastrophe cards" };
  if (card.type === 'defuse') return { error: "Defuse cards are played automatically" };
  if (card.type === 'breed') return { error: 'Use breed pairs/triples instead' };

  // Remove card from hand and discard
  hand.splice(cardIndex, 1);
  game.discardPile.push(card);

  switch (card.type) {
    case 'catnap':
      // Skip turn - don't draw
      return { card, skipTurn: true };

    case 'zoomies':
      // Next player takes 2 turns
      game.advanceTurn();
      game.turnsRemaining = 2;
      return { card, extraTurn: true };

    case 'curiosity':
      // Peek at top 3 cards
      const top3 = game.deck.slice(-3).reverse();
      return { card, peek: top3 };

    case 'hairball':
      shuffle(game.deck);
      return { card, shuffled: true };

    case 'pounce':
      if (!targetPlayer) return { error: 'Must choose a target player' };
      const targetHand = game.hands[targetPlayer];
      if (!targetHand || targetHand.length === 0) return { card, stolenCard: null };
      const randIdx = Math.floor(Math.random() * targetHand.length);
      const stolen = targetHand.splice(randIdx, 1)[0];
      hand.push(stolen);
      return { card, stolenCard: stolen };

    case 'hiss':
      return { error: 'HISS! can only be played as a counter' };

    default:
      return { error: 'Unknown card type' };
  }
}

function drawCard(game, playerId) {
  if (game.currentPlayerSocketId() !== playerId) {
    return { error: 'Not your turn' };
  }
  if (game.deck.length === 0) {
    return { error: 'Deck is empty' };
  }

  const card = game.deck.pop();

  if (card.type === 'catastrophe') {
    game.pendingCatastrophe = { playerId, card };
    // Check if player has a defuse
    const hand = game.hands[playerId];
    const defuseCard = hand ? hand.find(c => c.type === 'defuse') : null;
    return {
      catastrophe: true,
      card,
      canDefuse: !!defuseCard,
      defuseCardId: defuseCard ? defuseCard.id : null
    };
  }

  // Normal card
  game.hands[playerId].push(card);
  return { card };
}

function defusePosition(game, playerId, defuseCardId, position) {
  if (!game.pendingCatastrophe || game.pendingCatastrophe.playerId !== playerId) {
    return { error: 'No catastrophe to defuse' };
  }

  const hand = game.hands[playerId];
  const defuseIndex = hand.findIndex(c => c.id === defuseCardId);
  if (defuseIndex === -1) return { error: 'Defuse card not found' };

  // Remove defuse card and discard it
  const defuseCard = hand.splice(defuseIndex, 1)[0];
  game.discardPile.push(defuseCard);

  // Place catastrophe card back in deck
  const catastropheCard = game.pendingCatastrophe.card;
  if (position === 'top') {
    game.deck.push(catastropheCard);
  } else if (position === 'bottom') {
    game.deck.unshift(catastropheCard);
  } else {
    // Random position
    const pos = Math.floor(Math.random() * (game.deck.length + 1));
    game.deck.splice(pos, 0, catastropheCard);
  }

  game.pendingCatastrophe = null;
  return { success: true };
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

module.exports = { startGame, playCard, drawCard, defusePosition, playHiss };
