/**
 * Cliente de red para las salas del modo jefe (co-op). Habla con el WebSocket de
 * server.js: crear/unirse a sala por código, arranque del anfitrión y relé del
 * estado de cada jugador (posición/orientación) al resto.
 *
 * En dev (Vite, puerto 5173) se conecta a ws://localhost:4173 — hay que tener
 * `node server.js` corriendo aparte. En producción (Railway) usa el mismo origen.
 */
export default class Net {
  constructor() {
    this.ws = null;
    this.id = null;        // id propio asignado por el servidor
    this.room = null;      // { code, hostId, players: [{id,name}] }
    this.connected = false;

    // Callbacks (los fija Game/Hud).
    this.onRoom = null;    // (room) -> lobby actualizado
    this.onStart = null;   // (diff) -> el anfitrión arrancó
    this.onState = null;   // (msg {id,x,y,z,f,a}) -> presencia pre-partida
    this.onSnap = null;    // (snap) -> snapshot autoritario del servidor (co-op)
    this.onLeft = null;    // (id) -> un jugador se fue
    this.onError = null;   // (msg) -> error del servidor (sala llena, etc.)
  }

  get isHost() { return !!(this.room && this.id === this.room.hostId); }
  get inRoom() { return !!this.room; }

  /** URL del WebSocket: mismo origen en producción; localhost:4173 en Vite dev. */
  wsUrl() {
    const { protocol, host, port } = window.location;
    if (port === '5173') return 'ws://localhost:4173';
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}`;
  }

  /** Conecta (una vez). Devuelve una promesa que resuelve al abrir. */
  connect() {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl());
      this.ws = ws;
      ws.onopen = () => { this.connected = true; resolve(); };
      ws.onerror = () => reject(new Error('No se pudo conectar al servidor de salas'));
      ws.onclose = () => { this.connected = false; this.room = null; };
      ws.onmessage = (ev) => this._onMessage(ev);
    });
  }

  _onMessage(ev) {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'room') {
      if (m.id) this.id = m.id; // primera respuesta propia incluye nuestro id
      this.room = { code: m.code, hostId: m.hostId, players: m.players };
      if (this.onRoom) this.onRoom(this.room);
    } else if (m.t === 'start') {
      if (this.onStart) this.onStart(m.diff);
    } else if (m.t === 'pstate') {
      if (this.onState) this.onState(m);
    } else if (m.t === 'snap') {
      if (this.onSnap) this.onSnap(m);
    } else if (m.t === 'left') {
      if (this.onLeft) this.onLeft(m.id);
    } else if (m.t === 'error') {
      if (this.onError) this.onError(m.msg);
    }
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  createRoom(name, loadout = null) { this._send({ t: 'create', name, loadout }); }
  joinRoom(code, name, loadout = null) { this._send({ t: 'join', code, name, loadout }); }
  start(diff) { this._send({ t: 'start', diff }); }

  /** Estado propio pre-partida (presencia en lobby; throttle del llamador). */
  sendState(x, y, z, facing, aiming) {
    this._send({ t: 'state', x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), f: +facing.toFixed(3), a: aiming ? 1 : 0 });
  }

  /** Input del co-op: posición reportada + intención de disparo/apuntado. */
  sendInput(o) { this._send({ t: 'input', ...o }); }

  leave() {
    this._send({ t: 'leave' });
    this.room = null;
  }
}
