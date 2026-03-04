const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, joinRoom, leaveRoom, getRoom, getRoomBySocket } = require('./rooms');
const { startGame, playCard, drawCard, defusePosition, playHiss } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', ({ name }) => {
    const room = createRoom(socket.id, name);
    socket.join(room.code);
    socket.emit('room-created', { code: room.code });
    io.to(room.code).emit('player-joined', { players: room.getPublicPlayers() });
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

    const gameState = startGame(room);
    room.state = 'playing';
    room.game = gameState;

    // Build player names map
    const playerNames = {};
    room.players.forEach(p => { playerNames[p.id] = p.name; });

    // Send each player their private hand
    room.players.forEach(p => {
      const hand = gameState.hands[p.id];
      io.to(p.id).emit('game-started', {
        hand,
        players: gameState.getPublicState().players,
        playerNames,
        deckCount: gameState.deck.length,
        currentPlayer: gameState.currentPlayerSocketId(),
        myId: p.id
      });
    });

    io.to(room.code).emit('your-turn', { currentPlayer: gameState.currentPlayerSocketId() });
  });

  socket.on('play-card', ({ cardId, targetPlayer }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = playCard(room.game, socket.id, cardId, targetPlayer);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    // Broadcast what happened
    io.to(room.code).emit('card-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      card: result.card,
      target: targetPlayer,
      targetName: targetPlayer ? room.getPlayerName(targetPlayer) : null
    });

    // Handle specific card results
    if (result.peek) {
      socket.emit('peek-result', { cards: result.peek });
    }
    if (result.shuffled) {
      io.to(room.code).emit('deck-shuffled', { deckCount: room.game.deck.length });
    }
    if (result.stolenCard) {
      socket.emit('card-received', { card: result.stolenCard });
      io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id), cardId: result.stolenCard.id });
    }
    if (result.namedSteal) {
      if (result.stolenCard) {
        socket.emit('card-received', { card: result.stolenCard });
        io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id), cardId: result.stolenCard.id });
      } else {
        socket.emit('steal-failed', { message: 'Target has no card of that type' });
      }
    }
    if (result.extraTurn) {
      io.to(room.code).emit('extra-turn', {
        target: room.game.currentPlayerSocketId(),
        targetName: room.getPlayerName(room.game.currentPlayerSocketId()),
        turnsRemaining: room.game.turnsRemaining
      });
    }
    if (result.skipTurn) {
      advanceTurnAndNotify(room);
    }

    // Update hand for the player who played
    socket.emit('hand-updated', { hand: room.game.hands[socket.id] || [] });
    if (targetPlayer) {
      io.to(targetPlayer).emit('hand-updated', { hand: room.game.hands[targetPlayer] || [] });
    }
    io.to(room.code).emit('state-update', {
      deckCount: room.game.deck.length,
      players: room.game.getPublicState().players,
      discardTop: room.game.discardPile[room.game.discardPile.length - 1] || null
    });
  });

  socket.on('draw-card', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = drawCard(room.game, socket.id);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    if (result.catastrophe) {
      // Player drew a catastrophe card
      io.to(room.code).emit('catastrophe-drawn', {
        player: socket.id,
        playerName: room.getPlayerName(socket.id),
        card: result.card
      });

      if (result.canDefuse) {
        socket.emit('can-defuse', { card: result.card, defuseCardId: result.defuseCardId });
        // Start 5-second timer
        room.game.defuseTimer = setTimeout(() => {
          // Time ran out, lose a life
          const loseResult = room.game.loseLife(socket.id);
          handleLifeLoss(room, socket.id, loseResult);
        }, 5000);
      } else {
        // No defuse card, lose a life immediately
        const loseResult = room.game.loseLife(socket.id);
        handleLifeLoss(room, socket.id, loseResult);
      }
    } else {
      // Normal card drawn
      socket.emit('card-drawn', { card: result.card });
      socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
      advanceTurnAndNotify(room);
    }

    io.to(room.code).emit('state-update', {
      deckCount: room.game.deck.length,
      players: room.game.getPublicState().players,
      discardTop: room.game.discardPile[room.game.discardPile.length - 1] || null
    });
  });

  socket.on('defuse', ({ defuseCardId, position }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    // Clear the timer
    if (room.game.defuseTimer) {
      clearTimeout(room.game.defuseTimer);
      room.game.defuseTimer = null;
    }

    const result = defusePosition(room.game, socket.id, defuseCardId, position);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    io.to(room.code).emit('defused', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id)
    });

    socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
    io.to(room.code).emit('state-update', {
      deckCount: room.game.deck.length,
      players: room.game.getPublicState().players,
      discardTop: room.game.discardPile[room.game.discardPile.length - 1] || null
    });

    advanceTurnAndNotify(room);
  });

  socket.on('play-hiss', ({ targetAction }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = playHiss(room.game, socket.id);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    io.to(room.code).emit('hiss-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      cancelledAction: targetAction
    });

    socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
  });

  socket.on('play-breed-pair', ({ cardIds, targetPlayer }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = room.game.playBreedPair(socket.id, cardIds, targetPlayer);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    io.to(room.code).emit('card-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      card: { type: 'breed-pair', breed: result.breed },
      target: targetPlayer,
      targetName: room.getPlayerName(targetPlayer)
    });

    if (result.stolenCard) {
      socket.emit('card-received', { card: result.stolenCard });
      io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id) });
    }

    socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
    io.to(targetPlayer).emit('hand-updated', { hand: room.game.hands[targetPlayer] });
    io.to(room.code).emit('state-update', {
      deckCount: room.game.deck.length,
      players: room.game.getPublicState().players,
      discardTop: room.game.discardPile[room.game.discardPile.length - 1] || null
    });
  });

  socket.on('play-breed-triple', ({ cardIds, targetPlayer, cardType }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = room.game.playBreedTriple(socket.id, cardIds, targetPlayer, cardType);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    io.to(room.code).emit('card-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      card: { type: 'breed-triple', breed: result.breed },
      target: targetPlayer,
      targetName: room.getPlayerName(targetPlayer)
    });

    if (result.stolenCard) {
      socket.emit('card-received', { card: result.stolenCard });
      io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id), cardId: result.stolenCard.id });
    } else {
      socket.emit('steal-failed', { message: 'Target has no card of that type' });
    }

    socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
    io.to(targetPlayer).emit('hand-updated', { hand: room.game.hands[targetPlayer] });
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (room) {
      leaveRoom(room.code, socket.id);
      io.to(room.code).emit('player-left', { players: room.getPublicPlayers() });

      if (room.game && room.state === 'playing') {
        // If it was their turn, advance
        if (room.game.currentPlayerSocketId() === socket.id) {
          room.game.eliminatePlayer(socket.id);
          const winner = room.game.checkWinner();
          if (winner) {
            io.to(room.code).emit('game-over', {
              winner: winner,
              winnerName: room.getPlayerName(winner)
            });
            room.state = 'finished';
          } else {
            advanceTurnAndNotify(room);
          }
        } else {
          room.game.eliminatePlayer(socket.id);
          const winner = room.game.checkWinner();
          if (winner) {
            io.to(room.code).emit('game-over', {
              winner: winner,
              winnerName: room.getPlayerName(winner)
            });
            room.state = 'finished';
          }
        }
        io.to(room.code).emit('state-update', {
          deckCount: room.game.deck.length,
          players: room.game.getPublicState().players,
          discardTop: room.game.discardPile[room.game.discardPile.length - 1] || null
        });
      }
    }
    console.log(`Disconnected: ${socket.id}`);
  });

  function handleLifeLoss(room, playerId, loseResult) {
    io.to(room.code).emit('life-lost', {
      player: playerId,
      playerName: room.getPlayerName(playerId),
      lives: loseResult.lives
    });

    if (loseResult.eliminated) {
      io.to(room.code).emit('player-eliminated', {
        player: playerId,
        playerName: room.getPlayerName(playerId)
      });

      const winner = room.game.checkWinner();
      if (winner) {
        io.to(room.code).emit('game-over', {
          winner: winner,
          winnerName: room.getPlayerName(winner)
        });
        room.state = 'finished';
        return;
      }
    }

    io.to(playerId).emit('hand-updated', { hand: room.game.hands[playerId] || [] });
    advanceTurnAndNotify(room);
  }

  function advanceTurnAndNotify(room) {
    room.game.advanceTurn();
    io.to(room.code).emit('turn-changed', {
      currentPlayer: room.game.currentPlayerSocketId(),
      currentPlayerName: room.getPlayerName(room.game.currentPlayerSocketId()),
      turnsRemaining: room.game.turnsRemaining
    });
    io.to(room.code).emit('state-update', {
      deckCount: room.game.deck.length,
      players: room.game.getPublicState().players,
      discardTop: room.game.discardPile[room.game.discardPile.length - 1] || null
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kitten Catastrophe running on port ${PORT}`);
});
