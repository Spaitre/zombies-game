// Suite del mundo headless (tanda 2a): simulación completa en Node, sin navegador.
import HeadlessWorld from './src/sim/HeadlessWorld.js';
import ZombieSim from './src/sim/ZombieSim.js';
import { WORLD } from './src/systems/shared.js';

const R = {};
const step = (w, secs, dt, tRef) => {
  for (let i = 0; i < Math.round(secs / dt); i += 1) { tRef.t += dt; w.step(dt, tRef.t); }
};

// 1) Mundo: mapa idéntico al cliente + nav construida.
{
  const w = new HeadlessWorld();
  R.mundo = { cajas: w.walls.boxes.length, plataformas: w.platforms.length, navCeldas: w.nav.N };
}

// 2) Flow multi-fuente: cada zombie persigue al jugador MÁS CERCANO.
{
  const w = new HeadlessWorld();
  const t = { t: 0 };
  const A = w.addPlayer('A'); A.position.x = 0; A.position.z = 0;
  const B = w.addPlayer('B'); B.position.x = 20; B.position.z = 0;
  const z1 = new ZombieSim(w, 'walker', 4, 0, 1); z1.emerging = false;
  const z2 = new ZombieSim(w, 'walker', 16, 0, 1); z2.emerging = false;
  w.zombies.push(z1, z2);
  step(w, 1, 1 / 30, t);
  R.persecucion = {
    z1HaciaA: z1.position.x < 3.5,       // baja hacia x=0
    z2HaciaB: z2.position.x > 16.5,      // sube hacia x=20
  };
}

// 3) Pared bloquea (muro sur de la casa en (9,-26)).
{
  const w = new HeadlessWorld();
  R.paredBloquea = w.walls.blocksPoint({ x: 9, z: -29 }, 0.1, 0, 1.8);
}

// 4) Disparo por input: daña al zombie; la pared detiene la bala.
{
  const w = new HeadlessWorld();
  const t = { t: 100 };
  const A = w.addPlayer('A'); A.position.x = 0; A.position.z = 0; A.lastFired = -999;
  const z = new ZombieSim(w, 'walker', 0, 5, 1); z.emerging = false; z.y = 0; z.position.y = 0; z.hp = 9999;
  w.zombies.push(z);
  w.setInput('A', { aiming: true, fire: true, aimPoint: { x: 0, y: 1, z: 5 } });
  w.step(1 / 30, t.t);
  const dano = 9999 - z.hp;
  const ammo = A.ammo.pistol;
  const evs = w.events.map((e) => e.e);
  // Pared en medio: jugador fuera de la casa, zombie dentro.
  const w2 = new HeadlessWorld();
  const A2 = w2.addPlayer('A'); A2.position.x = 9; A2.position.z = -32; A2.lastFired = -999;
  const z2 = new ZombieSim(w2, 'walker', 9, -27, 1); z2.emerging = false; z2.y = 0; z2.position.y = 0; z2.hp = 9999;
  w2.zombies.push(z2);
  w2.setInput('A', { aiming: true, fire: true, aimPoint: { x: 9, y: 1, z: -27 } });
  w2.step(1 / 30, 100);
  R.disparo = {
    dano, municionTras: ammo, eventos: [...new Set(evs)],
    paredDetiene: z2.hp === 9999,
  };
}

// 5) Contacto → derribo (no muerte) y el zombie cambia de objetivo.
{
  const w = new HeadlessWorld();
  const t = { t: 0 };
  const A = w.addPlayer('A'); A.position.x = 0; A.position.z = 0; A.hp = 15;
  const B = w.addPlayer('B'); B.position.x = 10; B.position.z = 0;
  const z = new ZombieSim(w, 'walker', 0.3, 0, 1); z.emerging = false;
  w.zombies.push(z);
  step(w, 3, 0.1, t); // varios golpes (invuln 0.6 s entre ellos)
  const zx0 = z.position.x;
  step(w, 1, 0.1, t);
  R.derribo = {
    aDerribado: A.downed, aVivoNoMuerto: A.hp === 0 && A.downed,
    gameOverAun: w.gameOver,
    zombieVaHaciaB: z.position.x > zx0,
  };

  // 6) Reanimación: B se para encima de A 10 s → A se levanta con 50%.
  w.zombies.length = 0;
  B.position.x = A.position.x; B.position.z = A.position.z;
  step(w, 9.5, 0.1, t);
  const antes = { downed: A.downed, progreso: +A.reviveProgress.toFixed(1) };
  step(w, 0.6, 0.1, t);
  R.reanimacion = { antesDe10s: antes, despues: { downed: A.downed, hp: A.hp }, evento: w.events.some((e) => e.e === 'revived') };

  // 7) Todos derribados → game over.
  w.downPlayer(A); w.downPlayer(B);
  w.step(0.1, t.t + 1);
  R.todosCaidos = { gameOver: w.gameOver, evento: w.events.some((e) => e.e === 'gameover') };
}

// 8) Modo jefe: línea temporal (spawns cada 2 s, jefe a los 5 s con 2× vida).
{
  const w = new HeadlessWorld({ arenaSize: WORLD * 3 });
  const t = { t: 0 };
  const A = w.addPlayer('A');
  w.startBossLevel('easy');
  step(w, 6.05, 1 / 30, t);
  const boss = w.zombies.find((z) => z.isBoss);
  R.modoJefe = {
    arena: w.worldSize,
    normalesVivos: w.zombies.filter((z) => !z.isBoss).length,
    jefeVida: boss ? boss.maxHp : null, // esperado: 1200 · 3.45 · 2 = 8280
    porSpawnear: w.bossToSpawn,
  };
}

// 9) Granada headless: arco + explosión en el suelo daña en área.
{
  const w = new HeadlessWorld();
  const A = w.addPlayer('A');
  const z = new ZombieSim(w, 'walker', 0, 12, 1); z.emerging = false; z.hp = 9999;
  w.zombies.push(z);
  const wpn = A.effWeapon('grenade');
  w.spawnBullet({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 1 }, wpn, wpn.damage);
  const b = w.bullets[0];
  for (let i = 0; i < 80 && b.alive; i += 1) b.update(0.05);
  R.granada = { exploto: !b.alive, zombieDanado: z.hp < 9999, dano: 9999 - z.hp };
}

console.log(JSON.stringify(R, null, 2));
