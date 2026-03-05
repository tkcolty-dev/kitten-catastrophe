const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, joinRoom, leaveRoom, getRoom, getRoomBySocket } = require('./rooms');
const { startGame, rollDice, resolveSpace, playCard, playHiss, shopBuy } = require('./game');
const { BOARD_NODES, BOARD_WIDTH, BOARD_HEIGHT, moveAlongPath, continueFromFork, getNode } = require('./board');

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

    const playerNames = {};
    room.players.forEach(p => { playerNames[p.id] = p.name; });

    const boardLayout = {
      nodes: BOARD_NODES,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
    };

    // Send each player their hand + board data
    room.players.forEach(p => {
      io.to(p.id).emit('game-started', {
        hand: gameState.hands[p.id],
        players: gameState.getPublicState().players,
        playerNames,
        boardLayout,
        positions: gameState.positions,
        playerColors: gameState.playerColors,
        properties: gameState.properties,
        catnip: gameState.catnip,
        boardDeckCount: gameState.boardDeck.length,
        currentPlayer: gameState.currentPlayerSocketId(),
        myId: p.id,
      });
    });

    io.to(room.code).emit('your-turn', { currentPlayer: gameState.currentPlayerSocketId() });
  });

  // --- Card playing (action phase, before rolling) ---

  socket.on('play-card', ({ cardId, targetPlayer }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = playCard(room.game, socket.id, cardId, targetPlayer);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    io.to(room.code).emit('card-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      card: result.card,
      target: targetPlayer,
      targetName: targetPlayer ? room.getPlayerName(targetPlayer) : null,
    });

    // Handle card-specific results
    if (result.peek) {
      socket.emit('peek-result', { spaces: result.peek });
    }
    if (result.shuffled) {
      io.to(room.code).emit('deck-shuffled', { boardDeckCount: room.game.boardDeck.length });
    }
    if (result.stolenCard) {
      socket.emit('card-received', { card: result.stolenCard });
      io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id), cardId: result.stolenCard.id });
    }
    if (result.zoomiesTarget) {
      // Target gets 2 turns on their next turn
      const targetId = result.zoomiesTarget;
      // Find target's index and set them up for 2 turns after current player
      room.game._pendingZoomies = { targetId, turns: 2 };
      io.to(room.code).emit('extra-turn', {
        target: targetId,
        targetName: room.getPlayerName(targetId),
        turnsRemaining: 2,
      });
    }
    if (result.skipTurn) {
      // Catnap — skip turn without rolling
      addToLog(room, `${room.getPlayerName(socket.id)} takes a catnap!`);
      advanceTurnAndNotify(room);
    }

    socket.emit('hand-updated', { hand: room.game.hands[socket.id] || [] });
    if (targetPlayer) {
      io.to(targetPlayer).emit('hand-updated', { hand: room.game.hands[targetPlayer] || [] });
    }
    broadcastState(room);
  });

  // --- Dice rolling ---

  socket.on('roll-dice', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const game = room.game;

    if (game.currentPlayerSocketId() !== socket.id) {
      return socket.emit('error-msg', { message: 'Not your turn' });
    }
    if (game.hasRolled) {
      return socket.emit('error-msg', { message: 'Already rolled this turn' });
    }
    if (game.pendingFork) {
      return socket.emit('error-msg', { message: 'Choose a path first' });
    }

    const roll = rollDice();
    game.hasRolled = true;

    io.to(room.code).emit('dice-rolled', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      roll,
    });

    // Compute movement
    const moveResult = moveAlongPath(game.positions[socket.id], roll);

    if (moveResult.fork) {
      // Player hit a fork — needs to choose
      game.pendingFork = {
        playerId: socket.id,
        remainingSteps: moveResult.remainingSteps,
        options: moveResult.options,
      };

      // Send partial movement up to the fork
      if (moveResult.path.length > 0) {
        game.positions[socket.id] = moveResult.currentNode;
        io.to(room.code).emit('player-moved', {
          player: socket.id,
          path: moveResult.path,
          finalPosition: moveResult.currentNode,
          partial: true,
        });
      }

      // Ask player to choose
      const optionNodes = moveResult.options.map(id => {
        const n = getNode(id);
        return { id: n.id, type: n.type };
      });
      socket.emit('fork-choice', { options: optionNodes, remainingSteps: moveResult.remainingSteps });
    } else {
      // Normal movement — move to final position
      game.positions[socket.id] = moveResult.finalPosition;

      io.to(room.code).emit('player-moved', {
        player: socket.id,
        path: moveResult.path,
        finalPosition: moveResult.finalPosition,
        partial: false,
      });

      // Resolve the landing space
      finishMovement(room, socket.id);
    }
  });

  // --- Fork choice ---

  socket.on('choose-fork', ({ nodeId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const game = room.game;

    if (!game.pendingFork || game.pendingFork.playerId !== socket.id) {
      return socket.emit('error-msg', { message: 'No fork to choose' });
    }

    const { remainingSteps, options } = game.pendingFork;
    if (!options.includes(nodeId)) {
      return socket.emit('error-msg', { message: 'Invalid path choice' });
    }

    game.pendingFork = null;

    // Continue movement from chosen path
    const moveResult = continueFromFork(nodeId, remainingSteps);

    if (moveResult.fork) {
      // Hit another fork
      game.pendingFork = {
        playerId: socket.id,
        remainingSteps: moveResult.remainingSteps,
        options: moveResult.options,
      };

      game.positions[socket.id] = moveResult.currentNode;
      io.to(room.code).emit('player-moved', {
        player: socket.id,
        path: moveResult.path,
        finalPosition: moveResult.currentNode,
        partial: true,
      });

      const optionNodes = moveResult.options.map(id => {
        const n = getNode(id);
        return { id: n.id, type: n.type };
      });
      socket.emit('fork-choice', { options: optionNodes, remainingSteps: moveResult.remainingSteps });
    } else {
      game.positions[socket.id] = moveResult.finalPosition;

      io.to(room.code).emit('player-moved', {
        player: socket.id,
        path: moveResult.path,
        finalPosition: moveResult.finalPosition,
        partial: false,
      });

      finishMovement(room, socket.id);
    }
  });

  // --- HISS! counter ---

  socket.on('play-hiss', ({ targetAction }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = playHiss(room.game, socket.id);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    io.to(room.code).emit('hiss-played', {
      player: socket.id,
      playerName: room.getPlayerName(socket.id),
      cancelledAction: targetAction,
    });

    socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
  });

  // --- Breed pairs/triples ---

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
      targetName: room.getPlayerName(targetPlayer),
    });

    if (result.stolenCard) {
      socket.emit('card-received', { card: result.stolenCard });
      io.to(targetPlayer).emit('card-stolen', { by: room.getPlayerName(socket.id) });
    }

    socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
    io.to(targetPlayer).emit('hand-updated', { hand: room.game.hands[targetPlayer] });
    broadcastState(room);
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
      targetName: room.getPlayerName(targetPlayer),
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

  // --- Shop ---

  socket.on('shop-buy', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = shopBuy(room.game, socket.id);
    if (result.error) return socket.emit('error-msg', { message: result.error });

    result.cards.forEach(card => {
      io.to(socket.id).emit('board-card-drawn', { card });
    });
    socket.emit('hand-updated', { hand: room.game.hands[socket.id] });
    addToLog(room, `${room.getPlayerName(socket.id)} bought ${result.cards.length} cards from the shop!`);
    broadcastState(room);
  });

  // --- Disconnect ---

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (room) {
      leaveRoom(room.code, socket.id);
      io.to(room.code).emit('player-left', { players: room.getPublicPlayers() });

      if (room.game && room.state === 'playing') {
        room.game.eliminatePlayer(socket.id);
        const winner = room.game.checkWinner();
        if (winner) {
          io.to(room.code).emit('game-over', {
            winner,
            winnerName: room.getPlayerName(winner),
            reason: 'last-standing',
          });
          room.state = 'finished';
        } else {
          if (room.game.currentPlayerSocketId() === socket.id) {
            advanceTurnAndNotify(room);
          }
        }
        broadcastState(room);
      }
    }
    console.log(`Disconnected: ${socket.id}`);
  });

  // --- Helpers ---

  function finishMovement(room, playerId) {
    const game = room.game;
    const spaceResult = resolveSpace(game, playerId);

    io.to(room.code).emit('space-landed', {
      player: playerId,
      playerName: room.getPlayerName(playerId),
      spaceType: spaceResult.type,
      effect: spaceResult.effect,
    });

    // Handle space effects
    if (spaceResult.effect === 'card-drawn' && spaceResult.card) {
      io.to(playerId).emit('board-card-drawn', { card: spaceResult.card });
      io.to(playerId).emit('hand-updated', { hand: game.hands[playerId] });
    }

    if (spaceResult.effect === 'catnip') {
      addToLog(room, `${room.getPlayerName(playerId)} found 1 catnip!`);
    }

    if (spaceResult.effect === 'claimed') {
      io.to(room.code).emit('property-claimed', {
        player: playerId,
        playerName: room.getPlayerName(playerId),
        nodeId: spaceResult.nodeId,
      });
      addToLog(room, `${room.getPlayerName(playerId)} claimed a property!`);
    }

    if (spaceResult.effect === 'own-property') {
      addToLog(room, `${room.getPlayerName(playerId)} earned 1 catnip from their property.`);
    }

    if (spaceResult.effect === 'rent-paid') {
      const ownerName = room.getPlayerName(spaceResult.owner);
      addToLog(room, `${room.getPlayerName(playerId)} paid 1 catnip rent to ${ownerName}!`);
    }

    if (spaceResult.effect === 'rent-card') {
      const ownerName = room.getPlayerName(spaceResult.owner);
      addToLog(room, `${room.getPlayerName(playerId)} paid a card as rent to ${ownerName}!`);
      io.to(playerId).emit('hand-updated', { hand: game.hands[playerId] });
      io.to(spaceResult.owner).emit('hand-updated', { hand: game.hands[spaceResult.owner] });
    }

    if (spaceResult.effect === 'rent-broke') {
      addToLog(room, `${room.getPlayerName(playerId)} can't pay rent!`);
    }

    if (spaceResult.effect === 'shop-available') {
      addToLog(room, `${room.getPlayerName(playerId)} reached the shop!`);
    }

    if (spaceResult.effect === 'defused') {
      io.to(room.code).emit('defused', {
        player: playerId,
        playerName: room.getPlayerName(playerId),
      });
      io.to(playerId).emit('hand-updated', { hand: game.hands[playerId] });
    }

    if (spaceResult.effect === 'life-lost') {
      // If there's a goBack, broadcast the backward movement
      if (spaceResult.goBack) {
        io.to(room.code).emit('player-moved', {
          player: playerId,
          path: spaceResult.goBack.path,
          finalPosition: spaceResult.goBack.finalPosition,
          partial: false,
        });
        addToLog(room, `${room.getPlayerName(playerId)} was sent back 3 spaces!`);
      }
      handleLifeLoss(room, playerId, spaceResult);
      return;
    }

    if (spaceResult.effect === 'jumped') {
      // Shortcut — moved to a new node, broadcast updated position
      io.to(room.code).emit('player-moved', {
        player: playerId,
        path: [spaceResult.to],
        finalPosition: spaceResult.to,
        partial: false,
        shortcut: true,
      });
    }

    if (spaceResult.effect === 'winner') {
      io.to(room.code).emit('game-over', {
        winner: playerId,
        winnerName: room.getPlayerName(playerId),
        reason: 'finish',
      });
      room.state = 'finished';
      broadcastState(room);
      return;
    }

    broadcastState(room);
    advanceTurnAndNotify(room);
  }

  function handleLifeLoss(room, playerId, loseResult) {
    io.to(room.code).emit('life-lost', {
      player: playerId,
      playerName: room.getPlayerName(playerId),
      lives: loseResult.lives,
    });

    if (loseResult.eliminated) {
      io.to(room.code).emit('player-eliminated', {
        player: playerId,
        playerName: room.getPlayerName(playerId),
      });

      const winner = room.game.checkWinner();
      if (winner) {
        io.to(room.code).emit('game-over', {
          winner,
          winnerName: room.getPlayerName(winner),
          reason: 'last-standing',
        });
        room.state = 'finished';
        broadcastState(room);
        return;
      }
    }

    io.to(playerId).emit('hand-updated', { hand: room.game.hands[playerId] || [] });
    broadcastState(room);
    advanceTurnAndNotify(room);
  }

  function advanceTurnAndNotify(room) {
    const game = room.game;

    // Check for pending zoomies
    if (game._pendingZoomies) {
      const { targetId, turns } = game._pendingZoomies;
      game._pendingZoomies = null;
      const idx = game.playerOrder.indexOf(targetId);
      if (idx !== -1) {
        game.currentTurnIndex = idx;
        game.turnsRemaining = turns;
        game.hasRolled = false;
      } else {
        game.advanceTurn();
      }
    } else {
      game.advanceTurn();
    }

    io.to(room.code).emit('turn-changed', {
      currentPlayer: game.currentPlayerSocketId(),
      currentPlayerName: room.getPlayerName(game.currentPlayerSocketId()),
      turnsRemaining: game.turnsRemaining,
    });
    broadcastState(room);
  }

  function broadcastState(room) {
    io.to(room.code).emit('state-update', room.game.getPublicState());
  }

  function addToLog(room, message) {
    io.to(room.code).emit('log-message', { message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kitten Catastrophe running on port ${PORT}`);
});
