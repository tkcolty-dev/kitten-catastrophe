const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, joinRoom, leaveRoom, getRoom, getRoomBySocket, getPublicRooms, swapPlayer } = require('./rooms');
const crypto = require('crypto');
const { startGame, shuffle, COLORS, HAND_LIMIT } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));

// Session management for reconnection
const sessions = new Map();         // sessionToken -> socketId
const socketToSession = new Map();   // socketId -> sessionToken
const disconnectTimers = new Map();  // sessionToken -> { timerId, socketId, roomCode }

const WILD_TYPES = ['wild', 'wilddraw4', 'draw6', 'draw10', 'wildskip', 'wildreverse', 'wilddraw2', 'madmittens'];

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
        myId: p.id
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
            roomCode: pending.roomCode
          });
          emitStateUpdate(room);
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
      io.to(room.code).emit('player-joined', { players: room.getPublicPlayers() });
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
    io.to(room.code).emit('player-joined', { players: room.getPublicPlayers() });
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
    socket.emit('room-joined', { code, players: room.getPublicPlayers() });
    io.to(code).emit('player-joined', { players: room.getPublicPlayers() });
  });

  socket.on('start-game', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error-msg', { message: 'Only host can start' });
    if (room.players.length < 2) return socket.emit('error-msg', { message: 'Need at least 2 players' });

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
        myId: p.id
      });
    });

    emitTurnInfo(room);
  });

  socket.on('play-card', ({ cardId, chosenColor, targetPlayer }) => {
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
    // Validate steal/skipall target
    if ((card.type === 'steal' || card.type === 'skipall') && !targetPlayer) {
      return socket.emit('error-msg', { message: 'Must choose a target' });
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

      case 'skipall': {
        skipAll = true;
        // Swap hands with target
        const targetHandSwap = game.hands[targetPlayer];
        if (targetHandSwap) {
          game.hands[targetPlayer] = hand;
          game.hands[socket.id] = targetHandSwap;
          // Update local ref since hand was reassigned
          hand = game.hands[socket.id];
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
          if (hand[i].type === 'kitty' && hand[i].color === discardColor) {
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
        game.drawStack = 2;
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
    }

    // Re-read hand in case it was swapped (skipall)
    hand = game.hands[socket.id];

    // Check win AFTER card effects (important for discardall)
    if (!hand || hand.length === 0) {
      if (checkFinish(room, socket.id)) return;
    }

    // Update hand
    socket.emit('hand-updated', { hand: game.hands[socket.id] || [] });

    // Advance turn (skipAll = your turn again)
    if (!skipAll) {
      game.advanceTurn();
      if (skipExtra) game.advanceTurn();
    }

    emitStateUpdate(room);
    emitTurnInfo(room);
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
      const card = game.deck.pop();
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
    if (!room || room.state !== 'finished') return;

    if (room.rematchVotes) room.rematchVotes.delete(socket.id);
    leaveRoom(room.code, socket.id);
    socket.leave(room.code);
    socket.emit('rematch-left');

    if (room.players.length > 0) {
      io.to(room.code).emit('player-left', { players: room.getPublicPlayers() });
      emitRematchUpdate(room);
      tryStartRematch(room);
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

    if (room && room.game && room.state === 'playing' && sessionToken) {
      // Give player 15 seconds to reconnect before eliminating
      const roomCode = room.code;
      const timerId = setTimeout(() => {
        disconnectTimers.delete(sessionToken);
        const currentRoom = getRoom(roomCode);
        if (!currentRoom || !currentRoom.game || currentRoom.state !== 'playing') return;
        if (!currentRoom.game.playerOrder.includes(socket.id)) return;

        const playerName = currentRoom.getPlayerName(socket.id);
        const wasCurrent = currentRoom.game.currentPlayerSocketId() === socket.id;

        currentRoom.game.eliminatePlayer(socket.id);

        io.to(currentRoom.code).emit('player-eliminated', {
          player: socket.id,
          playerName,
          reason: 'disconnect'
        });

        if (currentRoom.game.isGameOver()) {
          endGame(currentRoom);
        } else {
          if (wasCurrent) emitTurnInfo(currentRoom);
          emitStateUpdate(currentRoom);
        }
      }, 15000);

      disconnectTimers.set(sessionToken, { timerId, socketId: socket.id, roomCode });
    } else if (room) {
      // Clean up rematch votes if leaving during finished state
      if (room.state === 'finished' && room.rematchVotes) {
        room.rematchVotes.delete(socket.id);
      }
      leaveRoom(room.code, socket.id);
      if (room.players.length > 0) {
        io.to(room.code).emit('player-left', { players: room.getPublicPlayers() });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kitten Catastrophe running on port ${PORT}`);
});
