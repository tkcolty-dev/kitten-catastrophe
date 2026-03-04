const socket = io();

// Connection state
let myId = null;
let roomCode = null;

socket.on('connect', () => {
  myId = socket.id;
  console.log('Connected to server, id:', myId);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('error-msg', ({ message }) => {
  showToast(message, 'error');
});

socket.on('room-created', ({ code }) => {
  roomCode = code;
  showScreen('waiting');
  document.getElementById('room-code-display').textContent = code;
});

socket.on('room-joined', ({ code, players }) => {
  roomCode = code;
  showScreen('waiting');
  document.getElementById('room-code-display').textContent = code;
  updateWaitingPlayers(players);
});

socket.on('player-joined', ({ players }) => {
  updateWaitingPlayers(players);
  if (gameState.screen === 'game') {
    // During game, update player display
  }
});

socket.on('player-left', ({ players }) => {
  updateWaitingPlayers(players);
});

socket.on('game-started', ({ hand, players, playerNames, deckCount, currentPlayer, myId: id }) => {
  myId = id;
  gameState.hand = hand;
  gameState.players = players;
  gameState.playerNames = playerNames || {};
  gameState.deckCount = deckCount;
  gameState.currentPlayer = currentPlayer;
  gameState.screen = 'game';
  showScreen('game');
  renderGameBoard();
});

socket.on('your-turn', ({ currentPlayer }) => {
  gameState.currentPlayer = currentPlayer;
  renderGameBoard();
  if (currentPlayer === myId) {
    showToast("Your turn! Play a card or draw.", 'info');
  }
});

socket.on('turn-changed', ({ currentPlayer, currentPlayerName, turnsRemaining }) => {
  gameState.currentPlayer = currentPlayer;
  gameState.turnsRemaining = turnsRemaining;
  renderGameBoard();
  if (currentPlayer === myId) {
    const extra = turnsRemaining > 1 ? ` (${turnsRemaining} turns!)` : '';
    showToast(`Your turn!${extra}`, 'info');
  }
});

socket.on('card-played', ({ playerName, card, targetName }) => {
  let msg = `${playerName} played ${card.name || card.type}`;
  if (targetName) msg += ` on ${targetName}`;
  addToLog(msg);

  if (card.type === 'hiss' || card.type === 'HISS!') {
    triggerScreenShake();
  }
});

socket.on('card-drawn', ({ card }) => {
  gameState.hand.push(card);
  renderHand();
  addToLog('You drew a card');
});

socket.on('hand-updated', ({ hand }) => {
  gameState.hand = hand;
  renderHand();
});

socket.on('state-update', ({ deckCount, players, discardTop }) => {
  gameState.deckCount = deckCount;
  gameState.players = players;
  gameState.discardTop = discardTop;
  renderGameBoard();
});

socket.on('catastrophe-drawn', ({ player, playerName, card }) => {
  addToLog(`${playerName} drew a ${card.subtype} catastrophe!`, 'danger');
  triggerScreenShake();
  if (player === myId) {
    // Handled by can-defuse
  }
});

socket.on('can-defuse', ({ card, defuseCardId }) => {
  gameState.pendingCatastrophe = { card, defuseCardId };
  showDefuseModal(card, defuseCardId);
});

socket.on('defused', ({ playerName }) => {
  addToLog(`${playerName} landed on their feet!`, 'success');
  hideDefuseModal();
  gameState.pendingCatastrophe = null;
});

socket.on('life-lost', ({ player, playerName, lives }) => {
  addToLog(`${playerName} lost a life! (${lives} remaining)`, 'danger');
  triggerHeartShatter(player);
  hideDefuseModal();
  gameState.pendingCatastrophe = null;
});

socket.on('player-eliminated', ({ player, playerName }) => {
  addToLog(`${playerName} has been eliminated!`, 'danger');
  triggerEliminationAnimation(player);
});

socket.on('game-over', ({ winner, winnerName }) => {
  showScreen('gameover');
  const isWinner = winner === myId;
  document.getElementById('winner-message').innerHTML = isWinner
    ? `<h2>You win!</h2><p>You're the last kitten standing!</p>`
    : `<h2>${winnerName} wins!</h2><p>Better luck next time!</p>`;
  if (isWinner) triggerConfetti();
});

socket.on('peek-result', ({ cards }) => {
  showPeekModal(cards);
});

socket.on('deck-shuffled', ({ deckCount }) => {
  gameState.deckCount = deckCount;
  addToLog('The deck has been shuffled!');
  renderGameBoard();
});

socket.on('card-received', ({ card }) => {
  addToLog(`You received: ${getCardDef(card)?.name || card.type}`);
});

socket.on('card-stolen', ({ by }) => {
  addToLog(`${by} stole a card from you!`, 'danger');
});

socket.on('hiss-played', ({ playerName, cancelledAction }) => {
  addToLog(`${playerName} played HISS! and cancelled the action!`, 'warning');
  triggerScreenShake();
});

socket.on('extra-turn', ({ targetName, turnsRemaining }) => {
  addToLog(`${targetName} must take ${turnsRemaining} turns!`, 'warning');
});

socket.on('steal-failed', ({ message }) => {
  showToast(message, 'warning');
});

// Emit helpers
function createRoom(name) {
  socket.emit('create-room', { name });
}

function joinRoom(code, name) {
  socket.emit('join-room', { code: code.toUpperCase(), name });
}

function startGame() {
  socket.emit('start-game');
}

function emitPlayCard(cardId, targetPlayer) {
  socket.emit('play-card', { cardId, targetPlayer });
}

function emitDrawCard() {
  socket.emit('draw-card');
}

function emitDefuse(defuseCardId, position) {
  socket.emit('defuse', { defuseCardId, position });
}

function emitPlayHiss(targetAction) {
  socket.emit('play-hiss', { targetAction });
}

function emitPlayBreedPair(cardIds, targetPlayer) {
  socket.emit('play-breed-pair', { cardIds, targetPlayer });
}

function emitPlayBreedTriple(cardIds, targetPlayer, cardType) {
  socket.emit('play-breed-triple', { cardIds, targetPlayer, cardType });
}
