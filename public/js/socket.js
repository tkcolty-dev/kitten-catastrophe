const socket = io({
  transports: ['polling', 'websocket'],
  upgrade: true,
  rememberUpgrade: false,
  pingTimeout: 30000,
});

let myId = null;
let roomCode = null;
let currentRoomMode = 'ffa';
let currentRoomTeams = null;

// Session token for reconnection
let sessionToken = localStorage.getItem('kc-session');
if (!sessionToken) {
  sessionToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem('kc-session', sessionToken);
}

socket.on('connect', () => {
  myId = socket.id;
  const name = localStorage.getItem('kc-name');
  socket.emit('register-session', { sessionToken, playerName: name || null });
  // Register name so other players can see us
  if (name) socket.emit('set-name', { name });

  // Auto-rejoin: if we were in a game before refresh/close, the register-session
  // handler on the server will automatically send game-rejoined or game-over
  // which will restore the correct screen. Show a brief loading state.
  const wasInGame = localStorage.getItem('kc-in-game');
  const savedRoom = localStorage.getItem('kc-room');
  if (wasInGame && savedRoom && gameState.screen === 'title') {
    showToast('Reconnecting to game...', 'info');
    // If we don't get a game-rejoined within 5s, clear the state
    setTimeout(() => {
      if (gameState.screen === 'title') {
        localStorage.removeItem('kc-in-game');
        localStorage.removeItem('kc-room');
      }
    }, 5000);
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});

// Handle device sleep/wake — force reconnect on visibility restore
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Device woke up or tab became visible
    if (!socket.connected) {
      console.log('Page visible again, reconnecting...');
      socket.connect();
    } else {
      // Socket thinks it's connected but may be stale — ping to verify
      socket.emit('heartbeat', {}, (response) => {
        // If no response within 3s, force reconnect
      });
      setTimeout(() => {
        if (!socket.connected) {
          socket.connect();
        }
      }, 3000);
    }
  }
});

// Periodic heartbeat to detect stale connections
setInterval(() => {
  if (socket.connected && gameState.screen === 'game') {
    socket.volatile.emit('heartbeat');
  }
}, 15000);

socket.on('error-msg', ({ message }) => {
  showToast(message, 'error');
});

socket.on('room-created', ({ code, isPublic }) => {
  roomCode = code;
  currentRoomMode = 'ffa';
  currentRoomTeams = null;
  localStorage.setItem('kc-room', code);
  localStorage.setItem('kc-name', document.getElementById('player-name').value.trim());
  showScreen('waiting');
  document.getElementById('room-code-display').textContent = code;
  const badge = document.getElementById('room-type-badge');
  badge.textContent = isPublic ? 'PUBLIC' : 'PRIVATE';
  badge.className = 'room-type-badge ' + (isPublic ? 'badge-public' : 'badge-private');
});

socket.on('room-list', ({ rooms }) => {
  renderRoomList(rooms);
});

socket.on('room-joined', ({ code, players, gameMode, teams, settings }) => {
  roomCode = code;
  localStorage.setItem('kc-room', code);
  localStorage.setItem('kc-name', document.getElementById('player-name').value.trim());
  showScreen('waiting');
  document.getElementById('room-code-display').textContent = code;
  currentRoomMode = gameMode || 'ffa';
  currentRoomTeams = teams || null;
  if (settings) {
    document.getElementById('chk-end-on-win').checked = settings.endOnWin || false;
    document.getElementById('sel-game-timer').value = String(settings.gameTimer || 0);
  }
  updateWaitingPlayers(players);
});

socket.on('player-joined', ({ players, gameMode, teams }) => {
  if (gameMode !== undefined) currentRoomMode = gameMode;
  if (teams !== undefined) currentRoomTeams = teams;
  updateWaitingPlayers(players);
});

socket.on('player-left', ({ players, teams }) => {
  if (teams !== undefined) currentRoomTeams = teams;
  updateWaitingPlayers(players);
});

socket.on('game-mode-changed', ({ mode, teams }) => {
  currentRoomMode = mode;
  currentRoomTeams = teams;
  updateWaitingModeUI();
});

socket.on('teams-updated', ({ teams }) => {
  currentRoomTeams = teams;
  updateWaitingModeUI();
});

socket.on('settings-changed', ({ endOnWin, gameTimer }) => {
  document.getElementById('chk-end-on-win').checked = endOnWin || false;
  document.getElementById('sel-game-timer').value = String(gameTimer || 0);
});

socket.on('game-started', ({ hand, playable, publicState, playerNames, myId: id, gameMode, teams, teamNames, settings }) => {
  myId = id;
  hideModal();
  clearConfetti();
  gameState.playerNames = playerNames || {};
  gameState.direction = publicState.direction;
  gameState.drawStack = publicState.drawStack;
  gameState.drawStackLocked = publicState.drawStackLocked || false;
  gameState.activeColor = publicState.activeColor;
  gameState.discardTop = publicState.discardTop;
  gameState.deckCount = publicState.deckCount;
  gameState.players = publicState.players;
  gameState.currentPlayer = publicState.currentPlayer;
  gameState.gameMode = gameMode || 'ffa';
  gameState.teams = teams || null;
  gameState.teamNames = teamNames || null;
  gameState.settings = settings || { endOnWin: false, gameTimer: 0, gameTimerEnd: 0 };
  gameState.hand = [];
  gameState.playable = [];
  gameState.screen = 'game';
  showScreen('game');
  renderGameBoard();

  // Start game timer if enabled
  if (gameState.settings.gameTimerEnd > 0) {
    startGameTimer(gameState.settings.gameTimerEnd);
  }

  // Save session state for recovery
  localStorage.setItem('kc-room', roomCode);
  localStorage.setItem('kc-in-game', 'true');

  // Init audio on first user interaction (game start) and start music
  AudioManager.init();
  AudioManager.play('card-shuffle');
  AudioManager.startMusic();

  playDealAnimation(hand).then(() => {
    gameState.playable = playable || [];
    renderHand();
  });
});

socket.on('game-rejoined', ({ hand, playable, publicState, playerNames, myId: id, roomCode: code, gameMode, teams, teamNames, settings }) => {
  myId = id;
  roomCode = code;
  hideModal();
  clearConfetti();
  gameState.hand = hand;
  gameState.playable = playable || [];
  gameState.playerNames = playerNames || {};
  gameState.direction = publicState.direction;
  gameState.drawStack = publicState.drawStack;
  gameState.drawStackLocked = publicState.drawStackLocked || false;
  gameState.activeColor = publicState.activeColor;
  gameState.discardTop = publicState.discardTop;
  gameState.deckCount = publicState.deckCount;
  gameState.players = publicState.players;
  gameState.currentPlayer = publicState.currentPlayer;
  gameState.gameMode = gameMode || 'ffa';
  gameState.teams = teams || null;
  gameState.teamNames = teamNames || null;
  gameState.settings = settings || { endOnWin: false, gameTimer: 0, gameTimerEnd: 0 };
  gameState.screen = 'game';
  showScreen('game');
  renderGameBoard();

  // Restore game timer if active
  if (gameState.settings.gameTimerEnd > 0) {
    startGameTimer(gameState.settings.gameTimerEnd);
  }

  AudioManager.init();
  AudioManager.startMusic();
  showToast('Reconnected!', 'success');
});

socket.on('turn-changed', ({ currentPlayer, currentPlayerName, direction, drawStack, activeColor, drawStackLocked }) => {
  gameState.currentPlayer = currentPlayer;
  gameState.direction = direction;
  gameState.drawStack = drawStack;
  gameState.drawStackLocked = drawStackLocked || false;
  gameState.activeColor = activeColor;
  renderGameBoard();
  if (currentPlayer === myId) {
    if (drawStack > 0 && drawStackLocked) {
      showToast(`Mad Mittens! You MUST draw ${drawStack} cards!`, 'error');
    } else if (drawStack > 0) {
      showToast(`Your turn! Stack or draw ${drawStack} cards!`, 'warning');
    } else {
      showToast("Your turn! Play a card or draw.", 'info');
    }
  }
});

socket.on('playable-cards', ({ playable }) => {
  gameState.playable = playable || [];
  renderHand();
});

socket.on('card-played', ({ playerName, card, chosenColor, targetName }) => {
  const def = getCardDef(card);
  let name = card.type === 'kitty'
    ? `${KITTY_COLORS[card.color]?.name || ''} ${card.number}`
    : (def?.name || card.type);
  let msg = `${playerName} played ${name}`;
  if (chosenColor) msg += ` (chose ${chosenColor})`;
  if (targetName) msg += ` on ${targetName}`;
  addToLog(msg);
});

socket.on('card-drawn', ({ card }) => {
  const def = getCardDef(card);
  const name = card.type === 'kitty'
    ? `${KITTY_COLORS[card.color]?.name || ''} ${card.number}`
    : (def?.name || card.type);
  addToLog(`You drew ${name}`);
});

socket.on('hand-updated', ({ hand }) => {
  gameState.hand = hand;
  renderHand();
});

socket.on('state-update', (state) => {
  gameState.deckCount = state.deckCount;
  gameState.players = state.players;
  gameState.discardTop = state.discardTop;
  gameState.direction = state.direction;
  gameState.drawStack = state.drawStack;
  gameState.drawStackLocked = state.drawStackLocked || false;
  gameState.activeColor = state.activeColor;
  gameState.currentPlayer = state.currentPlayer;
  renderGameBoard();
});

socket.on('direction-changed', ({ direction }) => {
  gameState.direction = direction;
  addToLog(`Direction reversed!`, 'warning');
  renderGameBoard();
});

socket.on('stack-cancelled', ({ by, amount }) => {
  addToLog(`${by} cancelled the draw ${amount} stack!`, 'success');
  AudioManager.play('cat-hiss');
});

socket.on('madmittens-played', ({ by, hissedAmount }) => {
  addToLog(`${by} played Mad Mittens! Hissed +${hissedAmount}, now +2 (locked)!`, 'danger');
  AudioManager.play('cat-hiss');
  triggerScreenShake();
});

socket.on('sweetcalli-hand', ({ targetPlayer, hand }) => {
  showSweetCalliCardPicker(hand);
});

socket.on('sweetcalli-played', ({ by, target }) => {
  addToLog(`${by} used Sweet Calli to peek & steal from ${target}!`, 'danger');
  AudioManager.play('card-play');
});

socket.on('tiggywiggy-peek', ({ cards }) => {
  showTiggyWiggyPicker(cards);
});

socket.on('tiggywiggy-played', ({ by }) => {
  addToLog(`${by} played Tiggy Wiggy and peeked at the deck!`, 'warning');
  AudioManager.play('card-flip');
});

socket.on('player-finished', ({ player, playerName, place }) => {
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  if (player === myId) {
    showAnnouncement(`You finished ${place}${suffix}!`, 'finish', 3000);
    AudioManager.play('bell-ding');
  } else {
    showAnnouncement(`${playerName} finished ${place}${suffix}!`, 'finish', 2500);
  }
  addToLog(`${playerName} finished ${place}${suffix}!`, 'success');
});

socket.on('player-eliminated', ({ player, playerName, reason }) => {
  const reasons = {
    'hand-limit': `${playerName} was eliminated (too many cards!)`,
    'forfeit': `${playerName} forfeited!`,
    'disconnect': `${playerName} disconnected!`,
    'timer': `${playerName} eliminated (timer expired!)`
  };
  const msg = reasons[reason] || `${playerName} was eliminated!`;
  addToLog(msg, 'danger');
  showAnnouncement(msg, 'caught', 2500);
  if (player === myId && reason === 'hand-limit') {
    showToast('You have too many cards! Eliminated!', 'error');
  }
});

socket.on('skip-all', ({ playerName, targetName }) => {
  addToLog(`${playerName} swapped hands with ${targetName} and skipped everyone!`, 'warning');
  AudioManager.play('card-shuffle');
});

socket.on('purr-played', ({ playerName, count }) => {
  addToLog(`${playerName} is purring! Gave ${count} player${count !== 1 ? 's' : ''} a card!`, 'warning');
  AudioManager.play('card-play');
});

socket.on('snuggles-played', ({ playerName, chosenAction }) => {
  const def = RARE_DEFS[chosenAction];
  const actionName = def ? def.name : chosenAction;
  addToLog(`${playerName} played Cpt H Snuggles and chose ${actionName}! Skipping everyone!`, 'warning');
  AudioManager.play('bell-ding');
  triggerScreenShake();
});

socket.on('cards-discarded', ({ playerName, count, color }) => {
  addToLog(`${playerName} purged ${count} ${color} cards!`, 'warning');
});

socket.on('card-stolen', ({ by }) => {
  addToLog(`${by} stole a card from you!`, 'danger');
  AudioManager.play('card-flip');
});

socket.on('card-received', ({ card }) => {
  const def = getCardDef(card);
  const name = card.type === 'kitty'
    ? `${KITTY_COLORS[card.color]?.name || ''} ${card.number}`
    : (def?.name || card.type);
  addToLog(`You received: ${name}`);
});

socket.on('forfeited', () => {
  localStorage.removeItem('kc-room');
  localStorage.removeItem('kc-in-game');
  stopGameTimer();
  hideModal();
  clearConfetti();
  AudioManager.stopMusic();
  showScreen('title');
  showToast('You forfeited the game.', 'warning');
});

socket.on('game-timer-expired', () => {
  showAnnouncement('Time\'s up!', 'timer-warn', 3000);
  AudioManager.play('cat-hiss');
});

socket.on('game-over', ({ winner, winnerName, rankings, winningTeam, teams, teamNames }) => {
  localStorage.removeItem('kc-in-game');
  stopGameTimer();
  hideModal();
  clearConfetti();
  showScreen('gameover');
  AudioManager.stopMusic();
  const escName = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  let html = '';
  let isWinner = false;

  if (teams && winningTeam !== undefined && winningTeam >= 0) {
    // Teams mode
    const myTeamIdx = getMyTeam();
    isWinner = myTeamIdx === winningTeam;
    if (isWinner) AudioManager.play('victory');
    html = isWinner
      ? `<h2>Your team wins!</h2>`
      : `<h2>Team ${escName(teamNames[winningTeam])} wins!</h2>`;
    html += '<div class="team-results">';
    for (let t = 0; t < teams.length; t++) {
      const isWT = t === winningTeam;
      html += `<div class="team-result ${isWT ? 'team-result-winner' : ''}">`;
      html += `<div class="team-result-name">${isWT ? '&#x1F3C6; ' : ''}${escName(teamNames[t])}</div>`;
      const teamRankings = rankings.filter(r => r.team === t);
      teamRankings.forEach(r => {
        html += `<div class="rank-row">${escName(r.name)}</div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  } else {
    // FFA mode
    isWinner = winner === myId;
    if (isWinner) AudioManager.play('victory');
    html = isWinner
      ? `<h2>You win!</h2>`
      : `<h2>${escName(winnerName)} wins!</h2>`;
    if (rankings && rankings.length > 1) {
      html += '<div class="rankings">';
      rankings.forEach(r => {
        const suffix = r.place === 1 ? 'st' : r.place === 2 ? 'nd' : r.place === 3 ? 'rd' : 'th';
        const medal = r.place === 1 ? '&#x1F947;' : r.place === 2 ? '&#x1F948;' : r.place === 3 ? '&#x1F949;' : '';
        html += `<div class="rank-row">${medal} <strong>${r.place}${suffix}</strong> — ${escName(r.name)}</div>`;
      });
      html += '</div>';
    }
  }

  document.getElementById('winner-message').innerHTML = html;
  document.getElementById('rematch-status').innerHTML = '';
  document.getElementById('btn-rematch').disabled = false;
  document.getElementById('btn-rematch').textContent = 'Rematch';
  if (isWinner) triggerConfetti();
});

// Rematch
socket.on('rematch-update', ({ votes, total, count }) => {
  const escName = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const voted = votes.filter(v => v.voted);
  const waiting = votes.filter(v => !v.voted);
  let html = '';
  if (total < 2) {
    html = '<div class="rematch-waiting">Not enough players for rematch</div>';
    document.getElementById('btn-rematch').disabled = true;
    document.getElementById('btn-rematch').textContent = 'Rematch';
  } else {
    if (voted.length > 0) {
      html += '<div class="rematch-voted">' + voted.map(v => escName(v.name)).join(', ') + ' ready</div>';
    }
    if (waiting.length > 0) {
      html += '<div class="rematch-waiting">Waiting on ' + waiting.map(v => escName(v.name)).join(', ') + '...</div>';
    }
  }
  document.getElementById('rematch-status').innerHTML = html;
});

socket.on('rematch-left', () => {
  localStorage.removeItem('kc-room');
  localStorage.removeItem('kc-in-game');
  stopGameTimer();
  hideModal();
  clearConfetti();
  AudioManager.stopMusic();
  showScreen('title');
  showToast('Left the room.', 'info');
});

// Chat
socket.on('chat-message', ({ sender, senderName, text }) => {
  addChatMessage(senderName, text, sender === myId);
});

// Online player list for invites
socket.on('player-list', ({ players }) => {
  renderInvitePlayerList(players);
});

socket.on('invite-sent', ({ targetName }) => {
  showToast(`Invite sent to ${targetName}!`, 'success');
});

// Receiving a game invite
socket.on('game-invite', ({ fromId, fromName, roomCode }) => {
  showInviteModal(fromName, roomCode);
});

// Catto system (like UNO call)
socket.on('catto-vulnerable', ({ player, playerName }) => {
  if (player === myId) {
    showCattoButton();
    showToast('Say CATTO or get caught!', 'warning');
  } else {
    showCattoChallenge(player, playerName);
    showAnnouncement(`${playerName} has 1 card! Catch them!`, 'caught', 2000);
  }
  addToLog(`${playerName} has 1 card!`, 'warning');
});

socket.on('catto-safe', () => {
  hideCattoUI();
});

socket.on('catto-caught', ({ player, playerName, challengerName }) => {
  hideCattoUI();
  AudioManager.play('cat-hiss');
  showAnnouncement(`${challengerName} caught ${playerName}! +2 cards!`, 'caught', 2500);
  if (player === myId) {
    showToast('Caught! +2 cards!', 'error');
  }
  addToLog(`${challengerName} caught ${playerName}! +2 penalty!`, 'warning');
});

// Emit helpers
function emitCreateRoom(name, isPublic) { socket.emit('set-name', { name }); socket.emit('create-room', { name, isPublic }); }
function emitJoinRoom(code, name) { socket.emit('set-name', { name }); socket.emit('join-room', { code: code.toUpperCase(), name }); }
function emitStartGame() { socket.emit('start-game'); }
function emitPlayCard(cardId, chosenColor, targetPlayer, chosenAction, stolenCardId) {
  socket.emit('play-card', { cardId, chosenColor: chosenColor || null, targetPlayer: targetPlayer || null, chosenAction: chosenAction || null, stolenCardId: stolenCardId || null });
}
function emitDrawCard() { socket.emit('draw-card'); }
function emitForfeit() { socket.emit('forfeit'); }
function emitRematchRequest() { socket.emit('rematch-request'); }
function emitRematchDecline() { socket.emit('rematch-decline'); }
function emitChatMessage(text) { socket.emit('chat-message', { text }); }
function emitCattoCall() { socket.emit('catto-call'); }
function emitCattoChallenge(targetPlayer) { socket.emit('catto-challenge', { targetPlayer }); }
