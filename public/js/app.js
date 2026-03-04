// SVG Icons (no emojis!)
const SVG_ICONS = {
  kitten: `<svg viewBox="0 0 24 24" class="icon icon-kitten" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="14" r="8" fill="#ffb74d"/><path d="M5.5 10 Q4 3 8 9" fill="#ffb74d"/><path d="M18.5 10 Q20 3 16 9" fill="#ffb74d"/><circle cx="9.5" cy="13" r="1.8" fill="#fff"/><circle cx="14.5" cy="13" r="1.8" fill="#fff"/><circle cx="10" cy="12.8" r="1" fill="#333"/><circle cx="15" cy="12.8" r="1" fill="#333"/><ellipse cx="12" cy="16" rx="1" ry="0.7" fill="#ff8a80"/><path d="M10 17.5 Q12 19.5 14 17.5" fill="none" stroke="#333" stroke-width="0.8" stroke-linecap="round"/></svg>`,
  ghost: `<svg viewBox="0 0 24 24" class="icon icon-ghost" xmlns="http://www.w3.org/2000/svg"><path d="M6 22 V12 a6 6 0 0 1 12 0 V22 l-2-2 -2 2 -2-2 -2 2 -2-2 -2 2z" fill="#e0e0e0" opacity="0.7"/><circle cx="10" cy="13" r="1.5" fill="#90a4ae"/><circle cx="14" cy="13" r="1.5" fill="#90a4ae"/><path d="M10.5 16 Q12 17.5 13.5 16" fill="none" stroke="#90a4ae" stroke-width="0.8"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" class="icon icon-heart" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 C5 15 2 11 2 7.5 A4.5 4.5 0 0 1 6.5 3 C8.5 3 10.5 4.5 12 6.5 C13.5 4.5 15.5 3 17.5 3 A4.5 4.5 0 0 1 22 7.5 C22 11 19 15 12 21z" fill="#ef5350"/></svg>`,
  heartDead: `<svg viewBox="0 0 24 24" class="icon icon-heart-dead" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 C5 15 2 11 2 7.5 A4.5 4.5 0 0 1 6.5 3 C8.5 3 10.5 4.5 12 6.5 C13.5 4.5 15.5 3 17.5 3 A4.5 4.5 0 0 1 22 7.5 C22 11 19 15 12 21z" fill="#bdbdbd"/></svg>`,
  heartBroken: `<svg viewBox="0 0 24 24" class="icon icon-heart-broken" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 C5 15 2 11 2 7.5 A4.5 4.5 0 0 1 6.5 3 C8.5 3 10.5 4.5 12 6.5 C13.5 4.5 15.5 3 17.5 3 A4.5 4.5 0 0 1 22 7.5 C22 11 19 15 12 21z" fill="#ef5350"/><path d="M12 6.5 L10 10 L14 13 L11 17" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  paw: `<svg viewBox="0 0 24 24" class="icon icon-paw" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="16" rx="5" ry="4" fill="#a1887f"/><circle cx="7" cy="10" r="2.5" fill="#a1887f"/><circle cx="17" cy="10" r="2.5" fill="#a1887f"/><circle cx="10" cy="7" r="2" fill="#a1887f"/><circle cx="14" cy="7" r="2" fill="#a1887f"/></svg>`
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
  deckCount: 0,
  currentPlayer: null,
  turnsRemaining: 1,
  selectedCards: [],
  discardTop: null,
  pendingCatastrophe: null
};

// Screen management
function showScreen(name) {
  gameState.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
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

  // Only show start button for host
  const isHost = players.find(p => p.isHost && p.id === myId);
  document.getElementById('btn-start').style.display = isHost ? 'block' : 'none';
  document.getElementById('waiting-hint').textContent = isHost
    ? `${players.length} player${players.length !== 1 ? 's' : ''} — need at least 2 to start`
    : 'Waiting for host to start...';
}

// Game board rendering
function renderGameBoard() {
  renderOpponents();
  renderDeck();
  renderHand();
  renderTurnIndicator();
}

function renderOpponents() {
  const container = document.getElementById('opponents');
  const others = gameState.players.filter(p => p.id !== myId);

  container.innerHTML = others.map(p => {
    const name = getPlayerName(p.id);
    const eliminated = p.eliminated || p.lives <= 0;
    return `
      <div class="opponent ${eliminated ? 'eliminated' : ''} ${p.id === gameState.currentPlayer ? 'active-turn' : ''}" data-player-id="${p.id}">
        <div class="opponent-avatar">${eliminated ? SVG_ICONS.ghost : SVG_ICONS.kitten}</div>
        <div class="opponent-name">${name}</div>
        <div class="opponent-lives">${livesHTML(p.lives)}</div>
        <div class="opponent-cards">${p.cardCount} cards</div>
      </div>
    `;
  }).join('');
}

function renderDeck() {
  const deckEl = document.getElementById('draw-pile');
  const isMyTurn = gameState.currentPlayer === myId;
  deckEl.className = `draw-pile ${isMyTurn ? 'my-turn' : ''}`;
  deckEl.innerHTML = `
    <div class="deck-stack">
      ${renderCardBack()}
      <div class="deck-count">${gameState.deckCount}</div>
    </div>
    ${isMyTurn ? '<div class="draw-hint">Click to draw!</div>' : ''}
  `;

  const discardEl = document.getElementById('discard-pile');
  if (gameState.discardTop) {
    discardEl.innerHTML = `<div class="discard-label">Discard</div>${renderCard(gameState.discardTop, { small: true })}`;
  } else {
    discardEl.innerHTML = '<div class="discard-label">Discard</div><div class="discard-empty">Empty</div>';
  }

  // My lives
  const me = gameState.players.find(p => p.id === myId);
  if (me) {
    document.getElementById('my-lives').innerHTML = livesHTML(me.lives);
  }
}

function renderHand() {
  const container = document.getElementById('hand');
  const isMyTurn = gameState.currentPlayer === myId;

  container.innerHTML = gameState.hand.map(card => {
    const selected = gameState.selectedCards.includes(card.id);
    const playable = isMyTurn && card.type !== 'catastrophe';
    return renderCard(card, { selected, playable });
  }).join('');

  // Add click handlers
  container.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => handleCardClick(parseInt(el.dataset.cardId)));
  });
}

function renderTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (gameState.currentPlayer === myId) {
    el.innerHTML = '<span class="your-turn-text">Your Turn!</span>';
    el.className = 'turn-indicator my-turn';
  } else {
    const name = getPlayerName(gameState.currentPlayer);
    el.innerHTML = `<span>${name}'s turn</span>`;
    el.className = 'turn-indicator';
  }
}

// Card interaction
function handleCardClick(cardId) {
  const card = gameState.hand.find(c => c.id === cardId);
  if (!card) return;

  // If it's a breed card, handle multi-select
  if (card.type === 'breed') {
    handleBreedSelect(cardId, card);
    return;
  }

  if (gameState.currentPlayer !== myId) {
    // Allow HISS! anytime
    if (card.type === 'hiss') {
      emitPlayHiss('last-action');
      return;
    }
    return showToast("Not your turn!", 'warning');
  }

  // Cards that need targets
  if (card.type === 'pounce') {
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
    // Only select matching breeds
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

  // Check if we have a pair or triple
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

// Draw pile click
document.getElementById('draw-pile').addEventListener('click', () => {
  if (gameState.currentPlayer !== myId) {
    showToast("Not your turn!", 'warning');
    return;
  }
  if (gameState.pendingCatastrophe) return;
  emitDrawCard();
});

// Defuse modal
function showDefuseModal(card, defuseCardId) {
  const modal = document.getElementById('modal');
  const def = getCardDef(card);
  modal.innerHTML = `
    <div class="modal-content defuse-modal">
      <h2 class="catastrophe-title">CATASTROPHE!</h2>
      <div class="catastrophe-card-preview">${def ? def.svg : ''}</div>
      <p>You drew: ${def ? def.name : card.subtype}!</p>
      <p>Play "Land on Your Feet" to save yourself!</p>
      <div class="defuse-timer"><div class="defuse-timer-bar"></div></div>
      <h3>Where to put the catastrophe back?</h3>
      <div class="defuse-buttons">
        <button class="btn btn-defuse" data-pos="top">Top of deck</button>
        <button class="btn btn-defuse" data-pos="bottom">Bottom of deck</button>
        <button class="btn btn-defuse" data-pos="random">Random spot</button>
      </div>
    </div>
  `;
  modal.classList.add('active');

  modal.querySelectorAll('.btn-defuse').forEach(btn => {
    btn.addEventListener('click', () => {
      emitDefuse(defuseCardId, btn.dataset.pos);
      closeModal();
    });
  });
}

function hideDefuseModal() {
  if (gameState.pendingCatastrophe) {
    closeModal();
  }
}

function showPeekModal(cards) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content peek-modal">
      <h3>Top 3 cards:</h3>
      <div class="peek-cards">
        ${cards.map((c, i) => `<div class="peek-card"><div class="peek-pos">${i + 1}</div>${renderCard(c, { small: true })}</div>`).join('')}
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
  // Create particles at the player's position
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
