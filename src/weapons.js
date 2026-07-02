/**
 * Definiciones de armas 100 % por parámetros. Para crear un arma nueva basta con
 * añadir una entrada aquí — no hace falta tocar la lógica de disparo.
 *
 * Motor de disparo (ver src/systems/combat.js y Player.fire):
 *   - kind 'hitscan'  → pistola / rifle / escopeta: uno o más raycasts instantáneos.
 *   - kind 'grenade'  → proyectil físico que explota en área.
 *
 * Parámetros comunes (todos tuneables sin tocar código):
 *   damage        Daño por impacto (por perdigón en escopeta).
 *   fireRate      Cadencia máxima: segundos mínimos entre disparos.
 *   range         Alcance máximo del raycast / proyectil.
 *   spreadMin     Dispersión mínima en radianes (1ª bala, precisión máxima).
 *   spreadMax     Dispersión máxima en radianes (tope al disparar seguido).
 *   bloomPerShot  Cuánto sube la dispersión por disparo (0..1 hacia spreadMax).
 *   bloomRecover  Velocidad de recuperación de la precisión (unidades/seg).
 *   recoilPitch   Retroceso vertical de cámara por disparo.
 *   recoilYaw     Variación horizontal de cámara por disparo (aleatoria ±).
 *   magSize       Tamaño del cargador.
 *   reloadTime    Tiempo de recarga (seg).
 *   penetration   Enemigos EXTRA que atraviesa la bala (0 = se detiene en el 1º).
 *   pellets       Nº de raycasts por disparo (1 = bala única; escopeta = varios).
 */
export const WEAPONS = {
  // Pistola: arma de precisión. 1ª bala casi perfecta, dispersión ínfima que se
  // recupera casi al instante; retroceso con pegada pero que no afecta la puntería.
  pistol: {
    name: 'Pistola', kind: 'hitscan', color: 0xfff176,
    damage: 20, fireRate: 0.45, range: 60,
    spreadMin: 0.0008, spreadMax: 0.02,   // extremadamente baja incluso disparando rápido
    bloomPerShot: 0.18, bloomRecover: 5.0, // recupera precisión en ~0.2 s
    recoilPitch: 0.02, recoilYaw: 0.004,   // pegada vertical, mínima desviación horizontal
    magSize: 12, reloadTime: 1.2,
    penetration: 0, pellets: 1,
  },
  // Escopeta: ráfaga de perdigones en cono amplio y fijo. Letal de cerca.
  // 15 de daño × 6 perdigones = 90 máx. si aciertan todos.
  shotgun: {
    name: 'Escopeta', kind: 'hitscan', color: 0xffab40,
    damage: 15, fireRate: 1.1, range: 22,
    spreadMin: 0.16, spreadMax: 0.16,      // cono ancho constante (el bloom no influye)
    bloomPerShot: 0, bloomRecover: 1,
    recoilPitch: 0.05, recoilYaw: 0.02,    // culatazo fuerte
    magSize: 6, reloadTime: 1.7,
    penetration: 0, pellets: 6,
  },
  // Rifle de asalto: automático, preciso y militar.
  rifle: {
    name: 'Rifle', kind: 'hitscan', color: 0xff8a65,
    damage: 15, fireRate: 0.1, range: 60,
    spreadMin: 0.0015, spreadMax: 0.035,
    bloomPerShot: 0.4, bloomRecover: 3.3,
    recoilPitch: 0.015, recoilYaw: 0.005,
    magSize: 24, reloadTime: 2.0,
    penetration: 0, pellets: 1,
  },
  // Lanzagranadas: proyectil físico que explota en área. `gravity` = caída de
  // bala (arco balístico): la granada baja con la distancia y explota al posarse.
  grenade: {
    name: 'Lanzagranadas', kind: 'grenade', color: 0x9ccc65,
    damage: 80, fireRate: 1.0, range: 0, speed: 17, explodeRadius: 4, gravity: 12,
    spreadMin: 0, spreadMax: 0,
    bloomPerShot: 0, bloomRecover: 1,
    recoilPitch: 0.06, recoilYaw: 0.01,
    magSize: 2, reloadTime: 1.8,
    penetration: 0, pellets: 1,
  },
};

// Orden de desbloqueo / teclas 1-4.
export const WEAPON_ORDER = ['pistol', 'shotgun', 'rifle', 'grenade'];
