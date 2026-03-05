const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, joinRoom, leaveRoom, getRoom, getRoomBySocket, getPublicRooms } = require('./rooms');
const { startGame, defusePosition, shuffle, COLORS } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

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
    if (game.pendingCatastrophe || game.pendingPeek) return;

    const hand = game.hands[socket.id];
    if (!hand) return;
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return socket.emit('error-msg', { message: 'Card not in hand' });

    const card = hand[cardIndex];
    if (!game.canPlay(card)) return socket.emit('error-msg', { message: 'Cannot play this card' });

    // Validate wild color
    if ((card.type === 'wild' || card.type === 'wilddraw4') && (!chosenColor || !COLORS.includes(chosenColor))) {
      return socket.emit('error-msg', { message: 'Must choose a color' });
    }
    // Validate steal target
    if (card.type === 'steal' && !targetPlayer) {
      return socket.emit('error-msg', { message: 'Must choose a target' });
    }

    // Remove from hand and discard
    hand.splice(cardIndex, 1);
    game.discardPile.push(card);

    // Set active color
    if (card.type === 'wild' || card.type === 'wilddraw4') {
      game.activeColor = chosenColor;
    } else if (card.color) {
      game.activeColor = card.color;
    }

    // Broadcast
    io.to(room.code).emit('card-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      card,
      chosenColor: (card.type === 'wild' || card.type === 'wilddraw4') ? chosenColor : null,
      target: targetPlayer,
      targetName: targetPlayer ? room.getPlayerName(targetPlayer) : null
    });

    // Player emptied their hand — they've finished!
    if (hand.length === 0) {
      const place = game.finishedOrder.length + 1;
      game.finishPlayer(socket.id);

      io.to(room.code).emit('player-finished', {
        player: socket.id,
        playerName: room.getPlayerName(socket.id),
        place
      });

      // If only 1 player left, game is over
      if (game.isGameOver()) {
        const lastPlayer = game.playerOrder[0];
        if (lastPlayer) {
          game.finishedOrder.push(lastPlayer);
        }
        io.to(room.code).emit('game-over', {
          winner: game.finishedOrder[0],
          winnerName: room.getPlayerName(game.finishedOrder[0]),
          rankings: game.finishedOrder.map((id, i) => ({
            place: i + 1,
            name: room.getPlayerName(id)
          }))
        });
        room.state = 'finished';
        return;
      }

      socket.emit('hand-updated', { hand: [] });
      emitStateUpdate(room);
      emitTurnInfo(room);
      return;
    }

    let skipExtra = false;

    switch (card.type) {
      case 'kitty':
        break;

      case 'skip':
        skipExtra = true;
        break;

      case 'draw2':
        game.drawStack += 2;
        break;

      case 'reverse':
        game.direction *= -1;
        if (game.playerOrder.length === 2) skipExtra = true;
        io.to(room.code).emit('direction-changed', { direction: game.direction });
        break;

      case 'steal': {
        const targetHand = game.hands[targetPlayer];
        if (targetHand && targetHand.length > 0) {
          const randIdx = Math.floor(Math.random() * targetHand.length);
          const stolen = targetHand.splice(randIdx, 1)[0];
          hand.push(stolen);
          socket.emit('card-received', { card: stolen });
          io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id) });
          io.to(targetPlayer).emit('hand-updated', { hand: game.hands[targetPlayer] || [] });
        }
        break;
      }

      case 'shuffle':
        shuffle(game.deck);
        io.to(room.code).emit('deck-shuffled', { deckCount: game.deck.length });
        break;

      case 'nope':
        if (game.drawStack > 0) {
          const cancelled = game.drawStack;
          game.drawStack = 0;
          io.to(room.code).emit('stack-cancelled', {
            by: room.getPlayerName(socket.id),
            amount: cancelled
          });
        }
        break;

      case 'wild':
        break;

      case 'wilddraw4':
        game.drawStack += 4;
        break;
    }

    // Update hand
    socket.emit('hand-updated', { hand: game.hands[socket.id] || [] });

    // Advance turn
    game.advanceTurn();
    if (skipExtra) game.advanceTurn();

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
    if (game.pendingCatastrophe || game.pendingPeek) return;

    // Reshuffle if needed
    game.reshuffleDeck();
    if (game.deck.length === 0) {
      return socket.emit('error-msg', { message: 'Deck is empty' });
    }

    const drawCount = game.drawStack > 0 ? game.drawStack : 1;
    game.drawStack = 0;

    let hitCatastrophe = false;

    for (let i = 0; i < drawCount && game.deck.length > 0; i++) {
      const card = game.deck.pop();

      if (card.type === 'catastrophe') {
        hitCatastrophe = true;
        game.pendingCatastrophe = { playerId: socket.id, card };

        io.to(room.code).emit('catastrophe-drawn', {
          player: socket.id,
          playerName: room.getPlayerName(socket.id),
          card
        });

        const hand = game.hands[socket.id];
        const defuseCard = hand ? hand.find(c => c.type === 'defuse') : null;

        if (defuseCard) {
          socket.emit('can-defuse', { card, defuseCardId: defuseCard.id });
          game.defuseTimer = setTimeout(() => {
            handleCatastrophePenalty(room, socket.id);
          }, 5000);
        } else {
          handleCatastrophePenalty(room, socket.id);
        }
        break;
      }

      game.hands[socket.id].push(card);
      socket.emit('card-drawn', { card });
    }

    if (!hitCatastrophe) {
      socket.emit('hand-updated', { hand: game.hands[socket.id] });
      game.advanceTurn();
      emitTurnInfo(room);
    }

    emitStateUpdate(room);
  });

  socket.on('defuse', ({ defuseCardId, position }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

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
    room.game.advanceTurn();
    emitStateUpdate(room);
    emitTurnInfo(room);
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (room) {
      leaveRoom(room.code, socket.id);
      io.to(room.code).emit('player-left', { players: room.getPublicPlayers() });

      if (room.game && room.state === 'playing') {
        const wasCurrent = room.game.currentPlayerSocketId() === socket.id;
        room.game.eliminatePlayer(socket.id);
        if (room.game.isGameOver()) {
          const lastPlayer = room.game.playerOrder[0];
          if (lastPlayer) room.game.finishedOrder.push(lastPlayer);
          io.to(room.code).emit('game-over', {
            winner: room.game.finishedOrder[0] || lastPlayer,
            winnerName: room.getPlayerName(room.game.finishedOrder[0] || lastPlayer),
            rankings: room.game.finishedOrder.map((id, i) => ({
              place: i + 1,
              name: room.getPlayerName(id)
            }))
          });
          room.state = 'finished';
        } else if (wasCurrent) {
          emitTurnInfo(room);
        }
        emitStateUpdate(room);
      }
    }
    console.log(`Disconnected: ${socket.id}`);
  });

  function handleCatastrophePenalty(room, playerId) {
    const game = room.game;
    const catastropheCard = game.pendingCatastrophe?.card;
    game.pendingCatastrophe = null;

    // Catastrophe card goes to discard
    if (catastropheCard) game.discardPile.push(catastropheCard);

    // Remove best card from hand as penalty
    const removed = game.removeBestCard(playerId);

    io.to(room.code).emit('catastrophe-penalty', {
      player: playerId,
      playerName: room.getPlayerName(playerId),
      removedCard: removed
    });

    io.to(playerId).emit('hand-updated', { hand: game.hands[playerId] || [] });

    game.advanceTurn();
    emitTurnInfo(room);
    emitStateUpdate(room);
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
      activeColor: game.activeColor
    });

    // Send playable card IDs to current player
    io.to(currentId).emit('playable-cards', { playable });
  }

  function emitStateUpdate(room) {
    io.to(room.code).emit('state-update', room.game.getPublicState());
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kitten Catastrophe running on port ${PORT}`);
});
