// Servidor de producción/Railway: estático (dist/) + salas multijugador (WebSocket).
// Railway ejecuta: `npm install` -> `npm run build` -> `npm start` (node server.js).
//
// Salas (modo jefe co-op, Fase 1): crear/unirse por código de 4 letras, máx 4
// jugadores, el anfitrión elige dificultad y arranca; el servidor retransmite el
// estado de cada jugador (posición/orientación) al resto de la sala.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import HeadlessWorld from './src/sim/HeadlessWorld.js';
import { WORLD, BOSS_MODE_WORLD_MULT } from './src/systems/shared.js';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = process.env.PORT || 4173;
const MAX_PLAYERS = 4;

// --- Servidor estático ------------------------------------------------------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function send(res, filePath) {
  const data = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': TYPES[extname(filePath)] || 'application/octet-stream' });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    // Ruta segura dentro de dist/ (evita path traversal).
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = normalize(join(DIST, urlPath));
    if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end('Forbidden'); return; }

    let info = await stat(filePath).catch(() => null);
    if (info && info.isDirectory()) { filePath = join(filePath, 'index.html'); info = await stat(filePath).catch(() => null); }

    if (info && info.isFile()) { await send(res, filePath); return; }
    await send(res, join(DIST, 'index.html')); // fallback (una sola página)
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

// --- Salas multijugador (WebSocket) ------------------------------------------
const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { code, players: Map(id -> {ws, name}), hostId, started }
let nextId = 1;

// Código de sala de 4 letras sin caracteres confusos (sin O/0, I/1...).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c = '';
  do {
    c = '';
    for (let i = 0; i < 4; i += 1) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(c));
  return c;
}

function roomInfo(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: [...room.players].map(([id, p]) => ({ id, name: p.name })),
  };
}

function broadcast(room, msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const [id, p] of room.players) {
    if (id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  }
}

// --- Partida co-op autoritaria (Fase 2b) --------------------------------------
// El servidor corre un HeadlessWorld por sala a TICK_HZ y difunde un snapshot a
// SNAP_HZ. Los clientes envían inputs (posición reportada + intención de disparo);
// el servidor manda en enemigos, daño, munición, derribo/reanimación y victoria.
const TICK_DT = 1 / 30;   // simulación a 30 Hz
const SNAP_EVERY = 2;     // snapshot cada 2 ticks (15 Hz)

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function startRoomGame(room, diff) {
  const world = new HeadlessWorld({ arenaSize: WORLD * BOSS_MODE_WORLD_MULT });
  for (const [id, p] of room.players) {
    world.addPlayer(id);
    if (p.loadout) world.applyLoadout(id, p.loadout);
  }
  world.startBossLevel(diff);
  room.world = world;
  let t = 0;
  let tick = 0;
  room.timer = setInterval(() => {
    t += TICK_DT;
    tick += 1;
    world.step(TICK_DT, t);
    if (tick % SNAP_EVERY === 0 || world.gameOver || world.victory) {
      broadcast(room, buildSnap(room));
      if (world.gameOver || world.victory) stopRoomGame(room);
    }
  }, TICK_DT * 1000);
}

function stopRoomGame(room) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
  room.world = null;
  room.started = false; // la sala puede volver a arrancar desde el lobby
}

function buildSnap(room) {
  const w = room.world;
  const pl = [];
  for (const id of room.players.keys()) {
    const P = w.players.get(id);
    if (!P) continue;
    pl.push({
      id, x: r2(P.position.x), y: r2(P.position.y), z: r2(P.position.z), f: r3(P.facing),
      hp: Math.round(P.hp), mhp: P.maxHp, dw: P.downed ? 1 : 0, rp: r2(P.reviveProgress),
      wp: P.weapon, am: P.ammo[P.weapon], rl: P.reloading ? 1 : 0,
    });
  }
  const zs = w.zombies.map((z) => ({
    i: z.id, ty: z.type, x: r2(z.position.x), y: r2(z.position.y), z: r2(z.position.z),
    f: r3(z.facing), hp: Math.round(z.hp), mhp: z.maxHp, em: z.emerging ? 1 : 0,
  }));
  const bl = [
    ...w.bullets.map((b) => ({ i: b.id, k: b.kind === 'grenade' ? 'g' : 'b', x: r2(b.position.x), y: r2(b.position.y), z: r2(b.position.z) })),
    ...w.enemyBullets.map((b) => ({ i: b.id, k: 'e', x: r2(b.position.x), y: r2(b.position.y), z: r2(b.position.z) })),
  ];
  const ev = w.events.splice(0); // drena los eventos acumulados desde el último snap
  return { t: 'snap', pl, zs, bl, ev, sc: w.score };
}

wss.on('connection', (ws) => {
  const id = String(nextId++);
  let room = null;

  const leaveRoom = () => {
    if (!room) return;
    room.players.delete(id);
    if (room.world) { room.world.players.delete(id); room.world.inputs.delete(id); }
    if (room.players.size === 0) {
      stopRoomGame(room);
      rooms.delete(room.code); // sala vacía → se elimina
    } else {
      if (room.hostId === id) room.hostId = room.players.keys().next().value; // pasa el host
      broadcast(room, { t: 'room', ...roomInfo(room) });
    }
    room = null;
  };

  ws.on('message', (buf) => {
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }

    if (m.t === 'create') {
      leaveRoom();
      const code = makeCode();
      room = { code, players: new Map(), hostId: id, started: false, world: null, timer: null };
      room.players.set(id, { ws, name: m.name || `Jugador ${id}`, loadout: m.loadout || null });
      rooms.set(code, room);
      ws.send(JSON.stringify({ t: 'room', id, ...roomInfo(room) }));
    } else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) { ws.send(JSON.stringify({ t: 'error', msg: 'Sala no encontrada' })); return; }
      if (r.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'error', msg: 'Sala llena (máx 4)' })); return; }
      if (r.started) { ws.send(JSON.stringify({ t: 'error', msg: 'La partida ya empezó' })); return; }
      leaveRoom();
      room = r;
      room.players.set(id, { ws, name: m.name || `Jugador ${id}`, loadout: m.loadout || null });
      ws.send(JSON.stringify({ t: 'room', id, ...roomInfo(room) }));
      broadcast(room, { t: 'room', ...roomInfo(room) }, id);
    } else if (m.t === 'start' && room && room.hostId === id && !room.started) {
      room.started = true;
      startRoomGame(room, m.diff); // el servidor corre la partida (autoritario)
      broadcast(room, { t: 'start', diff: m.diff }); // incluye al host
      const self = room.players.get(id);
      if (self && self.ws.readyState === 1) self.ws.send(JSON.stringify({ t: 'start', diff: m.diff }));
    } else if (m.t === 'input' && room && room.world) {
      // Input del co-op: posición reportada + intención de disparo/apuntado.
      room.world.setInput(id, {
        pos: { x: +m.px || 0, y: +m.py || 0, z: +m.pz || 0 },
        facing: +m.f || 0,
        aiming: !!m.aiming,
        fire: !!m.fire,
        reload: !!m.reload,
        weapon: typeof m.weapon === 'string' ? m.weapon : undefined,
        aimPoint: { x: +m.ax || 0, y: +m.ay || 0, z: +m.az || 0 },
      });
    } else if (m.t === 'state' && room && !room.world) {
      // Presencia en el lobby (pre-partida): relé simple.
      broadcast(room, { t: 'pstate', id, x: m.x, y: m.y, z: m.z, f: m.f, a: m.a }, id);
    } else if (m.t === 'leave') {
      leaveRoom();
    }
  });

  ws.on('close', () => {
    if (room) broadcast(room, { t: 'left', id }, id);
    leaveRoom();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zombies 3D (web + salas) en el puerto ${PORT}`);
});
