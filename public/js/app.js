// Game state
const gameState = {
  screen: 'title',
  hand: [],
  playable: [],
  players: [],
  playerNames: {},
  deckCount: 0,
  currentPlayer: null,
  direction: 1,
  drawStack: 0,
  activeColor: null,
  discardTop: null
};

const WILD_TYPES = ['wild', 'wilddraw4', 'draw6', 'draw10'];

// Screen management
function showScreen(name) {
  gameState.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

// Title screen
function getPlayerName() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) showToast('Enter your name!', 'error');
  return name;
}

// Restore saved name
const savedName = localStorage.getItem('kc-name');
if (savedName) document.getElementById('player-name').value = savedName;

document.getElementById('btn-create-public').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  emitCreateRoom(name, true);
});
document.getElementById('btn-create-private').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  emitCreateRoom(name, false);
});
document.getElementById('btn-browse').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  showScreen('browse');
  socket.emit('list-rooms');
});
document.getElementById('btn-join').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!code || code.length !== 4) return showToast('Enter a 4-letter room code!', 'error');
  emitJoinRoom(code, name);
});
document.getElementById('btn-rules').addEventListener('click', () => showScreen('rules'));
document.getElementById('btn-rules-back').addEventListener('click', () => showScreen('title'));
document.getElementById('btn-back').addEventListener('click', () => showScreen('title'));
document.getElementById('btn-refresh').addEventListener('click', () => socket.emit('list-rooms'));
document.getElementById('btn-start').addEventListener('click', () => emitStartGame());
document.getElementById('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-browse').click();
});
document.getElementById('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// Forfeit button
document.getElementById('btn-forfeit').addEventListener('click', () => {
  if (confirm('Are you sure you want to forfeit?')) {
    emitForfeit();
  }
});

// Toggle game log
document.getElementById('btn-toggle-log').addEventListener('click', () => {
  document.getElementById('action-log').classList.toggle('visible');
});

// Browse screen
function renderRoomList(rooms) {
  const container = document.getElementById('room-list');
  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<div class="room-list-empty">No public games found. Create one!</div>';
    return;
  }
  container.innerHTML = rooms.map(r => `
    <div class="room-item">
      <div class="room-item-info">
        <span class="room-item-host">${r.hostName}'s game</span>
        <span class="room-item-count">${r.playerCount}/${r.maxPlayers} players</span>
      </div>
      <button class="btn btn-primary btn-room-join" data-code="${r.code}">Join</button>
    </div>
  `).join('');
  container.querySelectorAll('.btn-room-join').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = document.getElementById('player-name').value.trim();
      if (!name) return showToast('Enter your name first!', 'error');
      emitJoinRoom(btn.dataset.code, name);
    });
  });
}

// Waiting room
function updateWaitingPlayers(players) {
  const list = document.getElementById('player-list');
  list.innerHTML = players.map(p => `
    <div class="player-item ${p.isHost ? 'host' : ''}">
      <img src="img/kitten.png" class="player-avatar" alt="">
      <span class="player-name-tag">${p.name}</span>
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
    </div>
  `).join('');
  const isHost = players.find(p => p.isHost && p.id === myId);
  document.getElementById('btn-start').style.display = isHost ? 'block' : 'none';
  document.getElementById('waiting-hint').textContent = isHost
    ? `${players.length} player${players.length !== 1 ? 's' : ''} - need at least 2`
    : 'Waiting for host to start...';
}

// Game board
function renderGameBoard() {
  renderOpponents();
  renderTableCenter();
  renderHand();
  renderTurnIndicator();
}

function renderOpponents() {
  const container = document.getElementById('opponents');
  const others = gameState.players.filter(p => p.id !== myId);
  container.innerHTML = others.map(p => {
    const name = gameState.playerNames[p.id] || 'Player';
    const isActive = p.id === gameState.currentPlayer;
    return `
      <div class="opponent ${isActive ? 'active-turn' : ''}" data-player-id="${p.id}">
        <img src="img/kitten.png" class="opponent-avatar-img" alt="">
        <div class="opponent-name">${name}</div>
        <div class="opponent-cards">${p.cardCount} cards</div>
      </div>
    `;
  }).join('');
}

function renderTableCenter() {
  // Draw pile
  const deckEl = document.getElementById('draw-pile');
  const isMyTurn = gameState.currentPlayer === myId;
  deckEl.className = `draw-pile ${isMyTurn ? 'my-turn' : ''}`;

  let drawLabel = 'Draw';
  if (isMyTurn && gameState.drawStack > 0) {
    drawLabel = `Draw ${gameState.drawStack}!`;
  }

  deckEl.innerHTML = `
    <div class="deck-stack">
      ${renderCardBack()}
      <div class="deck-count">${gameState.deckCount}</div>
    </div>
    ${isMyTurn ? `<div class="draw-hint">${drawLabel}</div>` : ''}
  `;

  // Discard pile
  const discardEl = document.getElementById('discard-pile');
  if (gameState.discardTop) {
    discardEl.innerHTML = renderCard(gameState.discardTop, { small: true });
  } else {
    discardEl.innerHTML = '<div class="discard-empty">Empty</div>';
  }

  // Active color indicator
  const colorEl = document.getElementById('active-color');
  if (gameState.activeColor) {
    const c = KITTY_COLORS[gameState.activeColor];
    colorEl.style.background = c ? c.border : '#999';
    colorEl.textContent = c ? c.name : '';
    colorEl.style.display = 'block';
  } else {
    colorEl.style.display = 'none';
  }

  // Direction indicator
  const dirEl = document.getElementById('direction-indicator');
  dirEl.textContent = gameState.direction === 1 ? '\u27F3' : '\u27F2';

  // Draw stack warning
  const stackEl = document.getElementById('draw-stack');
  if (gameState.drawStack > 0) {
    stackEl.textContent = `+${gameState.drawStack}`;
    stackEl.style.display = 'block';
  } else {
    stackEl.style.display = 'none';
  }
}

function renderHand() {
  const container = document.getElementById('hand');
  const isMyTurn = gameState.currentPlayer === myId;

  container.innerHTML = gameState.hand.map(card => {
    const playable = isMyTurn && gameState.playable.includes(card.id);
    return renderCard(card, { playable });
  }).join('');

  container.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => handleCardClick(parseInt(el.dataset.cardId)));
  });
}

function renderTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (gameState.currentPlayer === myId) {
    const extra = gameState.drawStack > 0
      ? `<span class="stack-warning">Stack +${gameState.drawStack} or draw!</span>`
      : '';
    el.innerHTML = `<span class="your-turn-text">Your Turn!</span>${extra}`;
    el.className = 'turn-indicator my-turn';
  } else {
    const name = gameState.playerNames[gameState.currentPlayer] || 'Player';
    el.innerHTML = `<span>${name}'s turn</span>`;
    el.className = 'turn-indicator';
  }
}

// Card interaction
function handleCardClick(cardId) {
  const card = gameState.hand.find(c => c.id === cardId);
  if (!card) return;
  if (gameState.currentPlayer !== myId) return showToast("Not your turn!", 'warning');
  if (!gameState.playable.includes(cardId)) return showToast("Can't play that card!", 'warning');

  // Wild cards need color picker (wild, wilddraw4, draw6, draw10)
  if (WILD_TYPES.includes(card.type)) {
    showColorPicker(cardId);
    return;
  }

  // Steal and Cat Nuke need target
  if (card.type === 'steal' || card.type === 'skipall') {
    showTargetPicker(cardId);
    return;
  }

  animateCardToDiscard(cardId).then(() => emitPlayCard(cardId));
}

function animateCardToDiscard(cardId) {
  return new Promise(resolve => {
    const cardEl = document.querySelector(`.card[data-card-id="${cardId}"]`);
    const discardEl = document.getElementById('discard-pile');
    if (!cardEl || !discardEl) return resolve();

    const cardRect = cardEl.getBoundingClientRect();
    const discardRect = discardEl.getBoundingClientRect();

    const clone = cardEl.cloneNode(true);
    clone.classList.add('card-flying');
    clone.style.position = 'fixed';
    clone.style.left = cardRect.left + 'px';
    clone.style.top = cardRect.top + 'px';
    clone.style.width = cardRect.width + 'px';
    clone.style.height = cardRect.height + 'px';
    clone.style.zIndex = '500';
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);

    // Hide original
    cardEl.style.opacity = '0';

    const dx = discardRect.left + (discardRect.width - cardRect.width) / 2 - cardRect.left;
    const dy = discardRect.top + (discardRect.height - cardRect.height) / 2 - cardRect.top;

    const anim = clone.animate([
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.75) rotate(${Math.random() > 0.5 ? 8 : -8}deg)`, opacity: 1 }
    ], { duration: 350, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });

    anim.onfinish = () => {
      clone.remove();
      resolve();
    };
  });
}

function showColorPicker(cardId) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content color-picker">
      <h3>Choose a color:</h3>
      <div class="color-buttons">
        <button class="btn-color btn-color-red" data-color="red">Red</button>
        <button class="btn-color btn-color-blue" data-color="blue">Blue</button>
        <button class="btn-color btn-color-green" data-color="green">Green</button>
        <button class="btn-color btn-color-yellow" data-color="yellow">Yellow</button>
      </div>
      <button class="btn btn-cancel" onclick="hideModal()">Cancel</button>
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('.btn-color').forEach(btn => {
    btn.addEventListener('click', () => {
      hideModal();
      animateCardToDiscard(cardId).then(() => emitPlayCard(cardId, btn.dataset.color));
    });
  });
}

function showTargetPicker(cardId) {
  const others = gameState.players.filter(p => p.id !== myId && p.cardCount > 0);
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content target-picker">
      <h3>Choose a target:</h3>
      ${others.map(p => `
        <button class="btn btn-target" data-target="${p.id}">
          <img src="img/kitten.png" class="target-avatar" alt=""> ${gameState.playerNames[p.id] || 'Player'}
        </button>
      `).join('')}
      <button class="btn btn-cancel" onclick="hideModal()">Cancel</button>
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('.btn-target').forEach(btn => {
    btn.addEventListener('click', () => {
      hideModal();
      animateCardToDiscard(cardId).then(() => emitPlayCard(cardId, null, btn.dataset.target));
    });
  });
}

// Draw pile click
document.getElementById('draw-pile').addEventListener('click', () => {
  if (gameState.currentPlayer !== myId) return showToast("Not your turn!", 'warning');
  emitDrawCard();
});

function hideModal() {
  document.getElementById('modal').classList.remove('active');
}

// Toast
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
  // Keep log short
  while (log.children.length > 30) log.removeChild(log.firstChild);
}

// Deal animation — cards fly from deck to hand one by one
function playDealAnimation(cards) {
  return new Promise(resolve => {
    const deckEl = document.getElementById('draw-pile');
    const handEl = document.getElementById('hand');
    if (!deckEl || !handEl) return resolve();

    // Shuffle wobble first
    const deckStack = deckEl.querySelector('.deck-stack') || deckEl;
    deckStack.classList.add('shuffle-anim');

    setTimeout(() => {
      deckStack.classList.remove('shuffle-anim');

      let dealt = 0;
      const dealNext = () => {
        if (dealt >= cards.length) {
          setTimeout(resolve, 200);
          return;
        }

        const deckRect = deckEl.getBoundingClientRect();

        // Pre-add the card to hand (hidden) so we can measure its landing position
        gameState.hand.push(cards[dealt]);
        const cardHtml = renderCard(cards[dealt], {});
        const temp = document.createElement('div');
        temp.innerHTML = cardHtml;
        const cardNode = temp.firstElementChild;
        cardNode.style.opacity = '0';
        handEl.appendChild(cardNode);

        // Measure where the card landed in the hand
        const targetRect = cardNode.getBoundingClientRect();

        // Create flying card back starting at deck position
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderCardBack();
        const flyCard = wrapper.firstElementChild;
        flyCard.classList.add('deal-flying');
        flyCard.style.position = 'fixed';
        flyCard.style.left = (deckRect.left + deckRect.width / 2 - targetRect.width / 2) + 'px';
        flyCard.style.top = (deckRect.top + deckRect.height / 2 - targetRect.height / 2) + 'px';
        flyCard.style.width = targetRect.width + 'px';
        flyCard.style.height = targetRect.height + 'px';
        flyCard.style.zIndex = '500';
        flyCard.style.pointerEvents = 'none';
        document.body.appendChild(flyCard);

        const dx = targetRect.left - parseFloat(flyCard.style.left);
        const dy = targetRect.top - parseFloat(flyCard.style.top);

        const anim = flyCard.animate([
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(${dx}px, ${dy}px) scale(1)` }
        ], { duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });

        anim.onfinish = () => {
          flyCard.remove();
          cardNode.style.opacity = '1';
        };

        dealt++;
        setTimeout(dealNext, 180);
      };

      dealNext();
    }, 700);
  });
}

// Animations
function triggerScreenShake() {
  document.getElementById('screen-game').classList.add('shake');
  setTimeout(() => document.getElementById('screen-game').classList.remove('shake'), 500);
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

// Copy room code
document.getElementById('room-code-display')?.addEventListener('click', function () {
  navigator.clipboard.writeText(this.textContent);
  showToast('Room code copied!', 'success');
});

showScreen('title');
