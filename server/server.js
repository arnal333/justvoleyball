import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);

const rooms = new Map();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function makeRoomCode() {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function leaveRoom(ws) {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  ws.roomCode = null;
  if (!room) return;

  room.clients.delete(ws);
  for (const client of room.clients) {
    send(client, { type: 'peer-left', code });
  }
  if (room.clients.size === 0) rooms.delete(code);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, service: 'just-volleyball-alpha' }));
    return;
  }

  // WebSocket is upgraded separately at /ws.
  if (pathname === '/ws') {
    res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Use WebSocket on /ws');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.fbx': 'application/octet-stream',
      '.glb': 'model/gltf-binary',
      '.gltf': 'model/gltf+json',
      '.obj': 'text/plain; charset=utf-8'
    };

    res.writeHead(200, {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(safePath).pipe(res);
  });
});

const wss = new WebSocketServer({
  noServer: true,
  clientTracking: true,
  perMessageDeflate: false
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomCode = null;
  ws.role = null;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return send(ws, { type: 'error', message: 'Mensaje inválido.' }); }

    if (msg.type === 'create-room') {
      leaveRoom(ws);
      const code = makeRoomCode();
      const room = {
        code,
        mode: msg.mode === 'cross' ? 'cross' : 'duo',
        clients: new Set([ws]),
        host: ws,
        createdAt: Date.now()
      };
      rooms.set(code, room);
      ws.roomCode = code;
      ws.role = 'host';
      ws.slot = room.mode === 'duo' ? 'home1' : 'home0';
      send(ws, { type: 'room-created', code, role: ws.role, slot: ws.slot, mode: room.mode });
      return;
    }

    if (msg.type === 'join-room') {
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'error', message: 'Sala no encontrada.' });
      if (room.clients.size >= 2) return send(ws, { type: 'error', message: 'La sala ya está llena.' });

      leaveRoom(ws);
      room.clients.add(ws);
      ws.roomCode = code;
      ws.role = 'guest';
      ws.slot = room.mode === 'duo' ? 'home1' : 'away0';

      send(ws, { type: 'room-joined', code, role: ws.role, slot: ws.slot, mode: room.mode });
      send(room.host, { type: 'peer-ready', code, guestSlot: ws.slot, mode: room.mode });
      send(ws, { type: 'peer-ready', code, guestSlot: ws.slot, mode: room.mode });
      return;
    }

    const code = ws.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room) return send(ws, { type: 'error', message: 'No estás en una sala.' });

    if (msg.type === 'input' && ws.role === 'guest') {
      send(room.host, { type: 'remote-input', input: msg.input || {}, tick: msg.tick || 0 });
      return;
    }

    if (msg.type === 'snapshot' && ws.role === 'host') {
      for (const client of room.clients) {
        if (client !== ws) send(client, { type: 'snapshot', snapshot: msg.snapshot });
      }
      return;
    }

    if (msg.type === 'leave') {
      leaveRoom(ws);
      send(ws, { type: 'left-room' });
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Just Volleyball Alpha → http://localhost:${PORT}`);
  console.log(`WebSocket → ws://localhost:${PORT}/ws`);
});

process.on('SIGINT', () => {
  clearInterval(heartbeat);
  server.close(() => process.exit(0));
});
