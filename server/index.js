const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, joinRoom, leaveRoom, getRoom, getRoomBySocket, getPublicRooms, swapPlayer, setGameMode, swapPlayerTeam } = require('./rooms');
const crypto = require('crypto');
const { startGame, shuffle, drawWithDedup, makeCard, COLORS, HAND_LIMIT } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));

// Session management for reconnection
const sessions = new Map();         // sessionToken -> socketId
const socketToSession = new Map();   // socketId -> sessionToken
const disconnectTimers = new Map();  // sessionToken -> { timerId, socketId, roomCode }

const WILD_TYPES = ['wild', 'wilddraw4', 'draw6', 'draw10', 'wildskip', 'wildreverse', 'wilddraw2', 'madmittens'];
const TEAM_NAMES = ['Paws', 'Claws'];

// Chat moderation - basic profanity filter
const BLOCKED_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'dick', 'cock', 'pussy', 'cunt',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'slut', 'whore',
  'kys', 'kill yourself', 'kms'
];
const BLOCKED_PATTERN = new RegExp(
  BLOCKED_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi'
);
function moderateMessage(text) {
  return text.replace(BLOCKED_PATTERN, m => '*'.repeat(m.length));
}
const CHAT_COOLDOWN = 1000; // 1 second between messages
const chatCooldowns = new Map(); // socketId -> last message timestamp

// Global online player tracking
const onlinePlayers = new Map(); // socketId -> { name }

// Catto tracking (like UNO call)
const cattoVulnerable = new Map(); // roomCode -> { playerId, timer }

function clearCatto(roomCode) {
  const entry = cattoVulnerable.get(roomCode);
  if (entry) {
    clearTimeout(entry.timer);
    cattoVulnerable.delete(roomCode);
  }
}

function startCattoWindow(room, playerId) {
  clearCatto(room.code);
  const timer = setTimeout(() => {
    // Window expired without challenge — player is safe
    cattoVulnerable.delete(room.code);
    io.to(room.code).emit('catto-safe', { player: playerId, playerName: room.getPlayerName(playerId) });
  }, 5000); // 5 second window
  cattoVulnerable.set(room.code, { playerId, timer, called: false });
  io.to(room.code).emit('catto-vulnerable', { player: playerId, playerName: room.getPlayerName(playerId) });
}

function emitTurnInfo(room) {
  const game = room.game;
  const currentId = game.currentPlayerSocketId();
  const playable = game.getPlayableIds(currentId);
  io.to(room.code).emit('turn-changed', {
    currentPlayer: currentId,
    currentPlayerName: room.getPlayerName(currentId),
    direction: game.direction,
    drawStack: game.drawStack,
    drawStackLocked: game.drawStackLocked,
    activeColor: game.activeColor
  });
  io.to(currentId).emit('playable-cards', { playable });
}

function emitStateUpdate(room) {
  io.to(room.code).emit('state-update', room.game.getPublicState());
}

function endGame(room) {
  const game = room.game;

  if (game.teams) {
    // Teams mode — add remaining active players to finishedOrder
    for (const id of [...game.playerOrder]) {
      if (!game.finishedOrder.includes(id)) {
        game.finishedOrder.push(id);
      }
    }
    // Add eliminated players who aren't in finishedOrder (so they appear in rankings)
    for (const team of game.teams) {
      for (const id of team) {
        if (!game.finishedOrder.includes(id)) {
          game.finishedOrder.push(id);
        }
      }
    }
    io.to(room.code).emit('game-over', {
      winner: null,
      winnerName: `Team ${TEAM_NAMES[game.winningTeam] || '?'}`,
      winningTeam: game.winningTeam,
      teams: game.teams,
      teamNames: TEAM_NAMES,
      rankings: game.finishedOrder.map((id, i) => ({
        place: i + 1,
        name: room.getPlayerName(id),
        team: game.getTeamOf(id)
      }))
    });
  } else {
    const lastPlayer = game.playerOrder[0];
    if (lastPlayer) game.finishedOrder.push(lastPlayer);
    io.to(room.code).emit('game-over', {
      winner: game.finishedOrder[0],
      winnerName: room.getPlayerName(game.finishedOrder[0]),
      rankings: game.finishedOrder.map((id, i) => ({
        place: i + 1,
        name: room.getPlayerName(id)
      }))
    });
  }

  room.state = 'finished';
  room.rematchVotes = new Set();
}

function emitRematchUpdate(room) {
  io.to(room.code).emit('rematch-update', {
    votes: room.players.map(p => ({
      id: p.id,
      name: p.name,
      voted: room.rematchVotes.has(p.id)
    })),
    total: room.players.length,
    count: room.rematchVotes.size
  });
}

function tryStartRematch(room) {
  if (room.rematchVotes.size >= room.players.length && room.players.length >= 2) {
    // Clean up teams for rematch
    if (room.gameMode === 'teams' && room.teams) {
      const playerIds = new Set(room.players.map(p => p.id));
      room.teams = room.teams.map(team => team.filter(id => playerIds.has(id)));
      for (const p of room.players) {
        if (!room.teams[0].includes(p.id) && !room.teams[1].includes(p.id)) {
          const smaller = room.teams[0].length <= room.teams[1].length ? 0 : 1;
          room.teams[smaller].push(p.id);
        }
      }
    }
    const game = startGame(room);
    room.state = 'playing';
    room.game = game;
    room.rematchVotes = null;

    const playerNames = {};
    room.players.forEach(p => { playerNames[p.id] = p.name; });

    room.players.forEach(p => {
      const hand = game.hands[p.id];
      const playable = game.getPlayableIds(p.id);
      io.to(p.id).emit('game-started', {
        hand,
        playable,
        publicState: game.getPublicState(),
        playerNames,
        myId: p.id,
        gameMode: room.gameMode,
        teams: game.teams,
        teamNames: game.teams ? TEAM_NAMES : null
      });
    });

    emitTurnInfo(room);
  }
}

function checkFinish(room, socketId) {
  const game = room.game;
  const hand = game.hands[socketId];
  if (!hand || hand.length > 0) return false;

  const place = game.finishedOrder.length + 1;
  game.finishPlayer(socketId);

  io.to(room.code).emit('player-finished', {
    player: socketId,
    playerName: room.getPlayerName(socketId),
    place
  });

  if (game.isGameOver()) {
    endGame(room);
    return true;
  }

  io.to(socketId).emit('hand-updated', { hand: [] });
  emitStateUpdate(room);
  emitTurnInfo(room);
  return true;
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // Session registration + reconnection
  socket.on('register-session', ({ sessionToken }) => {
    if (!sessionToken) return;

    const pending = disconnectTimers.get(sessionToken);
    if (pending) {
      clearTimeout(pending.timerId);
      disconnectTimers.delete(sessionToken);

      const room = getRoom(pending.roomCode);
      if (room && room.game && room.state === 'playing') {
        const success = swapPlayer(pending.roomCode, pending.socketId, socket.id);
        if (success) {
          socket.join(pending.roomCode);
          sessions.set(sessionToken, socket.id);
          socketToSession.set(socket.id, sessionToken);

          const playerNames = {};
          room.players.forEach(p => { playerNames[p.id] = p.name; });

          socket.emit('game-rejoined', {
            hand: room.game.hands[socket.id] || [],
            playable: room.game.getPlayableIds(socket.id),
            publicState: room.game.getPublicState(),
            playerNames,
            myId: socket.id,
            roomCode: pending.roomCode,
            gameMode: room.gameMode,
            teams: room.game.teams,
            teamNames: room.game.teams ? TEAM_NAMES : null
          });
          emitStateUpdate(room);
          return;
        }
      } else if (room && room.state === 'finished') {
        const success = swapPlayer(pending.roomCode, pending.socketId, socket.id);
        if (success) {
          socket.join(pending.roomCode);
          sessions.set(sessionToken, socket.id);
          socketToSession.set(socket.id, sessionToken);

          // Re-send game over data so client restores the gameover screen
          if (room.game.teams) {
            socket.emit('game-over', {
              winner: null,
              winnerName: `Team ${TEAM_NAMES[room.game.winningTeam] || '?'}`,
              winningTeam: room.game.winningTeam,
              teams: room.game.teams,
              teamNames: TEAM_NAMES,
              rankings: room.game.finishedOrder.map((id, i) => ({
                place: i + 1,
                name: room.getPlayerName(id),
                team: room.game.getTeamOf(id)
              }))
            });
          } else {
            socket.emit('game-over', {
              winner: room.game.finishedOrder[0],
              winnerName: room.getPlayerName(room.game.finishedOrder[0]),
              rankings: room.game.finishedOrder.map((id, i) => ({
                place: i + 1,
                name: room.getPlayerName(id)
              }))
            });
          }

          // Send current rematch voting status
          if (room.rematchVotes) {
            emitRematchUpdate(room);
          }
          return;
        }
      }
    }

    sessions.set(sessionToken, socket.id);
    socketToSession.set(socket.id, sessionToken);
  });

  // Track player name globally
  socket.on('set-name', ({ name }) => {
    if (!name || typeof name !== 'string') return;
    onlinePlayers.set(socket.id, { name: name.trim().slice(0, 20) });
  });

  // List all online players (for invite UI)
  socket.on('list-players', () => {
    const room = getRoomBySocket(socket.id);
    const roomPlayerIds = room ? new Set(room.players.map(p => p.id)) : new Set();
    const players = [];
    for (const [id, info] of onlinePlayers) {
      if (id === socket.id) continue;
      if (roomPlayerIds.has(id)) continue;
      const theirRoom = getRoomBySocket(id);
      players.push({
        id,
        name: info.name,
        status: theirRoom && theirRoom.state === 'playing' ? 'in-game' : theirRoom ? 'in-lobby' : 'online'
      });
    }
    socket.emit('player-list', { players });
  });

  // Send game invite to a player
  socket.on('send-invite', ({ targetId }) => {
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) return socket.emit('error-msg', { message: 'Player is no longer online' });
    const targetRoom = getRoomBySocket(targetId);
    if (targetRoom && targetRoom.state === 'playing') return socket.emit('error-msg', { message: 'Player is in a game' });

    // Auto-create a room if sender isn't in one
    let room = getRoomBySocket(socket.id);
    if (!room) {
      const senderInfo = onlinePlayers.get(socket.id);
      const senderName = senderInfo ? senderInfo.name : 'Player';
      room = createRoom(socket.id, senderName, false);
      socket.join(room.code);
      socket.emit('room-created', { code: room.code, isPublic: room.isPublic });
      io.to(room.code).emit('player-joined', { players: room.getPublicPlayers(), gameMode: room.gameMode, teams: room.teams });
    }

    if (room.state !== 'waiting') return socket.emit('error-msg', { message: 'Game already started' });
    if (room.players.length >= 8) return socket.emit('error-msg', { message: 'Room is full' });

    const senderName = room.getPlayerName(socket.id);
    targetSocket.emit('game-invite', {
      fromId: socket.id,
      fromName: senderName,
      roomCode: room.code
    });
    socket.emit('invite-sent', { targetName: onlinePlayers.get(targetId)?.name || 'Player' });
  });

  socket.on('create-room', ({ name, isPublic }) => {
    const room = createRoom(socket.id, name, isPublic);
    socket.join(room.code);
    socket.emit('room-created', { code: room.code, isPublic: room.isPublic });
    io.to(room.code).emit('player-joined', { players: room.getPublicPlayers(), gameMode: room.gameMode, teams: room.teams });
  });

  socket.on('list-rooms', () => {
    socket.emit('room-list', { rooms: getPublicRooms() });
  });

  socket.on('join-room', ({ code, name }) => {
    const room = getRoom(code);
    if (!room) return socket.emit('error-msg', { message: 'Room not found' });
    if (room.state !== 'waiting') return socket.emit('error-msg', { message: 'Game already in progress' });
    if (room.players.length >= 8) return socket.emit('error-msg', { message: 'Room is full' });

    const result = joinRoom(code, socket.id, name);
    if (!result) return socket.emit('error-msg', { message: 'Could not join room' });

    socket.join(code);
    socket.emit('room-joined', { code, players: room.getPublicPlayers(), gameMode: room.gameMode, teams: room.teams });
    io.to(code).emit('player-joined', { players: room.getPublicPlayers(), gameMode: room.gameMode, teams: room.teams });
  });

  socket.on('set-game-mode', ({ mode }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.state !== 'waiting') return;
    if (room.host !== socket.id) return socket.emit('error-msg', { message: 'Only host can change mode' });
    if (mode !== 'ffa' && mode !== 'teams') return;
    setGameMode(room, mode);
    io.to(room.code).emit('game-mode-changed', { mode: room.gameMode, teams: room.teams });
  });

  socket.on('swap-team', ({ playerId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.state !== 'waiting') return;
    if (room.host !== socket.id) return socket.emit('error-msg', { message: 'Only host can swap teams' });
    if (room.gameMode !== 'teams' || !room.teams) return;
    swapPlayerTeam(room, playerId);
    io.to(room.code).emit('teams-updated', { teams: room.teams });
  });

  socket.on('start-game', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error-msg', { message: 'Only host can start' });
    if (room.players.length < 2) return socket.emit('error-msg', { message: 'Need at least 2 players' });
    if (room.gameMode === 'teams') {
      if (!room.teams || room.teams[0].length < 1 || room.teams[1].length < 1) {
        return socket.emit('error-msg', { message: 'Each team needs at least 1 player' });
      }
    }

    const game = startGame(room);
    room.state = 'playing';
    room.game = game;

    const playerNames = {};
    room.players.forEach(p => { playerNames[p.id] = p.name; });

    room.players.forEach(p => {
      const hand = game.hands[p.id];
      const playable = game.getPlayableIds(p.id);
      io.to(p.id).emit('game-started', {
        hand,
        playable,
        publicState: game.getPublicState(),
        playerNames,
        myId: p.id,
        gameMode: room.gameMode,
        teams: game.teams,
        teamNames: game.teams ? TEAM_NAMES : null
      });
    });

    emitTurnInfo(room);
  });

  socket.on('play-card', ({ cardId, chosenColor, targetPlayer, chosenAction, stolenCardId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const game = room.game;

    if (game.currentPlayerSocketId() !== socket.id) {
      return socket.emit('error-msg', { message: 'Not your turn' });
    }

    let hand = game.hands[socket.id];
    if (!hand) return;
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return socket.emit('error-msg', { message: 'Card not in hand' });

    const card = hand[cardIndex];
    if (!game.canPlay(card)) return socket.emit('error-msg', { message: 'Cannot play this card' });

    // Validate wild color choice
    if (WILD_TYPES.includes(card.type) && (!chosenColor || !COLORS.includes(chosenColor))) {
      return socket.emit('error-msg', { message: 'Must choose a color' });
    }
    // Validate steal/skipall/sweetcalli target
    if ((card.type === 'steal' || card.type === 'skipall' || card.type === 'sweetcalli') && !targetPlayer) {
      return socket.emit('error-msg', { message: 'Must choose a target' });
    }
    // Can't target teammates
    if (game.teams && targetPlayer && ['steal', 'skipall', 'sweetcalli'].includes(card.type)) {
      if (game.getTeamOf(socket.id) === game.getTeamOf(targetPlayer)) {
        return socket.emit('error-msg', { message: "Can't target a teammate!" });
      }
    }
    // Validate snuggles action choice
    const SNUGGLES_ACTIONS = ['skip', 'reverse', 'draw2', 'discardall', 'wild', 'wilddraw4', 'draw6', 'draw10', 'wildskip', 'wildreverse', 'wilddraw2', 'steal', 'sweetcalli', 'tiggywiggy', 'skipall', 'nope', 'madmittens'];
    if (card.type === 'snuggles' && (!chosenAction || !SNUGGLES_ACTIONS.includes(chosenAction))) {
      return socket.emit('error-msg', { message: 'Must choose an action card' });
    }

    // Remove from hand and discard
    hand.splice(cardIndex, 1);
    game.discardPile.push(card);

    // Set active color
    if (WILD_TYPES.includes(card.type)) {
      game.activeColor = chosenColor;
    } else if (card.color) {
      game.activeColor = card.color;
    }

    // Broadcast
    io.to(room.code).emit('card-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      card,
      chosenColor: WILD_TYPES.includes(card.type) ? chosenColor : null,
      target: targetPlayer,
      targetName: targetPlayer ? room.getPlayerName(targetPlayer) : null
    });

    // Handle card effects
    let skipExtra = false;
    let skipAll = false;

    switch (card.type) {
      case 'kitty':
        break;

      case 'skip':
        skipExtra = true;
        break;

      case 'draw2':
        game.drawStack += 2;
        break;

      case 'draw6':
        game.drawStack += 6;
        break;

      case 'draw10':
        game.drawStack += 10;
        break;

      case 'reverse':
        game.direction *= -1;
        if (game.playerOrder.length === 2) skipExtra = true;
        io.to(room.code).emit('direction-changed', { direction: game.direction });
        break;

      case 'steal': {
        const targetHand = game.hands[targetPlayer];
        if (targetHand && targetHand.length > 0) {
          const randIdx = crypto.randomInt(targetHand.length);
          const stolen = targetHand.splice(randIdx, 1)[0];
          hand.push(stolen);
          socket.emit('card-received', { card: stolen });
          io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id) });
          // If victim has 0 cards after steal, auto-draw 1
          if (targetHand.length === 0) {
            game.reshuffleDeck();
            if (game.deck.length > 0) {
              const drawn = game.deck.pop();
              targetHand.push(drawn);
              io.to(targetPlayer).emit('card-drawn', { card: drawn });
            }
          }
          io.to(targetPlayer).emit('hand-updated', { hand: game.hands[targetPlayer] || [] });
        }
        break;
      }

      case 'sweetcalli': {
        const targetHandCalli = game.hands[targetPlayer];
        if (targetHandCalli && targetHandCalli.length > 0) {
          const stolenIdx = targetHandCalli.findIndex(c => c.id === stolenCardId);
          if (stolenIdx === -1) {
            // Card no longer in hand (race condition) — steal random instead
            const fallbackIdx = crypto.randomInt(targetHandCalli.length);
            const stolen = targetHandCalli.splice(fallbackIdx, 1)[0];
            hand.push(stolen);
            socket.emit('card-received', { card: stolen });
          } else {
            const stolen = targetHandCalli.splice(stolenIdx, 1)[0];
            hand.push(stolen);
            socket.emit('card-received', { card: stolen });
          }
          io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id) });
          io.to(room.code).emit('sweetcalli-played', {
            by: room.getPlayerName(socket.id),
            target: room.getPlayerName(targetPlayer)
          });
          // If victim has 0 cards after steal, auto-draw 1
          if (targetHandCalli.length === 0) {
            game.reshuffleDeck();
            if (game.deck.length > 0) {
              const drawn = game.deck.pop();
              targetHandCalli.push(drawn);
              io.to(targetPlayer).emit('card-drawn', { card: drawn });
            }
          }
          io.to(targetPlayer).emit('hand-updated', { hand: game.hands[targetPlayer] || [] });
        }
        break;
      }

      case 'skipall': {
        skipAll = true;
        // Swap hands with target
        const targetHandSwap = game.hands[targetPlayer];
        if (targetHandSwap) {
          game.hands[targetPlayer] = hand;
          game.hands[socket.id] = targetHandSwap;
          // Update local ref since hand was reassigned
          hand = game.hands[socket.id];
          // If target ended up with 0 cards after swap, auto-draw 1
          if (game.hands[targetPlayer].length === 0) {
            game.reshuffleDeck();
            if (game.deck.length > 0) {
              const drawn = game.deck.pop();
              game.hands[targetPlayer].push(drawn);
              io.to(targetPlayer).emit('card-drawn', { card: drawn });
            }
          }
          io.to(targetPlayer).emit('hand-updated', { hand: game.hands[targetPlayer] });
          socket.emit('hand-updated', { hand: game.hands[socket.id] });
        }
        io.to(room.code).emit('skip-all', {
          player: socket.id,
          playerName: room.getPlayerName(socket.id),
          target: targetPlayer,
          targetName: room.getPlayerName(targetPlayer)
        });
        break;
      }

      case 'discardall': {
        const discardColor = card.color;
        const toDiscard = [];
        for (let i = hand.length - 1; i >= 0; i--) {
          if (hand[i].color === discardColor && (hand[i].type === 'kitty' || hand[i].type === 'discardall')) {
            toDiscard.push(hand.splice(i, 1)[0]);
          }
        }
        toDiscard.forEach(c => game.discardPile.push(c));
        if (toDiscard.length > 0) {
          io.to(room.code).emit('cards-discarded', {
            player: socket.id,
            playerName: room.getPlayerName(socket.id),
            count: toDiscard.length,
            color: discardColor
          });
        }
        break;
      }

      case 'nope':
        if (game.drawStack > 0) {
          const cancelled = game.drawStack;
          game.drawStack = 0;
          game.drawStackLocked = false;
          io.to(room.code).emit('stack-cancelled', {
            by: room.getPlayerName(socket.id),
            amount: cancelled
          });
        }
        break;

      case 'madmittens': {
        const hissed = game.drawStack;
        game.drawStack += 2;
        game.drawStackLocked = true;
        io.to(room.code).emit('madmittens-played', {
          by: room.getPlayerName(socket.id),
          hissedAmount: hissed
        });
        break;
      }

      case 'wildskip':
        skipExtra = true;
        break;

      case 'wildreverse':
        game.direction *= -1;
        if (game.playerOrder.length === 2) skipExtra = true;
        io.to(room.code).emit('direction-changed', { direction: game.direction });
        break;

      case 'wilddraw2':
        game.drawStack += 2;
        break;

      case 'wild':
        break;

      case 'wilddraw4':
        game.drawStack += 4;
        break;

      case 'tiggywiggy': {
        // Peek top 10 cards of the deck and let player choose one
        game.reshuffleDeck();
        const peekCount = Math.min(10, game.deck.length);
        const peekCards = game.deck.slice(game.deck.length - peekCount);
        socket.emit('tiggywiggy-peek', { cards: peekCards });
        io.to(room.code).emit('tiggywiggy-played', {
          by: room.getPlayerName(socket.id)
        });
        // The actual card pick happens in the 'tiggywiggy-pick' event
        break;
      }

      case 'purr': {
        // Give opponents a card from the deck — can't be denied
        let purrTargets = game.playerOrder.filter(id => id !== socket.id);
        // In teams mode, only affect opponents
        if (game.teams) {
          const myTeam = game.getTeamOf(socket.id);
          purrTargets = purrTargets.filter(id => game.getTeamOf(id) !== myTeam);
        }
        for (const targetId of purrTargets) {
          game.reshuffleDeck();
          if (game.deck.length === 0) break;
          const drawnCard = game.deck.pop();
          game.hands[targetId].push(drawnCard);
          io.to(targetId).emit('card-drawn', { card: drawnCard });
          io.to(targetId).emit('hand-updated', { hand: game.hands[targetId] });
        }
        io.to(room.code).emit('purr-played', {
          playerName: room.getPlayerName(socket.id),
          count: purrTargets.length
        });
        break;
      }

      case 'snuggles': {
        // Create the chosen action card and add to player's hand
        const COLORED_ACTIONS = ['skip', 'reverse', 'draw2', 'discardall'];
        const newProps = {};
        if (COLORED_ACTIONS.includes(chosenAction)) {
          newProps.color = COLORS[crypto.randomInt(COLORS.length)];
        }
        const newCard = makeCard(chosenAction, newProps);
        hand.push(newCard);
        socket.emit('card-received', { card: newCard });

        skipAll = true;
        io.to(room.code).emit('snuggles-played', {
          playerName: room.getPlayerName(socket.id),
          chosenAction
        });
        break;
      }
    }

    // Re-read hand in case it was swapped (skipall)
    hand = game.hands[socket.id];

    // Check win AFTER card effects (important for discardall)
    if (!hand || hand.length === 0) {
      if (checkFinish(room, socket.id)) return;
    }

    // Update hand
    socket.emit('hand-updated', { hand: game.hands[socket.id] || [] });

    // Catto check — if player has exactly 1 card, start the vulnerability window
    if (hand && hand.length === 1) {
      startCattoWindow(room, socket.id);
    }

    // Advance turn (skipAll = your turn again)
    if (!skipAll) {
      game.advanceTurn();
      if (skipExtra) game.advanceTurn();
    }

    emitStateUpdate(room);
    emitTurnInfo(room);
  });

  // Sweet Calli — peek at target's hand to choose a card
  socket.on('sweetcalli-peek', ({ targetPlayer }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const game = room.game;
    if (game.currentPlayerSocketId() !== socket.id) return;
    const targetHand = game.hands[targetPlayer];
    if (!targetHand) return;
    socket.emit('sweetcalli-hand', { targetPlayer, hand: targetHand });
  });

  // Tiggy Wiggy — player picks a card from the peeked deck cards
  socket.on('tiggywiggy-pick', ({ chosenCardId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const game = room.game;
    const hand = game.hands[socket.id];
    if (!hand) return;

    // Find the chosen card in the deck
    const idx = game.deck.findIndex(c => c.id === chosenCardId);
    if (idx === -1) {
      // Card not found — just draw from top
      if (game.deck.length > 0) {
        const card = game.deck.pop();
        hand.push(card);
        socket.emit('card-received', { card });
      }
    } else {
      const card = game.deck.splice(idx, 1)[0];
      hand.push(card);
      socket.emit('card-received', { card });
    }

    socket.emit('hand-updated', { hand: game.hands[socket.id] });
    emitStateUpdate(room);
  });

  // Catto! — player declares they have 1 card
  socket.on('catto-call', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const entry = cattoVulnerable.get(room.code);
    if (!entry || entry.playerId !== socket.id) return;
    // Player called Catto in time — safe!
    entry.called = true;
    clearCatto(room.code);
    io.to(room.code).emit('catto-safe', { player: socket.id, playerName: room.getPlayerName(socket.id) });
  });

  // Challenge — another player catches someone who didn't call Catto
  socket.on('catto-challenge', ({ targetPlayer }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const game = room.game;
    const entry = cattoVulnerable.get(room.code);
    if (!entry || entry.playerId !== targetPlayer || entry.called) return;
    if (socket.id === targetPlayer) return; // Can't challenge yourself

    // Caught! Draw 2 penalty cards
    clearCatto(room.code);
    for (let i = 0; i < 2; i++) {
      game.reshuffleDeck();
      if (game.deck.length === 0) break;
      const card = game.deck.pop();
      game.hands[targetPlayer].push(card);
      io.to(targetPlayer).emit('card-drawn', { card });
    }
    io.to(targetPlayer).emit('hand-updated', { hand: game.hands[targetPlayer] });
    io.to(room.code).emit('catto-caught', {
      player: targetPlayer,
      playerName: room.getPlayerName(targetPlayer),
      challenger: socket.id,
      challengerName: room.getPlayerName(socket.id)
    });
    emitStateUpdate(room);
  });

  socket.on('draw-card', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const game = room.game;

    if (game.currentPlayerSocketId() !== socket.id) {
      return socket.emit('error-msg', { message: 'Not your turn' });
    }

    game.reshuffleDeck();
    if (game.deck.length === 0) {
      return socket.emit('error-msg', { message: 'Deck is empty' });
    }

    const drawCount = game.drawStack > 0 ? game.drawStack : 1;
    game.drawStack = 0;
    game.drawStackLocked = false;

    for (let i = 0; i < drawCount; i++) {
      if (game.deck.length === 0) {
        game.reshuffleDeck();
        if (game.deck.length === 0) break;
      }
      const card = drawWithDedup(game.deck, game.hands[socket.id]);
      if (!card) break;
      // Recolor discardall to match a color the player actually has
      if (card.type === 'discardall') {
        const hand = game.hands[socket.id];
        const colorsInHand = [...new Set(hand.filter(c => c.type === 'kitty' && c.color).map(c => c.color))];
        if (colorsInHand.length > 0) {
          card.color = colorsInHand[crypto.randomInt(colorsInHand.length)];
        }
      }
      game.hands[socket.id].push(card);
      socket.emit('card-drawn', { card });
      game.totalDrawn++;
      if (game.totalDrawn % 60 === 0) {
        game.restockRares();
      }
    }

    // Check hand limit (25 cards = eliminated)
    if (game.hands[socket.id].length > HAND_LIMIT) {
      const playerName = room.getPlayerName(socket.id);
      io.to(room.code).emit('player-eliminated', {
        player: socket.id,
        playerName,
        reason: 'hand-limit'
      });
      game.eliminatePlayer(socket.id);

      if (game.isGameOver()) {
        endGame(room);
        return;
      }
      emitStateUpdate(room);
      emitTurnInfo(room);
      return;
    }

    socket.emit('hand-updated', { hand: game.hands[socket.id] });
    game.advanceTurn();
    emitTurnInfo(room);
    emitStateUpdate(room);
  });

  socket.on('forfeit', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game || room.state !== 'playing') return;

    const game = room.game;
    const wasCurrent = game.currentPlayerSocketId() === socket.id;
    const playerName = room.getPlayerName(socket.id);

    io.to(room.code).emit('player-eliminated', {
      player: socket.id,
      playerName,
      reason: 'forfeit'
    });
    game.eliminatePlayer(socket.id);

    if (game.isGameOver()) {
      endGame(room);
    } else {
      if (wasCurrent) emitTurnInfo(room);
      emitStateUpdate(room);
    }

    socket.emit('forfeited');
  });

  // Rematch system
  socket.on('rematch-request', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.state !== 'finished' || !room.rematchVotes) return;

    room.rematchVotes.add(socket.id);
    emitRematchUpdate(room);
    tryStartRematch(room);
  });

  socket.on('rematch-decline', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    if (room.state === 'finished') {
      if (room.rematchVotes) room.rematchVotes.delete(socket.id);
      leaveRoom(room.code, socket.id);
      socket.leave(room.code);
      socket.emit('rematch-left');

      if (room.players.length > 0) {
        io.to(room.code).emit('player-left', { players: room.getPublicPlayers(), teams: room.teams });
        if (room.rematchVotes) {
          emitRematchUpdate(room);
          tryStartRematch(room);
        }
      }
    } else if (room.state === 'playing' && room.game) {
      // Rematch already started but player missed it — treat as forfeit
      const game = room.game;
      const wasCurrent = game.currentPlayerSocketId() === socket.id;
      const playerName = room.getPlayerName(socket.id);

      if (game.playerOrder.includes(socket.id)) {
        io.to(room.code).emit('player-eliminated', {
          player: socket.id,
          playerName,
          reason: 'forfeit'
        });
        game.eliminatePlayer(socket.id);
      }

      leaveRoom(room.code, socket.id);
      socket.leave(room.code);
      socket.emit('rematch-left');

      if (game.isGameOver()) {
        endGame(room);
      } else {
        if (wasCurrent) emitTurnInfo(room);
        emitStateUpdate(room);
      }
    }
  });

  // In-game chat with moderation
  socket.on('chat-message', ({ text }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (!text || typeof text !== 'string') return;

    // Rate limit
    const now = Date.now();
    const last = chatCooldowns.get(socket.id) || 0;
    if (now - last < CHAT_COOLDOWN) return socket.emit('error-msg', { message: 'Slow down!' });
    chatCooldowns.set(socket.id, now);

    // Sanitize and moderate
    const cleaned = text.trim().slice(0, 200);
    if (!cleaned) return;
    const moderated = moderateMessage(cleaned);

    io.to(room.code).emit('chat-message', {
      sender: socket.id,
      senderName: room.getPlayerName(socket.id),
      text: moderated
    });
  });

  socket.on('disconnect', () => {
    const sessionToken = socketToSession.get(socket.id);
    const room = getRoomBySocket(socket.id);

    if (room && sessionToken && (
      (room.game && room.state === 'playing') || room.state === 'finished'
    )) {
      // Give player 15 seconds to reconnect before removing
      const roomCode = room.code;
      const disconnectedState = room.state;
      const timerId = setTimeout(() => {
        disconnectTimers.delete(sessionToken);
        const currentRoom = getRoom(roomCode);
        if (!currentRoom) return;

        if (currentRoom.state === 'playing' && currentRoom.game) {
          // Room is in playing state (original game or rematch started during disconnect)
          if (!currentRoom.game.playerOrder.includes(socket.id)) {
            leaveRoom(roomCode, socket.id);
            return;
          }

          const playerName = currentRoom.getPlayerName(socket.id);
          const wasCurrent = currentRoom.game.currentPlayerSocketId() === socket.id;

          currentRoom.game.eliminatePlayer(socket.id);
          leaveRoom(roomCode, socket.id);

          io.to(currentRoom.code).emit('player-eliminated', {
            player: socket.id,
            playerName,
            reason: 'disconnect'
          });

          if (currentRoom.players.length === 0) return; // room already deleted

          if (currentRoom.game.isGameOver()) {
            endGame(currentRoom);
          } else {
            if (wasCurrent) emitTurnInfo(currentRoom);
            emitStateUpdate(currentRoom);
          }
        } else if (currentRoom.state === 'finished') {
          // Still in rematch voting — remove player
          if (currentRoom.rematchVotes) currentRoom.rematchVotes.delete(socket.id);
          leaveRoom(roomCode, socket.id);
          if (currentRoom.players.length > 0) {
            io.to(currentRoom.code).emit('player-left', { players: currentRoom.getPublicPlayers(), teams: currentRoom.teams });
            if (currentRoom.rematchVotes) {
              emitRematchUpdate(currentRoom);
              tryStartRematch(currentRoom);
            }
          }
        }
      }, 15000);

      disconnectTimers.set(sessionToken, { timerId, socketId: socket.id, roomCode });
    } else if (room) {
      // No session token or room in waiting state — immediate cleanup
      if (room.state === 'finished' && room.rematchVotes) {
        room.rematchVotes.delete(socket.id);
      }
      leaveRoom(room.code, socket.id);
      if (room.players.length > 0) {
        io.to(room.code).emit('player-left', { players: room.getPublicPlayers(), teams: room.teams });
        if (room.state === 'finished' && room.rematchVotes) {
          emitRematchUpdate(room);
          tryStartRematch(room);
        }
      }
    }

    if (sessionToken && !disconnectTimers.has(sessionToken)) {
      sessions.delete(sessionToken);
      socketToSession.delete(socket.id);
    }

    chatCooldowns.delete(socket.id);
    onlinePlayers.delete(socket.id);
    console.log(`Disconnected: ${socket.id}`);
  });
});

// Periodic cleanup of stale/ghost rooms every 60 seconds
setInterval(() => {
  const { rooms } = require('./rooms');
  // Build set of socket IDs that are in the reconnect grace period
  const reconnecting = new Set();
  for (const [, entry] of disconnectTimers) {
    reconnecting.add(entry.socketId);
  }
  for (const [code, room] of rooms) {
    // Check if any players are still connected or reconnecting
    const activePlayers = room.players.filter(p =>
      io.sockets.sockets.has(p.id) || reconnecting.has(p.id)
    );
    if (activePlayers.length === 0) {
      console.log(`Cleaning up ghost room ${code} (0 active players)`);
      rooms.delete(code);
      continue;
    }
    // Remove fully disconnected players (not reconnecting) from waiting rooms
    if (room.state === 'waiting') {
      const gone = room.players.filter(p =>
        !io.sockets.sockets.has(p.id) && !reconnecting.has(p.id)
      );
      for (const p of gone) {
        leaveRoom(code, p.id);
      }
      if (room.players.length > 0) {
        io.to(room.code).emit('player-left', { players: room.getPublicPlayers(), teams: room.teams });
      }
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kitten Catastrophe running on port ${PORT}`);
});
