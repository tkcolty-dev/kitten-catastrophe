const rooms = new Map();
const socketToRoom = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom(socketId, name, isPublic) {
  const code = generateCode();
  const room = {
    code,
    host: socketId,
    state: 'waiting',
    isPublic: isPublic !== false,
    game: null,
    players: [{ id: socketId, name: name || 'Player 1' }],
    getPublicPlayers() {
      return this.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.id === this.host
      }));
    },
    getPlayerName(socketId) {
      const p = this.players.find(pl => pl.id === socketId);
      return p ? p.name : 'Unknown';
    }
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return room;
}

function joinRoom(code, socketId, name) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (room.players.find(p => p.id === socketId)) return room;

  room.players.push({ id: socketId, name: name || `Player ${room.players.length + 1}` });
  socketToRoom.set(socketId, code);
  return room;
}

function leaveRoom(code, socketId) {
  const room = rooms.get(code);
  if (!room) return;

  room.players = room.players.filter(p => p.id !== socketId);
  socketToRoom.delete(socketId);

  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }

  if (room.host === socketId) {
    room.host = room.players[0].id;
  }
}

function getRoom(code) {
  return rooms.get(code.toUpperCase());
}

function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function getPublicRooms() {
  const list = [];
  for (const [code, room] of rooms) {
    if (room.isPublic && room.state === 'waiting' && room.players.length < 8) {
      list.push({
        code,
        hostName: room.getPlayerName(room.host),
        playerCount: room.players.length,
        maxPlayers: 8
      });
    }
  }
  return list;
}

function swapPlayer(code, oldSocketId, newSocketId) {
  const room = rooms.get(code);
  if (!room) return false;

  const player = room.players.find(p => p.id === oldSocketId);
  if (!player) return false;

  player.id = newSocketId;
  if (room.host === oldSocketId) room.host = newSocketId;

  socketToRoom.delete(oldSocketId);
  socketToRoom.set(newSocketId, code);

  // Swap rematch votes if applicable
  if (room.rematchVotes && room.rematchVotes.has(oldSocketId)) {
    room.rematchVotes.delete(oldSocketId);
    room.rematchVotes.add(newSocketId);
  }

  if (room.game) {
    const game = room.game;
    const idx = game.playerOrder.indexOf(oldSocketId);
    if (idx !== -1) game.playerOrder[idx] = newSocketId;
    if (game.hands[oldSocketId]) {
      game.hands[newSocketId] = game.hands[oldSocketId];
      delete game.hands[oldSocketId];
    }
  }

  return true;
}

module.exports = { createRoom, joinRoom, leaveRoom, getRoom, getRoomBySocket, getPublicRooms, swapPlayer };
