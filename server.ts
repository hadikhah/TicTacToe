import express from 'express';
import { createServer } from 'http';
import next from 'next';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Ensure data dir exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Setup DB
const db = new Database(path.join(dataDir, 'database.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT NOT NULL,
    winner TEXT CHECK(winner IN ('X', 'O', 'draw')),
    moves TEXT NOT NULL,
    startTime DATETIME NOT NULL,
    endTime DATETIME NOT NULL
  )
`);

type Player = {
  id: string; // Socket ID
  symbol: 'X' | 'O';
};

type Room = {
  id: string;
  players: Player[];
  board: ('X' | 'O' | null)[];
  turn: 'X' | 'O';
  status: 'waiting' | 'playing' | 'finished';
  winner: 'X' | 'O' | 'draw' | null;
  moves: number[];
  startTime: number;
  bot?: boolean;
};

const rooms: Record<string, Room> = {};
let waitingPlayer: string | null = null;
const connectedPlayers: Set<string> = new Set();

function checkWinner(board: ('X' | 'O' | null)[]): 'X' | 'O' | 'draw' | null {
  const winConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
    [0, 4, 8], [2, 4, 6]             // Diags
  ];

  for (const condition of winConditions) {
    const [a, b, c] = condition;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (board.every((cell) => cell !== null)) {
    return 'draw';
  }

  return null;
}

function minimax(board: ('X' | 'O' | null)[], depth: number, isMaximizing: boolean): number {
  const winner = checkWinner(board);
  if (winner === 'O') return 10 - depth; // Bot wins
  if (winner === 'X') return depth - 10; // Human wins
  if (winner === 'draw') return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'O';
        const score = minimax(board, depth + 1, false);
        board[i] = null;
        bestScore = Math.max(score, bestScore);
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'X';
        const score = minimax(board, depth + 1, true);
        board[i] = null;
        bestScore = Math.min(score, bestScore);
      }
    }
    return bestScore;
  }
}

function getBestMove(board: ('X' | 'O' | null)[]): number {
  let bestScore = -Infinity;
  let move = -1;
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = 'O';
      const score = minimax(board, 0, false);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        move = i;
      }
    }
  }
  return move;
}

function saveGame(room: Room) {
  if (room.status !== 'finished') return;
  const insert = db.prepare(`
    INSERT INTO games (roomId, winner, moves, startTime, endTime)
    VALUES (?, ?, ?, ?, ?)
  `);
  insert.run(
    room.id,
    room.winner,
    JSON.stringify(room.moves),
    new Date(room.startTime).toISOString(),
    new Date().toISOString()
  );
}

app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  server.use(express.json());

  // Basic API for admin
  server.get('/api/admin/games', (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== 'Basic YWRtaW46YWRtaW4xMjM=') { // admin:admin123
      res.set('WWW-Authenticate', 'Basic realm="Secure Area"');
      res.status(401).send('Authentication required.');
      return;
    }
    const stmt = db.prepare('SELECT * FROM games ORDER BY id DESC');
    const allGames = stmt.all();
    res.json(allGames);
  });

  server.get('/api/admin/active-rooms', (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== 'Basic YWRtaW46YWRtaW4xMjM=') {
      res.set('WWW-Authenticate', 'Basic realm="Secure Area"');
      res.status(401).send('Authentication required.');
      return;
    }
    res.json(Object.keys(rooms).map(reqId => ({
      id: rooms[reqId].id,
      players: rooms[reqId].players,
      status: rooms[reqId].status,
      bot: rooms[reqId].bot
    })));
  });

  server.delete('/api/admin/games', (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== 'Basic YWRtaW46YWRtaW4xMjM=') { // admin:admin123
      res.set('WWW-Authenticate', 'Basic realm="Secure Area"');
      res.status(401).send('Authentication required.');
      return;
    }
    db.prepare('DELETE FROM games').run();
    res.json({ success: true });
  });

  io.on('connection', (socket) => {
    connectedPlayers.add(socket.id);

    socket.on('find_match', () => {
      if (waitingPlayer && waitingPlayer !== socket.id && connectedPlayers.has(waitingPlayer)) {
        // Match found
        const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const room: Room = {
          id: roomId,
          players: [
            { id: waitingPlayer, symbol: 'X' },
            { id: socket.id, symbol: 'O' }
          ],
          board: Array(9).fill(null),
          turn: 'X',
          status: 'playing',
          winner: null,
          moves: [],
          startTime: Date.now()
        };
        rooms[roomId] = room;
        const player1 = io.sockets.sockets.get(waitingPlayer);
        if (player1) player1.join(roomId);
        socket.join(roomId);
        
        io.to(roomId).emit('match_found', { ...room });
        waitingPlayer = null;
      } else {
        waitingPlayer = socket.id;
        
        // Start bot timeout (3 seconds)
        setTimeout(() => {
          if (waitingPlayer === socket.id) {
            waitingPlayer = null;
            const roomId = `room_bot_${Date.now()}`;
            const room: Room = {
              id: roomId,
              players: [{ id: socket.id, symbol: 'X' }],
              board: Array(9).fill(null),
              turn: 'X',
              status: 'playing',
              winner: null,
              moves: [],
              startTime: Date.now(),
              bot: true
            };
            rooms[roomId] = room;
            socket.join(roomId);
            io.to(roomId).emit('match_found', { ...room });
          }
        }, 3000);
      }
    });

    socket.on('make_move', ({ roomId, index, playerSymbol }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing' || room.turn !== playerSymbol || room.board[index] !== null) return;

      room.board[index] = playerSymbol;
      room.moves.push(index);
      room.turn = playerSymbol === 'X' ? 'O' : 'X';
      
      const winner = checkWinner(room.board);
      if (winner) {
        room.status = 'finished';
        room.winner = winner;
        saveGame(room);
      }
      
      io.to(roomId).emit('move_made', room);

      if (room.bot && room.status === 'playing' && room.turn === 'O') {
        setTimeout(() => {
          if (room.status !== 'playing') return;
          const bestMove = getBestMove(room.board);
          if (bestMove !== -1) {
            room.board[bestMove] = 'O';
            room.moves.push(bestMove);
            room.turn = 'X';
            
            const newWinner = checkWinner(room.board);
            if (newWinner) {
              room.status = 'finished';
              room.winner = newWinner;
              saveGame(room);
            }
            io.to(roomId).emit('move_made', room);
          }
        }, 500); // Small delay to mimic thinking
      }
    });

    socket.on('rematch', ({ roomId }) => {
      const room = rooms[roomId];
      if (room && room.status === 'finished') {
        room.board = Array(9).fill(null);
        room.status = 'playing';
        room.winner = null;
        room.moves = [];
        room.startTime = Date.now();
        room.turn = 'X'; // X always starts
        io.to(roomId).emit('match_found', room); // reuse match_found to restart
      }
    });

    socket.on('leave_room', ({ roomId }) => {
      const room = rooms[roomId];
      if (room) {
        socket.leave(roomId);
        if (room.status === 'playing') {
          room.status = 'finished';
          room.winner = room.players.find(p => p.id !== socket.id)?.symbol || 'draw';
          io.to(roomId).emit('opponent_left', room);
          if (!room.bot) saveGame(room);
        }
      }
    });

    socket.on('disconnect', () => {
      connectedPlayers.delete(socket.id);
      if (waitingPlayer === socket.id) waitingPlayer = null;

      // Check all rooms
      for (const [roomId, room] of Object.entries(rooms)) {
        if (room.players.some(p => p.id === socket.id)) {
          if (room.status === 'playing') {
            room.status = 'finished';
            room.winner = room.players.find(p => p.id !== socket.id)?.symbol || 'draw';
            io.to(roomId).emit('opponent_left', room);
            if (!room.bot) saveGame(room);
          }
        }
      }
    });
  });

  const { parse } = require('url');

  server.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url, true);
    return handle(req, res, parsedUrl);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
