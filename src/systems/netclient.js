// Cliente de salas co-op (modo jefe, Fase 1): crear/unirse a sala, lobby, arranque
// sincronizado por el anfitrión y presencia (ver a los compañeros moverse).
// Mixin de Game (`this` = instancia de Game). La lógica de red vive en Net.js.
//
// Fase 1 = presencia: cada cliente simula sus PROPIOS enemigos; los compañeros se
// ven pero los enemigos no se comparten aún (autoridad del servidor = Fase 2).
import Net from '../Net.js';
import RemotePlayer from '../entities/RemotePlayer.js';

const NET_SEND_INTERVAL = 0.08; // ~12 estados/seg

export default {
  /** Crea la sala (anfitrión) y entra al lobby. Envía el loadout persistido
   *  para que el servidor aplique las mismas armas/mejoras a su PlayerSim. */
  async createRoom() {
    try {
      await this.ensureNet();
      this.net.createRoom(this.playerName(), this.loadProgress());
    } catch (e) {
      this.hud.setRoomError(e.message);
    }
  },

  /** Se une a una sala existente por código y entra al lobby. */
  async joinRoom(code) {
    try {
      await this.ensureNet();
      this.net.joinRoom(code, this.playerName(), this.loadProgress());
    } catch (e) {
      this.hud.setRoomError(e.message);
    }
  },

  playerName() {
    return `Jugador ${Math.floor(Math.random() * 90) + 10}`;
  },

  /** Conecta y cablea los callbacks de red (una sola vez). */
  async ensureNet() {
    if (!this.net) this.net = new Net();
    await this.net.connect();

    this.net.onError = (msg) => this.hud.setRoomError(msg);
    this.net.onRoom = (room) => {
      // Lobby (nuevo o actualizado). NUNCA durante una partida activa: si alguien
      // sale a mitad de juego, el server difunde 'room' y no hay que abrir el lobby.
      if (this.coopActive || this.state === 'playing' || this.state === 'over') return;
      this.hud.hideBossMenu();
      this.hud.showLobby(room, this.net.id, (diff) => this.net.start(diff), () => this.leaveRoom());
    };
    this.net.onStart = (diff) => {
      this.hud.hideLobby();
      this.startCoopGame(diff); // partida autoritaria del servidor (Fase 2b)
    };
    this.net.onState = (m) => {
      const rp = this.remotePlayers.get(m.id);
      if (rp) rp.setState(m);
    };
    this.net.onSnap = (snap) => { this._snap = snap; }; // se aplica en coopStep
    this.net.onLeft = (id) => {
      const rp = this.remotePlayers.get(id);
      if (rp) { rp.destroy(); this.remotePlayers.delete(id); }
    };
  },

  /** Sale de la sala y limpia compañeros (vuelve al menú del modo jefe). */
  leaveRoom() {
    if (this.net) this.net.leave();
    this.clearRemotePlayers();
    this.hud.hideLobby();
    this.openBossMenu();
  },

  /** Instancia a los compañeros de sala al arrancar la partida co-op. */
  setupNetPlayers() {
    this.clearRemotePlayers();
    if (!this.net || !this.net.inRoom) return;
    for (const p of this.net.room.players) {
      if (p.id === this.net.id) continue;
      this.remotePlayers.set(p.id, new RemotePlayer(this, p.id, p.name));
    }
  },

  clearRemotePlayers() {
    for (const rp of this.remotePlayers.values()) rp.destroy();
    this.remotePlayers.clear();
  },

  /** Desconexión total al volver al menú principal. */
  netCleanup() {
    if (this.coopActive) this.coopCleanup(); // títeres y estado del co-op
    this.clearRemotePlayers();
    this.hud.hideLobby();
    if (this.net && this.net.inRoom) this.net.leave();
  },

  /** Tick de red durante la partida: envía el estado propio con throttle. */
  netTick(delta) {
    if (!this.net || !this.net.inRoom) return;
    this._netSendTimer = (this._netSendTimer || 0) - delta;
    if (this._netSendTimer <= 0) {
      const p = this.player;
      this.net.sendState(p.position.x, p.position.y, p.position.z, p.sim.facing, p.sim.aiming);
      this._netSendTimer = NET_SEND_INTERVAL;
    }
  },
};
