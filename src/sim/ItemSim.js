// Simulación PURA de un recogible: sin Three.js. Estado en {x,y,z}. La animación
// (rotación/flotado) es visual y vive en la vista; aquí solo va la lógica que
// afecta al juego: el imán de las monedas y el efecto al recogerlo.
//
// Interfaz `world` (en el cliente la cumple `Game`): `player` (con `.position`,
// `.hp`, `.maxHp`, `.owned`, `.weapon`) y `coins` (número, se suma al recoger).
import { WEAPONS } from '../weapons.js';

export default class ItemSim {
  constructor(world, type, x, z, payload = null) {
    this.world = world;
    this.type = type;
    this.payload = payload;
    this.alive = true;

    if (type === 'coin') { this.value = payload; this.radius = 0.85; this.baseY = 0.45; }
    else { this.radius = 0.9; this.baseY = 0.6; }

    // baseY = altura de reposo; el flotado visual se suma en la vista.
    this.position = { x, y: this.baseY, z };
  }

  update(delta) {
    if (this.type !== 'coin') return;
    // Imán: si el jugador está cerca y al mismo nivel, la moneda va hacia él.
    const pp = this.world.player.position;
    const p = this.position;
    if (Math.abs(p.y - pp.y) < 2) {
      const dx = pp.x - p.x;
      const dz = pp.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.6 * 2.6 && d2 > 0.02) {
        const pull = Math.min(1, delta * 6);
        p.x += dx * pull;
        p.z += dz * pull;
      }
    }
  }

  /** Aplica el efecto al jugador/juego y devuelve el texto a anunciar (o ''). */
  apply(player) {
    if (this.type === 'coin') { this.world.coins += this.value; return ''; }
    if (this.type === 'health') {
      player.hp = Math.min(player.maxHp, player.hp + 35);
      return '+35 VIDA';
    }
    const key = this.payload;
    player.owned.add(key);
    player.weapon = key;
    return `¡${WEAPONS[key].name.toUpperCase()}!`;
  }
}
