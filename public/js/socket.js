const socket = io();

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
  socket.emit('register-session', { sessionToken });
  // Register name so other players can see us
  const name = localStorage.getItem('kc-name');
  if (name) socket.emit('set-name', { name });
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});

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

socket.on('room-joined', ({ code, players, gameMode, teams }) => {
  roomCode = code;
  localStorage.setItem('kc-room', code);
  localStorage.setItem('kc-name', document.getElementById('player-name').value.trim());
  showScreen('waiting');
  document.getElementById('room-code-display').textContent = code;
  currentRoomMode = gameMode || 'ffa';
  currentRoomTeams = teams || null;
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

socket.on('game-started', ({ hand, playable, publicState, playerNames, myId: id, gameMode, teams, teamNames }) => {
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
  gameState.hand = [];
  gameState.playable = [];
  gameState.screen = 'game';
  showScreen('game');
  renderGameBoard();

  // Init audio on first user interaction (game start) and start music
  AudioManager.init();
  AudioManager.play('card-shuffle');
  AudioManager.startMusic();

  playDealAnimation(hand).then(() => {
    gameState.playable = playable || [];
    renderHand();
  });
});

socket.on('game-rejoined', ({ hand, playable, publicState, playerNames, myId: id, roomCode: code, gameMode, teams, teamNames }) => {
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
  gameState.screen = 'game';
  showScreen('game');
  renderGameBoard();
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
    showToast(`You finished ${place}${suffix}!`, 'success');
  }
  addToLog(`${playerName} finished ${place}${suffix}!`, 'success');
});

socket.on('player-eliminated', ({ player, playerName, reason }) => {
  const reasons = {
    'hand-limit': `${playerName} was eliminated (too many cards!)`,
    'forfeit': `${playerName} forfeited!`,
    'disconnect': `${playerName} disconnected!`
  };
  const msg = reasons[reason] || `${playerName} was eliminated!`;
  addToLog(msg, 'danger');
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
  hideModal();
  clearConfetti();
  AudioManager.stopMusic();
  showScreen('title');
  showToast('You forfeited the game.', 'warning');
});

socket.on('game-over', ({ winner, winnerName, rankings, winningTeam, teams, teamNames }) => {
  localStorage.removeItem('kc-room');
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

// Catto system (like UNO call) — no announcements, purely memory-based
socket.on('catto-vulnerable', ({ player, playerName }) => {
  if (player === myId) {
    showCattoButton();
  } else {
    showCattoChallenge(player, playerName);
  }
});

socket.on('catto-safe', () => {
  hideCattoUI();
});

socket.on('catto-caught', ({ player, playerName, challengerName }) => {
  hideCattoUI();
  AudioManager.play('cat-hiss');
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
