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
});

socket.on('player-left', ({ players }) => {
  updateWaitingPlayers(players);
});

socket.on('game-started', (data) => {
  myId = data.myId;
  gameState.hand = data.hand;
  gameState.players = data.players;
  gameState.playerNames = data.playerNames || {};
  gameState.playerColors = data.playerColors || {};
  gameState.positions = data.positions || {};
  gameState.properties = data.properties || {};
  gameState.catnip = data.catnip || {};
  gameState.boardDeckCount = data.boardDeckCount;
  gameState.currentPlayer = data.currentPlayer;
  gameState.boardLayout = data.boardLayout;
  gameState.hasRolled = false;
  gameState.screen = 'game';
  showScreen('game');
});

socket.on('your-turn', ({ currentPlayer }) => {
  gameState.currentPlayer = currentPlayer;
  gameState.hasRolled = false;
  renderGameUI();
  if (currentPlayer === myId) {
    showToast("Your turn! Play cards or roll.", 'info');
    if (diceRoller) diceRoller.reset();
  }
});

socket.on('turn-changed', ({ currentPlayer, currentPlayerName, turnsRemaining }) => {
  gameState.currentPlayer = currentPlayer;
  gameState.turnsRemaining = turnsRemaining;
  gameState.hasRolled = false;
  renderGameUI();
  if (currentPlayer === myId) {
    const extra = turnsRemaining > 1 ? ` (${turnsRemaining} turns!)` : '';
    showToast(`Your turn!${extra}`, 'info');
    if (diceRoller) diceRoller.reset();
  }
});

// --- Board-specific events ---

socket.on('dice-rolled', ({ player, playerName, roll }) => {
  addToLog(`${playerName} rolled a ${roll}!`);
  if (player === myId) {
    gameState.hasRolled = true;
    if (diceRoller) diceRoller.showRoll(roll);
    updateDiceState();
    renderTurnIndicator();
  }
});

socket.on('player-moved', ({ player, path, finalPosition, partial, shortcut }) => {
  const prevPos = gameState.positions[player];
  gameState.positions[player] = finalPosition;

  if (boardRenderer && path.length > 0) {
    boardRenderer.updatePositions(gameState.positions);
    boardRenderer.animateToken(player, path, prevPos !== undefined ? prevPos : 0);
  }

  if (shortcut) {
    const name = getPlayerName(player);
    addToLog(`${name} took a shortcut!`, 'success');
  }
});

socket.on('space-landed', ({ player, playerName, spaceType, effect }) => {
  if (effect === 'card-drawn') {
    addToLog(`${playerName} landed on Draw Card and got a card!`);
  } else if (effect === 'defused') {
    addToLog(`${playerName} landed on Catastrophe but had a defuse!`, 'success');
  } else if (effect === 'life-lost') {
    addToLog(`${playerName} landed on Catastrophe and lost a life!`, 'danger');
    triggerScreenShake();
  } else if (effect === 'skip-next-turn') {
    addToLog(`${playerName} landed on a Trap! Skipping next turn.`, 'warning');
  } else if (effect === 'jumped') {
    addToLog(`${playerName} found a shortcut!`, 'success');
  } else if (effect === 'winner') {
    addToLog(`${playerName} reached the finish line!`, 'success');
  }
});

socket.on('fork-choice', ({ options, remainingSteps }) => {
  showForkModal(options);
});

socket.on('board-card-drawn', ({ card }) => {
  gameState.hand.push(card);
  renderHand();
  const def = getCardDef(card);
  addToLog(`You drew: ${def ? def.name : card.type}`);
  triggerDrawCardAnimation(card);
});

socket.on('property-claimed', ({ player, playerName, nodeId }) => {
  if (gameState.properties) gameState.properties[nodeId] = player;
  if (boardRenderer) {
    boardRenderer.updateProperties(gameState.properties);
    boardRenderer.draw();
  }
});

// --- Card events (same as before) ---

socket.on('card-played', ({ playerName, card, targetName }) => {
  let msg = `${playerName} played ${card.name || card.type}`;
  if (targetName) msg += ` on ${targetName}`;
  addToLog(msg);

  if (card.type === 'hiss' || card.type === 'HISS!') {
    triggerScreenShake();
  }
});

socket.on('hand-updated', ({ hand }) => {
  gameState.hand = hand;
  renderHand();
});

socket.on('state-update', (state) => {
  gameState.boardDeckCount = state.boardDeckCount;
  gameState.players = state.players;
  gameState.currentPlayer = state.currentPlayer;
  gameState.hasRolled = state.hasRolled;
  if (state.positions) gameState.positions = state.positions;
  if (state.properties) gameState.properties = state.properties;
  if (state.catnip) gameState.catnip = state.catnip;
  renderGameUI();
});

socket.on('life-lost', ({ player, playerName, lives }) => {
  addToLog(`${playerName} lost a life! (${lives} remaining)`, 'danger');
  triggerHeartShatter(player);
});

socket.on('defused', ({ playerName }) => {
  addToLog(`${playerName} landed on their feet!`, 'success');
});

socket.on('player-eliminated', ({ player, playerName }) => {
  addToLog(`${playerName} has been eliminated!`, 'danger');
  triggerEliminationAnimation(player);
});

socket.on('game-over', ({ winner, winnerName, reason }) => {
  showScreen('gameover');
  const isWinner = winner === myId;
  const reasonText = reason === 'finish'
    ? 'First to cross the finish line!'
    : 'Last kitten standing!';
  document.getElementById('winner-message').innerHTML = isWinner
    ? `<h2>You win!</h2><p>${reasonText}</p>`
    : `<h2>${winnerName} wins!</h2><p>${reasonText}</p>`;
  if (isWinner) triggerConfetti();
});

socket.on('peek-result', ({ spaces }) => {
  showPeekModal(spaces);
});

socket.on('deck-shuffled', ({ boardDeckCount }) => {
  gameState.boardDeckCount = boardDeckCount;
  addToLog('The board deck has been shuffled!');
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

socket.on('log-message', ({ message }) => {
  addToLog(message);
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

function emitRollDice() {
  socket.emit('roll-dice');
}

function emitChooseFork(nodeId) {
  socket.emit('choose-fork', { nodeId });
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

function emitShopBuy() {
  socket.emit('shop-buy');
}
