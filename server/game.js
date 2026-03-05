let cardIdCounter = 0;

const COLORS = ['red', 'blue', 'green', 'yellow'];
const CATASTROPHE_TYPES = ['toilet', 'vase', 'tree', 'yarn'];

function makeCard(type, props = {}) {
  return { id: ++cardIdCounter, type, ...props };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCardValue(card) {
  switch (card.type) {
    case 'wilddraw4': return 100;
    case 'wild': return 90;
    case 'defuse': return 80;
    case 'draw2': return 70;
    case 'nope': return 60;
    case 'steal': return 55;
    case 'peek': return 50;
    case 'skip': return 45;
    case 'reverse': return 40;
    case 'shuffle': return 35;
    case 'kitty': return card.number;
    default: return 0;
  }
}

function buildDeck(playerCount) {
  const cards = [];

  // Kitty number cards: 4 colors x 9 numbers (1-9) x 2 each = 72
  for (const color of COLORS) {
    for (let num = 1; num <= 9; num++) {
      cards.push(makeCard('kitty', { color, number: num }));
      cards.push(makeCard('kitty', { color, number: num }));
    }
  }

  // Colored action cards (one per color)
  for (const color of COLORS) {
    cards.push(makeCard('skip', { color }));
    cards.push(makeCard('draw2', { color }));
    cards.push(makeCard('reverse', { color }));
  }

  // Extra draw2s (colored)
  cards.push(makeCard('draw2', { color: 'red' }));
  cards.push(makeCard('draw2', { color: 'blue' }));

  // Colorless action cards
  for (let i = 0; i < 2; i++) cards.push(makeCard('steal'));
  for (let i = 0; i < 1; i++) cards.push(makeCard('shuffle'));
  for (let i = 0; i < 2; i++) cards.push(makeCard('nope'));

  // Wild cards (rare)
  for (let i = 0; i < 2; i++) cards.push(makeCard('wild'));
  for (let i = 0; i < 4; i++) cards.push(makeCard('wilddraw4'));

  // Extra defuses in deck (1 dealt per player separately)
  for (let i = 0; i < 2; i++) cards.push(makeCard('defuse'));

  return cards;
}

function startGame(room) {
  cardIdCounter = 0;
  const playerCount = room.players.length;

  const allCards = buildDeck(playerCount);
  shuffle(allCards);

  const hands = {};
  const playerOrder = room.players.map(p => p.id);

  // Deal 1 defuse + 4 random = 5 cards each
  for (const pid of playerOrder) {
    hands[pid] = [makeCard('defuse')];
    for (let i = 0; i < 4; i++) {
      if (allCards.length > 0) hands[pid].push(allCards.pop());
    }
  }

  // Add catastrophe cards
  const catastropheCount = playerCount + 1;
  for (let i = 0; i < catastropheCount; i++) {
    allCards.push(makeCard('catastrophe', { subtype: CATASTROPHE_TYPES[i % 4] }));
  }

  const deck = shuffle(allCards);

  // Flip first kitty card for discard
  let firstDiscard = null;
  for (let i = deck.length - 1; i >= 0; i--) {
    if (deck[i].type === 'kitty') {
      firstDiscard = deck.splice(i, 1)[0];
      break;
    }
  }

  return {
    deck,
    hands,
    playerOrder,
    discardPile: firstDiscard ? [firstDiscard] : [],
    currentTurnIndex: 0,
    direction: 1,
    drawStack: 0,
    activeColor: firstDiscard?.color || null,
    pendingCatastrophe: null,
    pendingPeek: null,
    defuseTimer: null,
    finishedOrder: [],

    currentPlayerSocketId() {
      return this.playerOrder[this.currentTurnIndex];
    },

    topDiscard() {
      return this.discardPile[this.discardPile.length - 1] || null;
    },

    advanceTurn() {
      const len = this.playerOrder.length;
      if (len === 0) return;
      this.currentTurnIndex = ((this.currentTurnIndex + this.direction) % len + len) % len;
    },

    reshuffleDeck() {
      if (this.deck.length === 0 && this.discardPile.length > 1) {
        const topCard = this.discardPile.pop();
        this.deck = shuffle([...this.discardPile]);
        this.discardPile = [topCard];
        return true;
      }
      return false;
    },

    canPlay(card) {
      if (this.drawStack > 0) {
        return card.type === 'draw2' || card.type === 'wilddraw4' || card.type === 'nope';
      }
      if (card.type === 'defuse' || card.type === 'catastrophe') return false;
      if (card.type === 'wild' || card.type === 'wilddraw4') return true;
      if (['steal', 'shuffle'].includes(card.type)) return true;
      if (card.type === 'nope' && this.drawStack > 0) return true;

      // Colored action cards: match by color or by type
      if (['skip', 'draw2', 'reverse'].includes(card.type)) {
        if (!card.color) return true; // colorless ones always playable
        const top = this.topDiscard();
        if (!top) return true;
        const matchColor = this.activeColor || top.color;
        if (card.color === matchColor) return true;
        if (top.type === card.type) return true;
        return false;
      }

      if (card.type === 'kitty') {
        const top = this.topDiscard();
        if (!top) return true;
        const matchColor = this.activeColor || top.color;
        if (card.color === matchColor) return true;
        if (top.type === 'kitty' && card.number === top.number) return true;
        return false;
      }
      return false;
    },

    getPlayableIds(playerId) {
      const hand = this.hands[playerId];
      if (!hand) return [];
      return hand.filter(c => this.canPlay(c)).map(c => c.id);
    },

    finishPlayer(playerId) {
      this.finishedOrder.push(playerId);
      delete this.hands[playerId];
      const idx = this.playerOrder.indexOf(playerId);
      if (idx === -1) return;
      this.playerOrder.splice(idx, 1);
      if (this.playerOrder.length > 0) {
        this.currentTurnIndex = this.currentTurnIndex % this.playerOrder.length;
      }
    },

    removeBestCard(playerId) {
      const hand = this.hands[playerId];
      if (!hand || hand.length === 0) return null;
      let bestIdx = 0;
      let bestVal = getCardValue(hand[0]);
      for (let i = 1; i < hand.length; i++) {
        const val = getCardValue(hand[i]);
        if (val > bestVal) { bestVal = val; bestIdx = i; }
      }
      const removed = hand.splice(bestIdx, 1)[0];
      this.discardPile.push(removed);
      return removed;
    },

    isGameOver() {
      return this.playerOrder.length <= 1;
    },

    getPublicState() {
      return {
        deckCount: this.deck.length,
        currentPlayer: this.currentPlayerSocketId(),
        direction: this.direction,
        drawStack: this.drawStack,
        activeColor: this.activeColor,
        discardTop: this.topDiscard(),
        players: this.playerOrder.map(id => ({
          id,
          cardCount: this.hands[id] ? this.hands[id].length : 0
        }))
      };
    }
  };
}

function defusePosition(game, playerId, defuseCardId, position) {
  if (!game.pendingCatastrophe || game.pendingCatastrophe.playerId !== playerId) {
    return { error: 'No catastrophe to defuse' };
  }
  const hand = game.hands[playerId];
  if (!hand) return { error: 'No hand' };
  const defuseIndex = hand.findIndex(c => c.id === defuseCardId);
  if (defuseIndex === -1) return { error: 'Defuse card not found' };

  const defuseCard = hand.splice(defuseIndex, 1)[0];
  game.discardPile.push(defuseCard);

  const catastropheCard = game.pendingCatastrophe.card;
  if (position === 'top') {
    game.deck.push(catastropheCard);
  } else if (position === 'bottom') {
    game.deck.unshift(catastropheCard);
  } else {
    const pos = Math.floor(Math.random() * (game.deck.length + 1));
    game.deck.splice(pos, 0, catastropheCard);
  }

  game.pendingCatastrophe = null;
  return { success: true };
}

module.exports = { startGame, defusePosition, shuffle, COLORS };
