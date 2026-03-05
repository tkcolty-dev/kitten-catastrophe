// SVG Icons
const SVG_ICONS = {
  kitten: `<img class="icon icon-kitten" src="/img/kitten.png" alt="kitten">`,
  ghost: `<img class="icon icon-ghost" src="/img/kitten.png" alt="ghost" style="opacity:0.4;filter:grayscale(1)">`,
  heart: `<svg viewBox="0 0 24 24" class="icon icon-heart" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 C5 15 2 11 2 7.5 A4.5 4.5 0 0 1 6.5 3 C8.5 3 10.5 4.5 12 6.5 C13.5 4.5 15.5 3 17.5 3 A4.5 4.5 0 0 1 22 7.5 C22 11 19 15 12 21z" fill="#ef5350"/></svg>`,
  heartDead: `<svg viewBox="0 0 24 24" class="icon icon-heart-dead" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 C5 15 2 11 2 7.5 A4.5 4.5 0 0 1 6.5 3 C8.5 3 10.5 4.5 12 6.5 C13.5 4.5 15.5 3 17.5 3 A4.5 4.5 0 0 1 22 7.5 C22 11 19 15 12 21z" fill="#bdbdbd"/></svg>`,
  heartBroken: `<svg viewBox="0 0 24 24" class="icon icon-heart-broken" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 C5 15 2 11 2 7.5 A4.5 4.5 0 0 1 6.5 3 C8.5 3 10.5 4.5 12 6.5 C13.5 4.5 15.5 3 17.5 3 A4.5 4.5 0 0 1 22 7.5 C22 11 19 15 12 21z" fill="#ef5350"/><path d="M12 6.5 L10 10 L14 13 L11 17" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

function livesHTML(count) {
  let html = '';
  for (let i = 0; i < count; i++) html += SVG_ICONS.heart;
  for (let i = count; i < 3; i++) html += SVG_ICONS.heartDead;
  return html;
}

// Game state
const gameState = {
  screen: 'title',
  hand: [],
  players: [],
  playerNames: {},
  playerColors: {},
  positions: {},
  properties: {},
  catnip: {},
  boardDeckCount: 0,
  currentPlayer: null,
  turnsRemaining: 1,
  hasRolled: false,
  selectedCards: [],
  boardLayout: null,
};

// Board renderer + dice
let boardRenderer = null;
let diceRoller = null;

// Screen management
function showScreen(name) {
  gameState.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');

  if (name === 'game') {
    initBoard();
  }
}

// Title screen handlers
document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) return showToast('Enter your name!', 'error');
  createRoom(name);
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) return showToast('Enter your name!', 'error');
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code || code.length !== 4) return showToast('Enter a 4-letter room code!', 'error');
  joinRoom(code, name);
});

document.getElementById('btn-start').addEventListener('click', () => {
  startGame();
});

// Waiting room
function updateWaitingPlayers(players) {
  const list = document.getElementById('player-list');
  list.innerHTML = players.map(p => `
    <div class="player-item ${p.isHost ? 'host' : ''}">
      <span class="player-avatar">${SVG_ICONS.kitten}</span>
      <span class="player-name-tag">${p.name}</span>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
    </div>
  `).join('');

  const isHost = players.find(p => p.isHost && p.id === myId);
  document.getElementById('btn-start').style.display = isHost ? 'block' : 'none';
  document.getElementById('waiting-hint').textContent = isHost
    ? `${players.length} player${players.length !== 1 ? 's' : ''} — need at least 2 to start`
    : 'Waiting for host to start...';
}

// Initialize board
let diceClickBound = false;
let resizeBound = false;

function initBoard() {
  const canvas = document.getElementById('board-canvas');
  if (!boardRenderer) {
    boardRenderer = new BoardRenderer(canvas);
  }

  // Use rAF to let DOM layout settle before measuring canvas
  requestAnimationFrame(() => {
    if (gameState.boardLayout) {
      boardRenderer.setBoard(gameState.boardLayout);
      boardRenderer.playerColors = gameState.playerColors;
      boardRenderer.playerNames = gameState.playerNames;
      boardRenderer.updatePositions(gameState.positions);
      boardRenderer.updateProperties(gameState.properties || {});
      boardRenderer.draw();
    }
  });

  // Init dice
  const diceContainer = document.getElementById('dice-container');
  if (!diceRoller) {
    diceRoller = new DiceRoller(diceContainer);
  }
  diceRoller.reset();

  // Dice click handler (bind once)
  if (!diceClickBound) {
    diceClickBound = true;
    diceContainer.addEventListener('click', (e) => {
      if (e.target.closest('#dice-btn') && !e.target.closest('#dice-btn').disabled) {
        handleDiceClick();
      }
    });
  }

  // Handle resize (bind once)
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', () => {
      if (boardRenderer && gameState.screen === 'game') {
        boardRenderer.resize();
        boardRenderer.draw();
      }
    });
  }

  renderGameUI();
}

// Render game UI (sidebar + dice state)
function renderGameUI() {
  renderPlayerPanel();
  renderHand();
  renderTurnIndicator();
  updateDiceState();

  if (boardRenderer) {
    boardRenderer.updatePositions(gameState.positions);
    boardRenderer.updateProperties(gameState.properties || {});
    boardRenderer.draw();
  }
}

function renderPlayerPanel() {
  const container = document.getElementById('player-panel');
  if (!container) return;

  container.innerHTML = gameState.players.map(p => {
    const name = getPlayerName(p.id);
    const eliminated = p.eliminated || p.lives <= 0;
    const isMe = p.id === myId;
    const isTurn = p.id === gameState.currentPlayer;
    const catnipCount = p.catnip || gameState.catnip[p.id] || 0;
    return `
      <div class="player-panel-item ${isTurn ? 'active-turn' : ''} ${eliminated ? 'eliminated' : ''} ${isMe ? 'is-me' : ''}" data-player-id="${p.id}">
        <div class="player-color-dot" style="background:${p.color || gameState.playerColors[p.id] || '#ccc'}"></div>
        <div class="panel-player-info">
          <div class="panel-player-name">${name}${isMe ? ' (you)' : ''}</div>
          <div class="panel-player-stats">${livesHTML(p.lives)} <span class="catnip-count">🌿${catnipCount}</span></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderHand() {
  const container = document.getElementById('hand');
  if (!container) return;
  const isMyTurn = gameState.currentPlayer === myId;

  container.innerHTML = gameState.hand.map(card => {
    const selected = gameState.selectedCards.includes(card.id);
    const playable = isMyTurn && card.type !== 'catastrophe' && !gameState.hasRolled;
    return renderCard(card, { selected, playable });
  }).join('');

  container.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => handleCardClick(parseInt(el.dataset.cardId)));
  });

  // My lives
  const me = gameState.players.find(p => p.id === myId);
  if (me) {
    document.getElementById('my-lives').innerHTML = livesHTML(me.lives);
  }
}

function renderTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (!el) return;

  if (gameState.currentPlayer === myId) {
    const hint = gameState.hasRolled
      ? 'Waiting for space resolution...'
      : 'Play cards or roll the dice!';
    el.innerHTML = `<span class="your-turn-text">Your Turn!</span><span class="turn-hint">${hint}</span>`;
    el.className = 'turn-indicator my-turn';
  } else {
    const name = getPlayerName(gameState.currentPlayer);
    el.innerHTML = `<span>${name}'s turn</span>`;
    el.className = 'turn-indicator';
  }
}

function updateDiceState() {
  if (!diceRoller) return;
  const isMyTurn = gameState.currentPlayer === myId;
  const canRoll = isMyTurn && !gameState.hasRolled;
  diceRoller.setEnabled(canRoll);

  const btn = document.getElementById('dice-btn');
  if (btn) {
    btn.classList.toggle('my-turn-dice', canRoll);
  }
}

function handleDiceClick() {
  if (gameState.currentPlayer !== myId) return showToast("Not your turn!", 'warning');
  if (gameState.hasRolled) return showToast("Already rolled!", 'warning');
  emitRollDice();
}

// Card interaction
function handleCardClick(cardId) {
  const card = gameState.hand.find(c => c.id === cardId);
  if (!card) return;

  if (card.type === 'breed') {
    handleBreedSelect(cardId, card);
    return;
  }

  if (gameState.currentPlayer !== myId) {
    if (card.type === 'hiss') {
      emitPlayHiss('last-action');
      return;
    }
    return showToast("Not your turn!", 'warning');
  }

  if (gameState.hasRolled) {
    return showToast("Play cards before rolling!", 'warning');
  }

  // Cards that need targets
  if (card.type === 'pounce' || card.type === 'zoomies') {
    showTargetPicker(cardId);
    return;
  }

  emitPlayCard(cardId);
}

function handleBreedSelect(cardId, card) {
  const idx = gameState.selectedCards.indexOf(cardId);
  if (idx >= 0) {
    gameState.selectedCards.splice(idx, 1);
  } else {
    const selected = gameState.selectedCards
      .map(id => gameState.hand.find(c => c.id === id))
      .filter(c => c && c.type === 'breed' && c.subtype === card.subtype);

    if (selected.length === 0) {
      gameState.selectedCards = [cardId];
    } else {
      gameState.selectedCards.push(cardId);
    }
  }

  renderHand();

  const selectedBreeds = gameState.selectedCards
    .map(id => gameState.hand.find(c => c.id === id))
    .filter(c => c && c.type === 'breed');

  if (selectedBreeds.length === 2) {
    showTargetPicker(null, 'pair');
  } else if (selectedBreeds.length === 3) {
    showTargetPicker(null, 'triple');
  }
}

function showTargetPicker(cardId, breedMode) {
  const others = gameState.players.filter(p => p.id !== myId && !p.eliminated && p.lives > 0);
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content target-picker">
      <h3>Choose a target:</h3>
      ${others.map(p => `
        <button class="btn btn-target" data-target="${p.id}">
          ${SVG_ICONS.kitten} ${getPlayerName(p.id)}
        </button>
      `).join('')}
      ${breedMode === 'triple' ? `
        <h3 style="margin-top:12px">Name a card type:</h3>
        <select id="steal-type" class="steal-type-select">
          <option value="defuse">Land on Your Feet</option>
          <option value="catnap">Catnap</option>
          <option value="zoomies">Zoomies</option>
          <option value="curiosity">Curiosity</option>
          <option value="hairball">Hairball</option>
          <option value="pounce">Pounce</option>
          <option value="hiss">HISS!</option>
        </select>
      ` : ''}
      <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
    </div>
  `;
  modal.classList.add('active');

  modal.querySelectorAll('.btn-target').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if (breedMode === 'pair') {
        emitPlayBreedPair(gameState.selectedCards, targetId);
      } else if (breedMode === 'triple') {
        const cardType = document.getElementById('steal-type').value;
        emitPlayBreedTriple(gameState.selectedCards, targetId, cardType);
      } else {
        emitPlayCard(cardId, targetId);
      }
      gameState.selectedCards = [];
      closeModal();
    });
  });
}

// Fork choice modal
function showForkModal(options) {
  const FORK_COLORS = {
    catastrophe: { bg: '#ffebee', color: '#ef5350', label: 'Catastrophe!' },
    draw: { bg: '#e3f2fd', color: '#42a5f5', label: 'Draw Card' },
    safe: { bg: '#f5f5f5', color: '#9e9e9e', label: 'Safe' },
    trap: { bg: '#fff3e0', color: '#ff9800', label: 'Trap' },
    shortcut: { bg: '#f3e5f5', color: '#ab47bc', label: 'Shortcut' },
    fork: { bg: '#fffde7', color: '#ffd600', label: 'Fork' },
    finish: { bg: '#fffde7', color: '#ffd600', label: 'Finish!' },
    start: { bg: '#e8f5e9', color: '#4caf50', label: 'Start' },
  };

  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content fork-modal">
      <h3>Choose your path!</h3>
      ${options.map(opt => {
        const fc = FORK_COLORS[opt.type] || FORK_COLORS.safe;
        return `
          <button class="fork-option" data-node="${opt.id}" style="border-color:${fc.color}">
            <span class="fork-dot" style="background:${fc.color}"></span>
            <span>Go toward <strong>${fc.label}</strong> space</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
  modal.classList.add('active');

  modal.querySelectorAll('.fork-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const nodeId = parseInt(btn.dataset.node);
      emitChooseFork(nodeId);
      closeModal();
    });
  });
}

// Peek modal (for Curiosity card — shows spaces ahead)
function showPeekModal(spaces) {
  const SPACE_COLORS = {
    safe: { bg: '#f5f5f5', color: '#666', label: 'Safe' },
    draw: { bg: '#e3f2fd', color: '#1565c0', label: 'Draw Card' },
    catastrophe: { bg: '#ffebee', color: '#c62828', label: 'Catastrophe!' },
    fork: { bg: '#fffde7', color: '#f57f17', label: 'Fork' },
    trap: { bg: '#fff3e0', color: '#e65100', label: 'Trap' },
    shortcut: { bg: '#f3e5f5', color: '#7b1fa2', label: 'Shortcut' },
    finish: { bg: '#fffde7', color: '#e65100', label: 'Finish!' },
    start: { bg: '#e8f5e9', color: '#2e7d32', label: 'Start' },
  };

  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content peek-modal">
      <h3>Next ${spaces.length} spaces ahead:</h3>
      <div class="peek-spaces">
        ${spaces.map((s, i) => {
          const sc = SPACE_COLORS[s.type] || SPACE_COLORS.safe;
          return `<div class="peek-space" style="background:${sc.bg};color:${sc.color}">
            <div class="peek-pos">${i + 1}</div>
            ${sc.label}
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-primary" onclick="closeModal()">Got it!</button>
    </div>
  `;
  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Action log
function addToLog(message, type = '') {
  const log = document.getElementById('action-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// Animations
function triggerScreenShake() {
  document.getElementById('screen-game').classList.add('shake');
  setTimeout(() => document.getElementById('screen-game').classList.remove('shake'), 500);
}

function triggerHeartShatter(playerId) {
  const playerEl = document.querySelector(`[data-player-id="${playerId}"]`) || document.getElementById('my-lives');
  if (!playerEl) return;
  const rect = playerEl.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const particle = document.createElement('div');
    particle.className = 'heart-particle';
    particle.innerHTML = SVG_ICONS.heartBroken;
    particle.style.left = rect.left + rect.width / 2 + 'px';
    particle.style.top = rect.top + 'px';
    particle.style.setProperty('--dx', (Math.random() - 0.5) * 100 + 'px');
    particle.style.setProperty('--dy', -Math.random() * 80 - 20 + 'px');
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1000);
  }
}

function triggerDrawCardAnimation(card) {
  const def = typeof getCardDef === 'function' ? getCardDef(card) : null;
  const el = document.createElement('div');
  el.className = 'draw-card-anim';
  el.innerHTML = def ? renderCard(card, { small: true }) : `<div class="card card-small"><div class="card-inner" style="--card-bg:#e3f2fd;--card-color:#42a5f5"><div class="card-name">${card.type}</div></div></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function triggerEliminationAnimation(playerId) {
  const el = document.querySelector(`[data-player-id="${playerId}"]`);
  if (el) el.classList.add('floating-away');
}

function triggerConfetti() {
  const container = document.getElementById('confetti');
  container.style.display = 'block';
  const colors = ['#ff6b9d', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 2 + 's';
    piece.style.animationDuration = 2 + Math.random() * 2 + 's';
    container.appendChild(piece);
  }
}

// Helper
function getPlayerName(playerId) {
  if (gameState.playerNames[playerId]) return gameState.playerNames[playerId];
  return playerId === myId ? 'You' : 'Player';
}

// Copy room code
document.getElementById('room-code-display')?.addEventListener('click', function () {
  navigator.clipboard.writeText(this.textContent);
  showToast('Room code copied!', 'success');
});

// Initialize
showScreen('title');
