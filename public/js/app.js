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
  drawStackLocked: false,
  activeColor: null,
  discardTop: null,
  gameMode: 'ffa',
  teams: null,
  teamNames: null
};

function getMyTeam() {
  if (!gameState.teams) return -1;
  if (gameState.teams[0].includes(myId)) return 0;
  if (gameState.teams[1].includes(myId)) return 1;
  return -1;
}

function isTeammate(playerId) {
  if (!gameState.teams) return false;
  const myTeam = getMyTeam();
  if (myTeam === -1) return false;
  return gameState.teams[myTeam].includes(playerId);
}

const WILD_TYPES = ['wild', 'wilddraw4', 'draw6', 'draw10', 'wildskip', 'wildreverse', 'wilddraw2', 'madmittens'];

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

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
document.getElementById('btn-leave-room').addEventListener('click', () => {
  socket.emit('leave-room');
  showScreen('title');
});
document.getElementById('btn-rules').addEventListener('click', () => showScreen('rules'));
document.getElementById('btn-rules-back').addEventListener('click', () => showScreen('title'));
document.getElementById('btn-back').addEventListener('click', () => showScreen('title'));
document.getElementById('btn-refresh').addEventListener('click', () => socket.emit('list-rooms'));
document.getElementById('btn-start').addEventListener('click', () => emitStartGame());
document.getElementById('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-browse').click();
});
// Register name on blur so others can see this player
document.getElementById('player-name').addEventListener('blur', () => {
  const name = document.getElementById('player-name').value.trim();
  if (name) {
    localStorage.setItem('kc-name', name);
    socket.emit('set-name', { name });
  }
});
document.getElementById('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// Mute button
document.getElementById('btn-mute').addEventListener('click', () => {
  const muted = AudioManager.toggleMute();
  updateMuteIcon(muted);
});

function updateMuteIcon(muted) {
  document.getElementById('mute-icon').innerHTML = muted
    ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
    : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
}
// Set initial mute icon
if (AudioManager.muted) updateMuteIcon(true);

// Forfeit button
document.getElementById('btn-forfeit').addEventListener('click', () => {
  if (confirm('Are you sure you want to forfeit?')) {
    emitForfeit();
  }
});

// Toggle game log
document.getElementById('btn-toggle-log').addEventListener('click', () => {
  document.getElementById('action-log').classList.toggle('visible');
  document.getElementById('chat-box').classList.remove('visible');
});

// Toggle chat
document.getElementById('btn-toggle-chat').addEventListener('click', () => {
  const chatBox = document.getElementById('chat-box');
  chatBox.classList.toggle('visible');
  document.getElementById('action-log').classList.remove('visible');
  // Clear unread badge
  document.getElementById('chat-unread').style.display = 'none';
  if (chatBox.classList.contains('visible')) {
    document.getElementById('chat-input').focus();
  }
});

// Send chat
document.getElementById('btn-chat-send').addEventListener('click', () => {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  emitChatMessage(text);
  input.value = '';
});
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-chat-send').click();
});

// Invite players panel in waiting room
document.getElementById('btn-invite-players').addEventListener('click', () => {
  const panel = document.getElementById('invite-panel');
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) socket.emit('list-players');
});
document.getElementById('btn-players-refresh').addEventListener('click', () => {
  socket.emit('list-players');
});

function renderInvitePlayerList(players) {
  const container = document.getElementById('online-player-list');
  if (!players || players.length === 0) {
    container.innerHTML = '<div class="invite-empty">No other players online right now.</div>';
    return;
  }
  container.innerHTML = players.map(p => {
    const statusLabel = p.status === 'in-game' ? 'In Game' : p.status === 'in-lobby' ? 'In Lobby' : 'Online';
    const statusClass = p.status === 'in-game' ? 'status-ingame' : p.status === 'in-lobby' ? 'status-lobby' : 'status-online';
    const canInvite = p.status !== 'in-game';
    return `
      <div class="invite-player-row">
        <img src="img/kitten.png" class="invite-player-avatar" alt="">
        <span class="invite-player-name">${esc(p.name)}</span>
        <span class="invite-player-status ${statusClass}">${statusLabel}</span>
        ${canInvite
          ? `<button class="btn btn-primary btn-invite-send" data-target="${p.id}">Invite</button>`
          : `<span class="invite-unavailable">Busy</span>`
        }
      </div>
    `;
  }).join('');
  container.querySelectorAll('.btn-invite-send').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = document.getElementById('player-name').value.trim();
      if (!name) return showToast('Enter your name first!', 'error');
      socket.emit('send-invite', { targetId: btn.dataset.target });
      btn.textContent = 'Sent';
      btn.disabled = true;
    });
  });
}

let inviteTimerId = null;
function showInviteModal(fromName, roomCode) {
  if (inviteTimerId) clearTimeout(inviteTimerId);
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content invite-modal">
      <img src="img/kitten.png" class="invite-modal-avatar" alt="">
      <h3>${esc(fromName)} wants to play!</h3>
      <div class="invite-modal-actions">
        <button class="btn btn-primary btn-invite-accept">Join Game</button>
        <button class="btn btn-muted btn-invite-decline">Decline</button>
      </div>
    </div>
  `;
  modal.classList.add('active');
  modal.querySelector('.btn-invite-accept').addEventListener('click', () => {
    hideModal();
    const name = localStorage.getItem('kc-name') || document.getElementById('player-name').value.trim();
    if (!name) {
      showToast('Enter your name first!', 'error');
      return;
    }
    emitJoinRoom(roomCode, name);
  });
  modal.querySelector('.btn-invite-decline').addEventListener('click', () => {
    hideModal();
  });
  inviteTimerId = setTimeout(() => {
    inviteTimerId = null;
    if (modal.classList.contains('active') && modal.querySelector('.invite-modal')) {
      hideModal();
    }
  }, 15000);
}

// Rematch button
document.getElementById('btn-rematch').addEventListener('click', () => {
  emitRematchRequest();
  document.getElementById('btn-rematch').disabled = true;
  document.getElementById('btn-rematch').textContent = 'Waiting...';
});

// Leave button on gameover screen
document.getElementById('btn-leave').addEventListener('click', () => {
  emitRematchDecline();
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
        <span class="room-item-host">${esc(r.hostName)}'s game</span>
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
let _waitingPlayers = [];

function updateWaitingPlayers(players) {
  _waitingPlayers = players;
  const isHost = players.find(p => p.isHost && p.id === myId);

  // Show mode toggle for host
  document.getElementById('game-mode-toggle').style.display = isHost ? 'flex' : 'none';
  updateModeButtons();

  if (currentRoomMode === 'teams' && currentRoomTeams) {
    document.getElementById('player-list').style.display = 'none';
    document.getElementById('teams-display').style.display = 'flex';
    renderTeamColumns(players, currentRoomTeams, !!isHost);
  } else {
    document.getElementById('player-list').style.display = 'flex';
    document.getElementById('teams-display').style.display = 'none';
    const list = document.getElementById('player-list');
    list.innerHTML = players.map(p => `
      <div class="player-item ${p.isHost ? 'host' : ''}">
        <img src="img/kitten.png" class="player-avatar" alt="">
        <span class="player-name-tag">${esc(p.name)}</span>
        ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      </div>
    `).join('');
  }

  document.getElementById('btn-start').style.display = isHost ? 'block' : 'none';
  const minPlayers = currentRoomMode === 'teams' ? 2 : 2;
  document.getElementById('waiting-hint').textContent = isHost
    ? `${players.length} player${players.length !== 1 ? 's' : ''} - need at least ${minPlayers}`
    : 'Waiting for host to start...';
}

function updateModeButtons() {
  document.getElementById('btn-mode-ffa').classList.toggle('active', currentRoomMode === 'ffa');
  document.getElementById('btn-mode-teams').classList.toggle('active', currentRoomMode === 'teams');
}

function updateWaitingModeUI() {
  updateModeButtons();
  if (_waitingPlayers.length > 0) updateWaitingPlayers(_waitingPlayers);
}

function renderTeamColumns(players, teams, isHost) {
  const TEAM_NAMES = ['Paws', 'Claws'];
  for (let t = 0; t < 2; t++) {
    const container = document.getElementById(`team-${t}-players`);
    const teamIds = teams[t] || [];
    const teamPlayers = teamIds.map(id => players.find(p => p.id === id)).filter(Boolean);
    container.innerHTML = teamPlayers.map(p => `
      <div class="team-player-item ${isHost ? 'swappable' : ''}" data-player-id="${p.id}">
        <img src="img/kitten.png" class="player-avatar" alt="">
        <span class="player-name-tag">${esc(p.name)}</span>
        ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      </div>
    `).join('') || '<div class="team-players-empty">Empty</div>';
    if (isHost) {
      container.querySelectorAll('.swappable').forEach(el => {
        el.addEventListener('click', () => {
          socket.emit('swap-team', { playerId: el.dataset.playerId });
        });
      });
    }
  }
}

// Game mode toggle
document.getElementById('btn-mode-ffa').addEventListener('click', () => {
  if (currentRoomMode === 'ffa') return;
  socket.emit('set-game-mode', { mode: 'ffa' });
});
document.getElementById('btn-mode-teams').addEventListener('click', () => {
  if (currentRoomMode === 'teams') return;
  socket.emit('set-game-mode', { mode: 'teams' });
});

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
    const name = esc(gameState.playerNames[p.id] || 'Player');
    const isActive = p.id === gameState.currentPlayer;
    let teamClass = '';
    let teamBadge = '';
    if (gameState.teams) {
      const ally = isTeammate(p.id);
      teamClass = ally ? 'team-ally' : 'team-enemy';
      teamBadge = ally
        ? '<span class="team-badge team-badge-ally">ALLY</span>'
        : '<span class="team-badge team-badge-enemy">FOE</span>';
    }
    return `
      <div class="opponent ${isActive ? 'active-turn' : ''} ${teamClass}" data-player-id="${p.id}">
        ${teamBadge}
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
    stackEl.textContent = gameState.drawStackLocked ? `+${gameState.drawStack} LOCKED` : `+${gameState.drawStack}`;
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
    let extra = '';
    if (gameState.drawStack > 0 && gameState.drawStackLocked) {
      extra = `<span class="stack-warning locked">MUST draw +${gameState.drawStack}!</span>`;
    } else if (gameState.drawStack > 0) {
      extra = `<span class="stack-warning">Stack +${gameState.drawStack} or draw!</span>`;
    }
    el.innerHTML = `<span class="your-turn-text">Your Turn!</span>${extra}`;
    el.className = 'turn-indicator my-turn';
  } else {
    const name = esc(gameState.playerNames[gameState.currentPlayer] || 'Player');
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

  // Snuggles needs action card picker
  if (card.type === 'snuggles') {
    showActionPicker(cardId);
    return;
  }

  // Tiggy Wiggy — just play it, server sends back peek cards
  if (card.type === 'tiggywiggy') {
    animateCardToDiscard(cardId).then(() => emitPlayCard(cardId));
    return;
  }

  // Sweet Calli needs target then card pick
  if (card.type === 'sweetcalli') {
    showSweetCalliTargetPicker(cardId);
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

    AudioManager.play('card-slide');

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
  let others = gameState.players.filter(p => p.id !== myId && p.cardCount > 0);
  if (gameState.teams) others = others.filter(p => !isTeammate(p.id));
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content target-picker">
      <h3>Choose a target:</h3>
      ${others.map(p => `
        <button class="btn btn-target" data-target="${p.id}">
          <img src="img/kitten.png" class="target-avatar" alt=""> ${esc(gameState.playerNames[p.id] || 'Player')}
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

function showActionPicker(cardId) {
  const actionTypes = Object.keys(RARE_DEFS).filter(t => t !== 'snuggles');
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content action-picker">
      <h3>Choose an action card to receive:</h3>
      <div class="action-picker-grid">
        ${actionTypes.map(type => {
          const def = RARE_DEFS[type];
          return `<button class="btn-action-pick" data-action="${type}">
            <img src="${def.img}" alt="${def.name}">
            <span>${def.name}</span>
          </button>`;
        }).join('')}
      </div>
      <button class="btn btn-cancel" onclick="hideModal()">Cancel</button>
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('.btn-action-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      hideModal();
      animateCardToDiscard(cardId).then(() => emitPlayCard(cardId, null, null, btn.dataset.action));
    });
  });
}

// Sweet Calli — pick target, then peek at their hand and pick a card
function showSweetCalliTargetPicker(cardId) {
  let others = gameState.players.filter(p => p.id !== myId && p.cardCount > 0);
  if (gameState.teams) others = others.filter(p => !isTeammate(p.id));
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content target-picker">
      <h3>Sweet Calli — Choose who to peek at:</h3>
      ${others.map(p => `
        <button class="btn btn-target" data-target="${p.id}">
          <img src="img/kitten.png" class="target-avatar" alt=""> ${esc(gameState.playerNames[p.id] || 'Player')}
        </button>
      `).join('')}
      <button class="btn btn-cancel" onclick="hideModal()">Cancel</button>
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('.btn-target').forEach(btn => {
    btn.addEventListener('click', () => {
      hideModal();
      // Request to peek at target's hand
      window._sweetCalliCardId = cardId;
      window._sweetCalliTarget = btn.dataset.target;
      socket.emit('sweetcalli-peek', { targetPlayer: btn.dataset.target });
    });
  });
}

function showSweetCalliCardPicker(targetHand) {
  const modal = document.getElementById('modal');
  const targetName = esc(gameState.playerNames[window._sweetCalliTarget] || 'Player');
  modal.innerHTML = `
    <div class="modal-content sweetcalli-picker">
      <h3>Steal a card from ${targetName}:</h3>
      <div class="sweetcalli-hand">
        ${targetHand.map(card => renderCard(card, { small: true })).join('')}
      </div>
      <button class="btn btn-cancel" onclick="hideModal()">Cancel</button>
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('.sweetcalli-hand .card').forEach(cardEl => {
    cardEl.style.cursor = 'pointer';
    cardEl.addEventListener('click', () => {
      const stolenId = parseInt(cardEl.dataset.cardId);
      hideModal();
      animateCardToDiscard(window._sweetCalliCardId).then(() => {
        emitPlayCard(window._sweetCalliCardId, null, window._sweetCalliTarget, null, stolenId);
      });
    });
  });
}

// Tiggy Wiggy — peek at deck and choose a card
function showTiggyWiggyPicker(cards) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content tiggywiggy-picker">
      <h3>Tiggy Wiggy — Pick a card from the deck:</h3>
      <div class="tiggywiggy-hand">
        ${cards.map(card => renderCard(card, { small: true })).join('')}
      </div>
      <button class="btn btn-cancel" onclick="hideModal()">Cancel</button>
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('.tiggywiggy-hand .card').forEach(cardEl => {
    cardEl.style.cursor = 'pointer';
    cardEl.addEventListener('click', () => {
      const chosenId = parseInt(cardEl.dataset.cardId);
      hideModal();
      socket.emit('tiggywiggy-pick', { chosenCardId: chosenId });
      AudioManager.play('card-draw');
    });
  });
}

// Draw pile click
document.getElementById('draw-pile').addEventListener('click', () => {
  if (gameState.currentPlayer !== myId) return showToast("Not your turn!", 'warning');
  playDrawAnimation();
  emitDrawCard();
});

// Animate a card flying from deck to hand area
function playDrawAnimation() {
  const deckEl = document.getElementById('draw-pile');
  const handEl = document.getElementById('hand');
  if (!deckEl || !handEl) return;

  const deckRect = deckEl.getBoundingClientRect();
  const handRect = handEl.getBoundingClientRect();

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderCardBack();
  const flyCard = wrapper.firstElementChild;
  flyCard.style.position = 'fixed';
  flyCard.style.left = (deckRect.left + deckRect.width / 2 - 40) + 'px';
  flyCard.style.top = (deckRect.top + deckRect.height / 2 - 55) + 'px';
  flyCard.style.width = '80px';
  flyCard.style.height = '110px';
  flyCard.style.zIndex = '500';
  flyCard.style.pointerEvents = 'none';
  document.body.appendChild(flyCard);

  const targetX = handRect.left + handRect.width / 2 - 40;
  const targetY = handRect.top;
  const dx = targetX - parseFloat(flyCard.style.left);
  const dy = targetY - parseFloat(flyCard.style.top);

  AudioManager.play('card-flip');

  const anim = flyCard.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0.5 }
  ], { duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });

  anim.onfinish = () => flyCard.remove();
}

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

        if (dealt % 3 === 0) AudioManager.play('card-flip');
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

// Chat message rendering
function addChatMessage(name, text, isMe) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `chat-msg ${isMe ? 'chat-msg-me' : ''}`;
  const nameEl = document.createElement('span');
  nameEl.className = 'chat-msg-name';
  nameEl.textContent = name;
  const textEl = document.createElement('span');
  textEl.className = 'chat-msg-text';
  textEl.textContent = text;
  msg.appendChild(nameEl);
  msg.appendChild(textEl);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  while (container.children.length > 50) container.removeChild(container.firstChild);

  // Show unread badge if chat is not open
  const chatBox = document.getElementById('chat-box');
  if (!chatBox.classList.contains('visible') && !isMe) {
    const badge = document.getElementById('chat-unread');
    badge.style.display = 'block';
  }
}

// Copy room code
document.getElementById('room-code-display')?.addEventListener('click', function () {
  navigator.clipboard.writeText(this.textContent);
  showToast('Room code copied!', 'success');
});

// Invite link
function getInviteLink() {
  const code = document.getElementById('room-code-display').textContent;
  return `${location.origin}${location.pathname}?join=${code}`;
}

document.getElementById('btn-copy-link').addEventListener('click', () => {
  navigator.clipboard.writeText(getInviteLink()).then(() => {
    showToast('Invite link copied!', 'success');
  });
});

// Auto-join from invite link
const urlParams = new URLSearchParams(location.search);
const joinCode = urlParams.get('join');
if (joinCode) {
  document.getElementById('join-code').value = joinCode.toUpperCase();
  // Clean URL without reloading
  history.replaceState(null, '', location.pathname);
  showToast(`Room code ${joinCode.toUpperCase()} ready - enter your name and click Join!`, 'info');
}

// Populate rules screen with actual card renders
(function populateRules() {
  // Number cards — one per color
  const numContainer = document.getElementById('rules-number-cards');
  if (numContainer) {
    const colors = ['red', 'blue', 'green', 'yellow'];
    const nums = [0, 3, 7];
    numContainer.innerHTML = colors.map((color, i) =>
      `<div class="rule-card-entry">${renderKittyCard({ id: 900 + i, type: 'kitty', color, number: nums[i % nums.length] }, { small: true })}</div>`
    ).join('');
  }

  // Special cards
  const specialContainer = document.getElementById('rules-special-cards');
  if (specialContainer) {
    const specials = [
      { type: 'skip', color: 'red' },
      { type: 'reverse', color: 'blue' },
      { type: 'draw2', color: 'green' },
      { type: 'discardall', color: 'yellow' },
      { type: 'wild' },
      { type: 'wildskip' },
      { type: 'wildreverse' },
      { type: 'wilddraw2' },
      { type: 'wilddraw4' },
      { type: 'draw6' },
      { type: 'draw10' },
      { type: 'steal' },
      { type: 'skipall' },
      { type: 'nope' },
      { type: 'madmittens' },
      { type: 'purr' },
      { type: 'snuggles' },
    ];
    specialContainer.innerHTML = specials.map((card, i) => {
      const c = { id: 950 + i, ...card };
      const def = RARE_DEFS[card.type];
      return `<div class="rule-card-entry">
        ${renderCard(c, { small: true })}
        <div class="rule-card-info"><strong>${def.name}</strong><span>${def.desc}</span></div>
      </div>`;
    }).join('');
  }
})();

// Catto UI (like UNO call) — sits in the bottom controls bar
let cattoTimer = null;

function showCattoButton() {
  hideCattoUI();
  const controls = document.querySelector('.game-bottom-controls');
  const btn = document.createElement('button');
  btn.className = 'btn-catto';
  btn.id = 'btn-catto';
  btn.textContent = 'Catto!';
  btn.addEventListener('click', () => {
    emitCattoCall();
    hideCattoUI();
    AudioManager.play('bell-ding');
  });
  controls.prepend(btn);
  if (cattoTimer) clearTimeout(cattoTimer);
  cattoTimer = setTimeout(hideCattoUI, 5500);
}

function showCattoChallenge(playerId, playerName) {
  hideCattoUI();
  const controls = document.querySelector('.game-bottom-controls');
  const btn = document.createElement('button');
  btn.className = 'btn-catto';
  btn.id = 'btn-catto';
  btn.textContent = 'Catch!';
  btn.addEventListener('click', () => {
    emitCattoChallenge(playerId);
    hideCattoUI();
  });
  controls.prepend(btn);
  if (cattoTimer) clearTimeout(cattoTimer);
  cattoTimer = setTimeout(hideCattoUI, 5500);
}

function hideCattoUI() {
  const btn = document.getElementById('btn-catto');
  if (btn) btn.remove();
  if (cattoTimer) { clearTimeout(cattoTimer); cattoTimer = null; }
}

showScreen('title');
