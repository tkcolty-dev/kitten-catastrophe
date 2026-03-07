let cardIdCounter = 0;

const COLORS = ['red', 'blue', 'green', 'yellow'];
const HAND_LIMIT = 25;

function makeCard(type, props = {}) {
  return { id: ++cardIdCounter, type, ...props };
}

const crypto = require('crypto');

function shuffle(arr) {
  // Three passes of Fisher-Yates with crypto-strength randomness
  for (let pass = 0; pass < 3; pass++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  return arr;
}

function getCardValue(card) {
  switch (card.type) {
    case 'draw10': return 100;
    case 'wilddraw4': return 95;
    case 'draw6': return 90;
    case 'wild': return 85;
    case 'wilddraw2': return 75;
    case 'draw2': return 70;
    case 'wildskip': return 68;
    case 'wildreverse': return 67;
    case 'skipall': return 65;
    case 'madmittens': return 80;
    case 'nope': return 60;
    case 'steal': return 55;
    case 'discardall': return 50;
    case 'skip': return 45;
    case 'reverse': return 40;
    case 'kitty': return card.number;
    default: return 0;
  }
}

// Standard UNO deck + UNO No Mercy extras
function buildDeck() {
  const cards = [];

  for (const color of COLORS) {
    // 0 card: 1 per color (standard UNO)
    cards.push(makeCard('kitty', { color, number: 0 }));
    // 1-9: 2 each per color (standard UNO)
    for (let num = 1; num <= 9; num++) {
      cards.push(makeCard('kitty', { color, number: num }));
      cards.push(makeCard('kitty', { color, number: num }));
    }
    // 2 Skip, 2 Reverse, 2 Draw Two per color (standard UNO)
    for (let i = 0; i < 2; i++) {
      cards.push(makeCard('skip', { color }));
      cards.push(makeCard('reverse', { color }));
      cards.push(makeCard('draw2', { color }));
    }
    // 3 Discard All per color
    for (let i = 0; i < 3; i++) cards.push(makeCard('discardall', { color }));
  }

  // 7 Wild, 4 Wild Draw Four (standard UNO)
  for (let i = 0; i < 7; i++) cards.push(makeCard('wild'));
  for (let i = 0; i < 4; i++) cards.push(makeCard('wilddraw4'));

  // Wild action cards (play anytime, pick color)
  for (let i = 0; i < 2; i++) cards.push(makeCard('wildskip'));
  for (let i = 0; i < 2; i++) cards.push(makeCard('wildreverse'));
  for (let i = 0; i < 2; i++) cards.push(makeCard('wilddraw2'));

  // Wild Draw 6 and Wild Draw 10 (UNO No Mercy style)
  for (let i = 0; i < 2; i++) cards.push(makeCard('draw6'));
  for (let i = 0; i < 2; i++) cards.push(makeCard('draw10'));

  // Custom cards
  for (let i = 0; i < 2; i++) cards.push(makeCard('nope'));
  for (let i = 0; i < 2; i++) cards.push(makeCard('steal'));
  for (let i = 0; i < 2; i++) cards.push(makeCard('skipall'));
  cards.push(makeCard('madmittens'));

  return cards;
}

function startGame(room) {
  cardIdCounter = 0;

  const allCards = buildDeck();
  // Shuffle thoroughly before dealing
  shuffle(allCards);
  shuffle(allCards);

  const hands = {};
  const playerOrder = room.players.map(p => p.id);

  // Deal cards round-robin style (1 at a time per player, like real UNO dealing)
  for (let round = 0; round < 7; round++) {
    for (const pid of playerOrder) {
      if (!hands[pid]) hands[pid] = [];
      if (allCards.length > 0) hands[pid].push(allCards.pop());
    }
  }

  // Shuffle remaining deck again
  const deck = shuffle(allCards);

  // Flip first number card for discard
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
    drawStackLocked: false,
    activeColor: firstDiscard?.color || null,
    finishedOrder: [],
    totalDrawn: 0,

    restockRares() {
      // Every 60 draws, inject fresh rare cards into the deck
      const rares = [
        makeCard('draw6'),
        makeCard('draw10'),
        makeCard('wilddraw4'),
        makeCard('wilddraw2'),
        makeCard('wildskip'),
        makeCard('wildreverse'),
        makeCard('nope'),
        makeCard('steal'),
        makeCard('skipall'),
        makeCard('madmittens'),
      ];
      rares.forEach(c => this.deck.push(c));
      shuffle(this.deck);
    },

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
        if (this.drawStackLocked) return false;
        if (card.type === 'madmittens') return true;
        return ['draw2', 'wilddraw2', 'draw6', 'draw10', 'wilddraw4', 'nope'].includes(card.type);
      }
      if (['wild', 'wilddraw4', 'draw6', 'draw10', 'wildskip', 'wildreverse', 'wilddraw2'].includes(card.type)) return true;
      if (['steal', 'skipall'].includes(card.type)) return true;

      if (['skip', 'draw2', 'reverse', 'discardall'].includes(card.type)) {
        if (!card.color) return true;
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
        if (this.direction === 1) {
          this.currentTurnIndex = idx % this.playerOrder.length;
        } else {
          this.currentTurnIndex = (idx - 1 + this.playerOrder.length) % this.playerOrder.length;
        }
      }
    },

    eliminatePlayer(playerId) {
      delete this.hands[playerId];
      const idx = this.playerOrder.indexOf(playerId);
      if (idx === -1) return;
      this.playerOrder.splice(idx, 1);
      if (this.playerOrder.length > 0) {
        if (this.currentTurnIndex >= this.playerOrder.length) {
          this.currentTurnIndex = 0;
        }
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
        drawStackLocked: this.drawStackLocked,
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

module.exports = { startGame, shuffle, COLORS, HAND_LIMIT };
