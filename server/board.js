// Board map — 60 nodes in a serpentine layout (4 rows)
// Row 1: L→R, Row 2: R→L, Row 3: L→R, Row 4: R→L → Finish
// 3 forks, 2 shops, plenty of catastrophes and traps

const BOARD_NODES = [
  // === ROW 1 (y=55, left to right) ===
  { id: 0,  type: 'start',       x: 55,   y: 55,  next: [1] },
  { id: 1,  type: 'safe',        x: 155,  y: 55,  next: [2] },
  { id: 2,  type: 'draw',        x: 255,  y: 55,  next: [3] },
  { id: 3,  type: 'property',    x: 355,  y: 55,  next: [4] },
  { id: 4,  type: 'safe',        x: 455,  y: 55,  next: [5] },
  { id: 5,  type: 'fork',        x: 555,  y: 55,  next: [6, 9] },

  // Fork 1 — Risky (y=10)
  { id: 6,  type: 'catastrophe', x: 645,  y: 10,  next: [7] },
  { id: 7,  type: 'draw',        x: 735,  y: 5,   next: [8] },
  { id: 8,  type: 'shortcut',    x: 825,  y: 10,  next: [12], shortcutTo: 18 },

  // Fork 1 — Safe (y=110)
  { id: 9,  type: 'safe',        x: 625,  y: 110, next: [10] },
  { id: 10, type: 'property',    x: 710,  y: 118, next: [11] },
  { id: 11, type: 'trap',        x: 795,  y: 110, next: [12] },

  // Merge + end of row 1
  { id: 12, type: 'draw',        x: 895,  y: 55,  next: [13] },
  { id: 13, type: 'property',    x: 985,  y: 55,  next: [14] },
  { id: 14, type: 'safe',        x: 1075, y: 55,  next: [15] },

  // Connector down (right)
  { id: 15, type: 'shop',        x: 1175, y: 130, next: [16] },

  // === ROW 2 (y=210, right to left) ===
  { id: 16, type: 'safe',        x: 1175, y: 210, next: [17] },
  { id: 17, type: 'draw',        x: 1075, y: 210, next: [18] },
  { id: 18, type: 'catastrophe', x: 985,  y: 210, next: [19] },
  { id: 19, type: 'property',    x: 895,  y: 210, next: [20] },
  { id: 20, type: 'fork',        x: 805,  y: 210, next: [21, 24] },

  // Fork 2 — Risky (y=160)
  { id: 21, type: 'catastrophe', x: 720,  y: 160, next: [22] },
  { id: 22, type: 'property',    x: 635,  y: 155, next: [23] },
  { id: 23, type: 'catastrophe', x: 550,  y: 160, next: [27] },

  // Fork 2 — Safe (y=265)
  { id: 24, type: 'safe',        x: 740,  y: 265, next: [25] },
  { id: 25, type: 'draw',        x: 660,  y: 272, next: [26] },
  { id: 26, type: 'safe',        x: 580,  y: 265, next: [27] },

  // Merge + end of row 2
  { id: 27, type: 'draw',        x: 475,  y: 210, next: [28] },
  { id: 28, type: 'property',    x: 385,  y: 210, next: [29] },
  { id: 29, type: 'trap',        x: 295,  y: 210, next: [30] },
  { id: 30, type: 'safe',        x: 205,  y: 210, next: [31] },

  // Connector down (left)
  { id: 31, type: 'draw',        x: 115,  y: 285, next: [32] },

  // === ROW 3 (y=360, left to right) ===
  { id: 32, type: 'safe',        x: 115,  y: 360, next: [33] },
  { id: 33, type: 'property',    x: 205,  y: 360, next: [34] },
  { id: 34, type: 'catastrophe', x: 295,  y: 360, next: [35] },
  { id: 35, type: 'draw',        x: 385,  y: 360, next: [36] },
  { id: 36, type: 'fork',        x: 475,  y: 360, next: [37, 39] },

  // Fork 3 — Risky (y=310)
  { id: 37, type: 'catastrophe', x: 560,  y: 310, next: [38] },
  { id: 38, type: 'catastrophe', x: 645,  y: 305, next: [43] },

  // Fork 3 — Safe (y=415)
  { id: 39, type: 'safe',        x: 545,  y: 415, next: [40] },
  { id: 40, type: 'draw',        x: 625,  y: 422, next: [41] },
  { id: 41, type: 'property',    x: 705,  y: 422, next: [42] },
  { id: 42, type: 'trap',        x: 785,  y: 415, next: [43] },

  // Merge + end of row 3
  { id: 43, type: 'shop',        x: 870,  y: 360, next: [44] },
  { id: 44, type: 'safe',        x: 960,  y: 360, next: [45] },
  { id: 45, type: 'property',    x: 1050, y: 360, next: [46] },

  // Connector down (right)
  { id: 46, type: 'draw',        x: 1145, y: 430, next: [47] },

  // === ROW 4 (y=500, right to left) — Final gauntlet ===
  { id: 47, type: 'catastrophe', x: 1145, y: 500, next: [48] },
  { id: 48, type: 'property',    x: 1055, y: 500, next: [49] },
  { id: 49, type: 'draw',        x: 965,  y: 500, next: [50] },
  { id: 50, type: 'safe',        x: 875,  y: 500, next: [51] },
  { id: 51, type: 'catastrophe', x: 785,  y: 500, next: [52] },
  { id: 52, type: 'property',    x: 695,  y: 500, next: [53] },
  { id: 53, type: 'draw',        x: 605,  y: 500, next: [54] },
  { id: 54, type: 'trap',        x: 515,  y: 500, next: [55] },
  { id: 55, type: 'safe',        x: 425,  y: 500, next: [56] },
  { id: 56, type: 'draw',        x: 335,  y: 500, next: [57] },
  { id: 57, type: 'property',    x: 245,  y: 500, next: [58] },
  { id: 58, type: 'safe',        x: 155,  y: 500, next: [59] },
  { id: 59, type: 'finish',      x: 65,   y: 500, next: [] },
];

const BOARD_WIDTH = 1300;
const BOARD_HEIGHT = 540;

function getNode(id) {
  return BOARD_NODES[id];
}

// --- Movement ---

function moveAlongPath(startNode, steps) {
  let currentNode = startNode;
  const path = [];
  let remaining = steps;

  while (remaining > 0) {
    const node = getNode(currentNode);
    if (node.next.length === 0) break;
    if (node.next.length > 1) {
      return { path, currentNode, fork: true, options: node.next, remainingSteps: remaining };
    }
    currentNode = node.next[0];
    path.push(currentNode);
    remaining--;
  }

  return { path, finalPosition: currentNode, fork: false };
}

function continueFromFork(chosenNext, remainingSteps) {
  const path = [chosenNext];
  let currentNode = chosenNext;
  let remaining = remainingSteps - 1;

  while (remaining > 0) {
    const node = getNode(currentNode);
    if (node.next.length === 0) break;
    if (node.next.length > 1) {
      return { path, currentNode, fork: true, options: node.next, remainingSteps: remaining };
    }
    currentNode = node.next[0];
    path.push(currentNode);
    remaining--;
  }

  return { path, finalPosition: currentNode, fork: false };
}

function peekAhead(currentNode, count) {
  const results = [];
  const queue = [{ nodeId: currentNode, depth: 0 }];
  const visited = new Set();

  while (queue.length > 0 && results.length < count) {
    const { nodeId, depth } = queue.shift();
    if (depth === 0) {
      visited.add(nodeId);
      const node = getNode(nodeId);
      for (const next of node.next) queue.push({ nodeId: next, depth: 1 });
      continue;
    }
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = getNode(nodeId);
    results.push({ id: node.id, type: node.type });
    for (const next of node.next) {
      if (!visited.has(next)) queue.push({ nodeId: next, depth: depth + 1 });
    }
  }
  return results;
}

// Go back N spaces from current position (follow path backwards)
function goBack(startNode, steps) {
  let current = startNode;
  const path = [];
  for (let i = 0; i < steps; i++) {
    const prev = BOARD_NODES.find(n => n.next.includes(current));
    if (!prev || prev.id === 0) break;
    current = prev.id;
    path.push(current);
  }
  return { path, finalPosition: current };
}

// --- Board card deck ---

let cardIdCounter = 0;

function makeCard(type, subtype) {
  return { id: ++cardIdCounter, type, subtype };
}

function buildBoardDeck(playerCount) {
  const cards = [];

  for (let i = 0; i < 6; i++) cards.push(makeCard('defuse'));
  for (let i = 0; i < 5; i++) cards.push(makeCard('catnap'));
  for (let i = 0; i < 5; i++) cards.push(makeCard('zoomies'));
  for (let i = 0; i < 6; i++) cards.push(makeCard('curiosity'));
  for (let i = 0; i < 5; i++) cards.push(makeCard('hairball'));
  for (let i = 0; i < 5; i++) cards.push(makeCard('pounce'));
  for (let i = 0; i < 6; i++) cards.push(makeCard('hiss'));

  const breeds = ['tabby', 'siamese', 'tuxedo', 'persian', 'sphynx'];
  for (const breed of breeds) {
    for (let i = 0; i < 5; i++) cards.push(makeCard('breed', breed));
  }

  return shuffle(cards);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function resetCardIds() {
  cardIdCounter = 0;
}

module.exports = {
  BOARD_NODES,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  getNode,
  moveAlongPath,
  continueFromFork,
  peekAhead,
  goBack,
  makeCard,
  buildBoardDeck,
  shuffle,
  resetCardIds,
};
