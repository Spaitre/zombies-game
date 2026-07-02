// Constantes y utilidades compartidas por Game.js y sus mixins de sistema.
// (Extraídas de Game.js al dividirlo en módulos; el comportamiento no cambia.)

export const WORLD = 34;
export const VERT_HIT = 1.8; // diferencia de altura máxima para que un impacto cuente

// Cámara cinematográfica en 3ª persona (RE2): se mezcla explorar ↔ apuntar.
export const CAM = {
  exploreDist: 3.6, aimDist: 2.2,
  exploreHeight: 2.4, aimHeight: 2.25,
  exploreShoulder: 1.0, aimShoulder: 0.85,
  // Desplaza la mira a la derecha → el personaje queda en el tercio izquierdo.
  exploreLookRight: 1.7, aimLookRight: 1.0,
  exploreLookHeight: 1.65, aimLookHeight: 1.9,  // al apuntar, más alto = mira más recta
  exploreFov: 60, aimFov: 50,
  lookAheadMax: 2.4,
};
export const LOOK_SENS = 0.0024;     // giro con el delta del mouse capturado (px → rad)
export const PITCH_MIN = -0.6;       // mirar abajo
export const PITCH_MAX = 0.55;       // mirar arriba
export const MAX_RECOIL_PITCH = 0.1; // tope del retroceso vertical (rad ~6°)
export const MAX_RECOIL_YAW = 0.04;

// --- Progresión / modo niveles (campaña por días) ------------------------
// Cada nivel completado = 1 día. La dificultad sube ligeramente por día; el
// jugador la contrarresta mejorando armas y personaje (topes abajo).
export const MAX_GAME_LEVEL = 200;   // día 200 = final de la campaña
export const MAX_WEAPON_LEVEL = 50;  // tope de cada mejora de arma
export const MAX_PLAYER_LEVEL = 50;  // tope de cada mejora de personaje

// Curvas de escalado del enemigo según el día L (1..MAX_GAME_LEVEL). El reparto
// de dificultad va en vida + cantidad + velocidad + daño (no todo en vida).
export function enemyHpMult(L)     { const l = Math.min(L, MAX_GAME_LEVEL); return 1 + 0.05 * (l - 1); }
export function enemySpeedAdd(L)   { return Math.min(0.015 * Math.min(L, MAX_GAME_LEVEL), 3); }
export function enemyDamageMult(L) { return Math.min(1 + 0.015 * (Math.min(L, MAX_GAME_LEVEL) - 1), 3); }
export function enemyCount(L)      { return 5 + Math.round(Math.min(L, MAX_GAME_LEVEL) * 0.5); }

// Mejoras de arma (por arma y por separado). `apply(base, n)` transforma el valor
// base del arma según el nivel de mejora n (0..MAX_WEAPON_LEVEL). Nota: en armas
// `fireRate`/`reloadTime` menor = mejor, por eso decaen.
export const WEAPON_UPGRADES = {
  damage:   { name: 'Daño',     stat: 'damage',     apply: (base, n) => base * (1 + 0.08 * n) },
  fireRate: { name: 'Cadencia', stat: 'fireRate',   apply: (base, n) => base * (0.972 ** n) },
  magSize:  { name: 'Cargador', stat: 'magSize',    apply: (base, n) => base + Math.round(0.5 * n) },
  reload:   { name: 'Recarga',  stat: 'reloadTime', apply: (base, n) => base * (0.985 ** n) },
};

// Mejoras del personaje.
export const PLAYER_UPGRADES = {
  maxHp: { name: 'Vida máx.', apply: (base, n) => base + 15 * n },
  speed: { name: 'Velocidad', apply: (base, n) => base + 0.5 * n },
};

// Coste de subir una mejora del nivel n al n+1. Sube suave para que maximizar
// exija farmear varios días (equilibrado con el presupuesto de monedas/oleada).
export function upgradeCost(n) { return Math.round(12 * (1.09 ** n)); }

// --- Modo jefe (nivel único por dificultad) ------------------------------
// Cada dificultad usa los parámetros de enemigo de un nivel de campaña. Los
// jefes salen a los segundos indicados (`bossTimes`) con doble vida.
export const BOSS_MODES = {
  easy: { label: 'Fácil', level: 50, bossTimes: [5] },
  normal: { label: 'Normal', level: 100, bossTimes: [5, 10] },
  hard: { label: 'Difícil', level: 150, bossTimes: [5, 10, 15] },
  insane: { label: 'Insano', level: 200, bossTimes: [10, 10, 10, 10] }, // 4 a la vez a los 10 s
};
export const BOSS_MODE_TOTAL = 50;       // enemigos normales totales
export const BOSS_MODE_MAX_ALIVE = 12;   // máximo simultáneo en pantalla
export const BOSS_MODE_INTERVAL = 2;     // segundos entre apariciones
export const BOSS_MODE_HP_MULT = 2;      // los jefes tienen el doble de vida
export const BOSS_MODE_WORLD_MULT = 3;   // el mapa es el triple de grande
// Mezcla de enemigos normales (acumulativa): zombie 55%, esqueleto 30%, fantasma 15%.
export const BOSS_MODE_MIX = [['walker', 0.55], ['runner', 0.85], ['tank', 1.0]];

// --- Co-op: derribo y reanimación -----------------------------------------
// Al llegar a 0 de vida en co-op el jugador queda DERRIBADO (no muerto): un
// aliado debe pararse encima de él REVIVE_TIME segundos para reanimarlo. Si
// todos están derribados → game over.
export const REVIVE_TIME = 10;      // segundos parado encima para reanimar
export const REVIVE_RADIUS = 1.2;   // distancia horizontal máx. para contar
export const REVIVE_HP_FRACT = 0.5; // vida con la que se levanta (50% de la máx.)

// Denominaciones de moneda que sueltan los enemigos normales.
export const COIN_DENOMS = [10, 5, 1];
// Moneda especial (roja) que suelta el jefe. Valor fijo distinto de las normales.
export const BOSS_COIN_VALUE = 25;

export function rand(a, b) { return a + Math.random() * (b - a); }
export function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }
