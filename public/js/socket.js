const socket = io();

let myId = null;
let roomCode = null;

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});

socket.on('error-msg', ({ message }) => {
  showToast(message, 'error');
});

socket.on('room-created', ({ code, isPublic }) => {
  roomCode = code;
  showScreen('waiting');
  document.getElementById('room-code-display').textContent = code;
  const badge = document.getElementById('room-type-badge');
  badge.textContent = isPublic ? 'PUBLIC' : 'PRIVATE';
  badge.className = 'room-type-badge ' + (isPublic ? 'badge-public' : 'badge-private');
});

socket.on('room-list', ({ rooms }) => {
  renderRoomList(rooms);
});

socket.on('room-joined', ({ code, players }) => {
  roomCode = code;
  showScreen('waiting');
  document.getElementById('room-code-display').textContent = code;
  updateWaitingPlayers(players);
});

socket.on('player-joined', ({ players }) => {
  updateWaitingPlayers(players);
});

socket.on('player-left', ({ players }) => {
  updateWaitingPlayers(players);
});

socket.on('game-started', ({ hand, playable, publicState, playerNames, myId: id }) => {
  myId = id;
  gameState.hand = hand;
  gameState.playable = playable || [];
  gameState.playerNames = playerNames || {};
  gameState.direction = publicState.direction;
  gameState.drawStack = publicState.drawStack;
  gameState.activeColor = publicState.activeColor;
  gameState.discardTop = publicState.discardTop;
  gameState.deckCount = publicState.deckCount;
  gameState.players = publicState.players;
  gameState.currentPlayer = publicState.currentPlayer;
  gameState.screen = 'game';
  showScreen('game');
  renderGameBoard();
});

socket.on('turn-changed', ({ currentPlayer, currentPlayerName, direction, drawStack, activeColor }) => {
  gameState.currentPlayer = currentPlayer;
  gameState.direction = direction;
  gameState.drawStack = drawStack;
  gameState.activeColor = activeColor;
  renderGameBoard();
  if (currentPlayer === myId) {
    if (drawStack > 0) {
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
});

socket.on('catastrophe-drawn', ({ player, playerName, card }) => {
  addToLog(`${playerName} drew a catastrophe!`, 'danger');
  triggerScreenShake();
});

socket.on('can-defuse', ({ card, defuseCardId }) => {
  gameState.pendingCatastrophe = { card, defuseCardId };
  showDefuseModal(card, defuseCardId);
});

socket.on('defused', ({ playerName }) => {
  addToLog(`${playerName} landed on their feet!`, 'success');
  hideModal();
  gameState.pendingCatastrophe = null;
});

socket.on('catastrophe-penalty', ({ player, playerName, removedCard }) => {
  hideModal();
  gameState.pendingCatastrophe = null;
  if (removedCard) {
    const def = getCardDef(removedCard);
    const name = removedCard.type === 'kitty'
      ? `${KITTY_COLORS[removedCard.color]?.name || ''} ${removedCard.number}`
      : (def?.name || removedCard.type);
    addToLog(`${playerName} lost their ${name}!`, 'danger');
    if (player === myId) showToast(`Catastrophe! You lost your ${name}!`, 'error');
  } else {
    addToLog(`${playerName} survived with nothing to lose!`, 'warning');
  }
});

socket.on('player-eliminated', ({ player, playerName }) => {
  addToLog(`${playerName} has been eliminated!`, 'danger');
  hideModal();
  gameState.pendingCatastrophe = null;
});

socket.on('player-finished', ({ player, playerName, place }) => {
  const suffix = place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
  if (player === myId) {
    showToast(`You finished ${place}${suffix}!`, 'success');
  }
  addToLog(`${playerName} finished ${place}${suffix}!`, 'success');
});

socket.on('game-over', ({ winner, winnerName, rankings }) => {
  showScreen('gameover');
  const isWinner = winner === myId;
  let html = isWinner
    ? `<h2>You win!</h2>`
    : `<h2>${winnerName} wins!</h2>`;
  if (rankings && rankings.length > 1) {
    html += '<div class="rankings">';
    rankings.forEach(r => {
      const suffix = r.place === 1 ? 'st' : r.place === 2 ? 'nd' : r.place === 3 ? 'rd' : 'th';
      const medal = r.place === 1 ? '&#x1F947;' : r.place === 2 ? '&#x1F948;' : r.place === 3 ? '&#x1F949;' : '';
      html += `<div class="rank-row">${medal} <strong>${r.place}${suffix}</strong> — ${r.name}</div>`;
    });
    html += '</div>';
  }
  document.getElementById('winner-message').innerHTML = html;
  if (isWinner) triggerConfetti();
});

socket.on('peek-result', ({ cards }) => {
  showPeekModal(cards);
});

socket.on('deck-shuffled', ({ deckCount }) => {
  gameState.deckCount = deckCount;
  addToLog('Deck shuffled!');
  renderGameBoard();
});

socket.on('card-received', ({ card }) => {
  const def = getCardDef(card);
  const name = card.type === 'kitty'
    ? `${KITTY_COLORS[card.color]?.name || ''} ${card.number}`
    : (def?.name || card.type);
  addToLog(`You received: ${name}`);
});

socket.on('card-stolen', ({ by }) => {
  addToLog(`${by} stole a card from you!`, 'danger');
});

// Emit helpers
function emitCreateRoom(name, isPublic) { socket.emit('create-room', { name, isPublic }); }
function emitJoinRoom(code, name) { socket.emit('join-room', { code: code.toUpperCase(), name }); }
function emitStartGame() { socket.emit('start-game'); }
function emitPlayCard(cardId, chosenColor, targetPlayer) {
  socket.emit('play-card', { cardId, chosenColor: chosenColor || null, targetPlayer: targetPlayer || null });
}
function emitDrawCard() { socket.emit('draw-card'); }
function emitDefuse(defuseCardId, position) { socket.emit('defuse', { defuseCardId, position }); }
function emitRearrange(cardOrder) { socket.emit('rearrange-deck', { cardOrder }); }
