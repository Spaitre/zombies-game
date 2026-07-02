# Zombies Survival 3D

Shooter de supervivencia en 3ª persona (top-down/over-the-shoulder) inspirado en
**Call of Mini: Zombies 2** y con apuntado/cámara estilo **Resident Evil 2 Remake**.
Hecho con **Three.js + Vite**, modelos low-poly de **Kenney**.

> **README de continuación**: resume arquitectura, sistemas y convenciones para
> retomar el proyecto en otra sesión sin releer todo el código.

---

## Cómo ejecutar

```bash
npm install
npm run dev        # Vite → http://localhost:5173
```

**Importante:** ábrelo en una **pestaña real del navegador**, NO en un panel
incrustado/iframe — el control de cámara usa **Pointer Lock (captura de cursor)**,
que los iframes suelen bloquear. Si no captura, sale el aviso "Haz clic para
capturar el cursor"; haz clic en el área de juego.

### Controles
- **WASD**: moverse (relativo a la cámara).
- **Mouse**: girar la cámara (solo con el cursor capturado, por *delta*).
- **Clic derecho (mantener)**: apuntar (Aim Mode, estilo RE2).
- **Clic izquierdo**: disparar (solo se dispara apuntando).
- **R**: recargar. **Espacio**: saltar. **1-4**: cambiar de arma. **Esc**: pausa.

---

## Arquitectura / archivos

Entrada: `index.html` → `src/main.js` → **`src/Game.js`** (clase principal; el
bucle, cámara, oleadas, tienda, colisiones, hitscan, etc. viven aquí).
`window.__game` es la instancia global (útil para depurar por consola/eval).

> Nota: existen `src/scenes/*` (BootScene/GameScene/GameOverScene) pero el juego
> activo corre por `Game.js`; trátalos como posible legado salvo que verifiques lo
> contrario.

> **Game.js dividido en sistemas (mixins).** Para que cada tarea sea más ligera,
> `Game.js` se partió: quedó como núcleo delgado y sus métodos se agruparon por
> tema en `src/systems/*`. Son **mixins**: cada archivo exporta un objeto de
> métodos que usan `this` = instancia de Game; al final de `Game.js` se hace
> `Object.assign(Game.prototype, ...)`. El comportamiento es idéntico. Para
> tunear un tema, edita **solo su archivo** (no hace falta leer todo `Game.js`).

| Archivo | Qué contiene |
|---|---|
| `src/Game.js` | **Núcleo delgado**: constructor (renderer/escena/cámara/inputs), `init`/`buildEnvironment`/`prepare`/`startGame`, `frame()` (loop), pointer lock, pausa, consultas de mundo (`clampToWorld`/`isInWorld`/`randomOpenPosition`), `onResize`/`gameOver`. Ensambla los mixins con `Object.assign`. |
| `src/systems/shared.js` | Constantes (`WORLD`, `VERT_HIT`, `CAM`, `LOOK_SENS`, `PITCH_*`, `MAX_RECOIL_*`, `COIN_DENOMS`), **progresión** (`MAX_GAME_LEVEL 200`, `MAX_WEAPON_LEVEL 50`, `MAX_PLAYER_LEVEL 50`, curvas `enemyHpMult`/`enemySpeedAdd`/`enemyDamageMult`/`enemyCount`, `WEAPON_UPGRADES`/`PLAYER_UPGRADES`, `upgradeCost`) y helpers (`rand`, `dist2`). |
| `src/systems/waves.js` | Oleadas: `startNextWave`, `spawnZombie`/`spawnBoss`, `pickType`, `updateWaves`, `updateBossBar`. |
| `src/systems/combat.js` | Disparo/colisiones: `spawnBullet`, `shotgunFire`, `hitscanFire`, `raycastPellet`, `spawnTracer`, `spawnEnemyBullet`, `explode`, `handleCollisions`. |
| `src/systems/effects.js` | Efectos visuales: `spawnMuzzleFlash`, `spawnBlood`, `spawnExplosion`, `updateEffects`. |
| `src/systems/economy.js` | Economía: `killZombie`, `dropCoins`, `spawnCoinValue`/`spawnCoin`, `maybeDropHealth`, `updateCorpses`. |
| `src/systems/shop.js` | Menú de mejoras (entre niveles y desde el menú): `openShop`/`openUpgradeMenu`, `menuData`, `buyWeaponUpgrade`/`buyPlayerUpgrade`/`buyHeal`, `nextWaveFromShop`, `closeUpgradeMenu`. Mejoras por arma (4 stats) + personaje, pagadas con monedas. |
| `src/systems/camera.js` | Cámara RE2: `crosshairTarget`, `updateAimUI`, `addRecoil`, `updateLook`, `updateCamYaw`, `computeDesiredCamera`, `computeLookTarget`, `snapCamera`, `updateCamera`. |
| `src/systems/platforms.js` | Verticalidad: `registerPlatform`/`registerRoof`, `updateRoofFade`, `platformTop`, `supportHeight`. |
| `src/systems/bossmode.js` | Modo jefe (nivel único por dificultad): `startBossMode`, `updateBossLevel`, spawns (mezcla 55/30/15, máx 12, cada 2 s), jefes por tiempo con 2× vida, `bossLevelVictory`. |
| `src/systems/netclient.js` | Cliente de salas co-op (mixin): `createRoom`/`joinRoom`/`leaveRoom`, lobby, `setupNetPlayers`, `netTick` (envía estado propio ~12/s), `netCleanup`. |
| `src/Net.js` | WebSocket del cliente: conexión (mismo origen en prod; `ws://localhost:4173` en dev), protocolo de salas (`create/join/start/state/leave`) y callbacks. |
| `src/entities/RemotePlayer.js` | Compañero de sala: modelo keeper tintado, interpola posición/orientación desde la red (solo visual). |
| `server.js` | Producción/Railway: sirve `dist/` + servidor de salas WebSocket (crear/unirse por código de 4 letras, máx 4, relé de estados, herencia de anfitrión al desconectar). |
| `src/entities/Player.js` | Jugador: movimiento, verticalidad/salto, `aim()` (RE2), `updateFacing` (root rotation), `applyAimPose` (aim offset procedural), animaciones, `fire()` (todas las armas), bloom/recoil del rifle, munición/recarga. |
| `src/entities/Zombie.js` | Enemigos: tipos (walker/runner/tank/boss), navegación (flow field), verticalidad, aparición "desenterrándose", muerte (clip `die` + cadáver 5 s), animación de correr. |
| `src/entities/Bullet.js` / `EnemyBullet.js` | Proyectiles físicos (pistola, granada, escupitajo del jefe). 3D. |
| `src/entities/Item.js` | Recogibles: `health`, `weapon`, `coin` (con imán hacia el jugador). |
| `src/weapons.js` | **Config de todas las armas** (un solo sitio para tunear). |
| `src/Map.js` | Mapa procedural: calles en cuadrícula, **casas de 2 plantas entrables** (escalera+loft), torres sólidas, vallas, parques. |
| `src/Walls.js` | Colisión AABB en XZ **con rango de altura `[y0,y1]`** (consciente de pisos). |
| `src/NavGrid.js` | Navegación **flow-field de 2 niveles** (planta baja + loft) unidos por las escaleras. |
| `src/Models.js` | Carga/cachea GLBs y **conserva sus animaciones**. |
| `src/Input.js` | Teclado/ratón, **pointer lock por delta**, botón de apuntar (RMB). |
| `src/Hud.js` | UI en DOM (vida, munición, oleada, tienda, pausa, anuncios). |
| `src/Touch.js`, `src/Audio.js` | Controles táctiles y sonido. |

---

## Sistemas clave (qué tocar para cambiar X)

### Separación lógica ↔ render (base para el multijugador futuro)
- **Objetivo:** que la *simulación* (lógica de juego) pueda correr en un servidor
  autoritario (Node) sin Three.js, para el multijugador planeado (versus 8j,
  co-op campaña/jefes 4j). El cliente solo renderiza el estado.
- **Hecho (paso 1):** el bucle está partido en `Game.step(delta, time)`
  (**simulación**: jugador, oleadas, nav, entidades, colisiones) y
  `Game.present(delta)` (**render**: cámara, efectos, HUD, dibujo). `frame()` los
  orquesta en el cliente. Comportamiento idéntico; `step()` es el punto de entrada
  que ejecutaría el servidor.
- **Hecho (paso 2, patrón estado+vista):** `Bullet` es el proof-of-concept. La
  lógica vive en **`src/sim/BulletSim.js`** (sin Three.js: estado en vectores
  planos `{x,y,z}`, depende de una interfaz `world` que en el cliente cumple
  `Game`). `entities/Bullet.js` es solo la **vista**: crea el mesh y lo sincroniza
  desde `sim.position` cada frame (`syncView`), reexponiendo `position/radius/
  damage/kind/alive` para que colisiones y filtros no cambien.
- **Hecho (paso 3):** mismo patrón en `EnemyBullet` (→ `src/sim/EnemyBulletSim.js`)
  e `Item` (→ `src/sim/ItemSim.js`, con imán de moneda y `apply()` en la sim; la
  rotación/flotado quedan como visual en la vista). El setter `baseY` de la vista
  reenvía al estado (lo usa `economy.spawnCoin`).
- **Hecho (paso 4):** `Zombie` → `src/sim/ZombieSim.js` (IA/flow-field, separación,
  verticalidad, ataque a distancia, `hurt/die/updateCorpse`; `ZOMBIE_TYPES` se movió
  aquí como datos puros). La vista `entities/Zombie.js` guarda modelo/mixer/mats y
  sincroniza posición+`facing`; animaciones, bob, forcejeo al emerger, flash de daño
  y clip de muerte son visuales. La sim recibe los vecinos por la interfaz `world` y
  se salta a sí misma por identidad de `position`. (Ajustes: `spawnEnemyBullet` y la
  explosión del jefe ya no usan `.clone()`, aceptan vectores planos.)
- **Hecho (paso 5):** `Player` → `src/sim/PlayerSim.js` (movimiento, verticalidad/
  salto, munición/recarga, daño, mejoras, `effWeapon`). La vista `entities/Player.js`
  recoge la entrada local (cámara/teclado/ratón), la pasa "digerida" a la sim
  (`move(delta, moveDir, aiming, jump)`) y sincroniza modelo/arma/animaciones.
  **Todas las entidades del gameplay tienen ya su estado en `src/sim/*`.**
- **Hecho (paso 6, disparo por intención):** `fire` vive ahora en `PlayerSim.fire(w)`.
  El cliente solo aporta la **intención** (`sim.aimPoint`, el punto bajo la mira, y
  `sim.aimDir`); la sim calcula el cañón desde el estado (posición + `facing`, sin el
  mesh del arma) y la dirección hacia `aimPoint`, y hace el spawn/hitscan + retroceso
  de cámara + bloom. La vista `aim()` fija la intención (raycast de cámara → `aimPoint`)
  y `fire()` solo añade efectos de cliente (fogonazo, audio, retroceso visual del arma,
  animación). Con esto el disparo ya no depende del render.
- **Hecho (paso 7, FX por `game.fx`):** los efectos de CLIENTE (sangre, tracer,
  fogonazo, explosión visual, retroceso de cámara y sonidos) se disparan por el
  sumidero **`game.fx`** (`blood/tracer/explosion/muzzleFlash/recoil/sound`) en vez
  de llamar al render/audio directamente. Con esto **ningún módulo de `src/sim/*`
  llama a efectos/audio**: la sim usa solo `world.fx` (efectos) + consultas de mundo
  headless (walls/nav/supportHeight/clampToWorld) + spawns de gameplay. Un servidor
  usaría un `fx` no-op (o difusor de eventos por la red). `explode`/`hitscanFire`/
  `killZombie`/`waves`/`onPlayerHurt`/`gameOver` ya enrutan sus FX por `fx`.
- **Hecho (Fase 2a, mundo headless):** la simulación completa corre en Node sin
  navegador (suite: `npm run test:sim`).
  - **`src/sim/mapLayout.js`**: cajas de colisión + plataformas del mapa con
    matemática pura. ⚠️ Duplicación controlada con `Map.js` (las torres usan huella
    medida del modelo); verificado **idéntico caja a caja** (174 cajas, 20
    plataformas) contra el mundo vivo del cliente. Si cambias el layout en uno,
    cambia el otro.
  - **`src/sim/HeadlessWorld.js`**: el "Game sin render" — mapa + `Walls`/`NavGrid`,
    jugadores por **inputs** (`setInput`: moveDir/aiming/jump/fire/aimPoint),
    hitscan **matemático** (rayo vs AABB por slabs + zombies como cilindros; sin
    `THREE.Raycaster`), granadas/escupitajos, colisiones, línea temporal del modo
    jefe, y `fx` → **cola de eventos** (`this.events`) para difundir por red.
  - **`NavGrid.computeFlowFieldMulti(targets)`**: BFS multi-fuente — cada zombie
    persigue al jugador vivo más cercano al mismo coste; `computeFlowField` delega
    (campaña 1J intacta).
  - **Derribo/reanimación co-op** (`PlayerSim` + `HeadlessWorld`): a 0 de vida el
    jugador queda DERRIBADO (tirado, sin moverse/disparar, los zombies lo ignoran);
    un aliado parado encima `REVIVE_TIME` (10 s) lo levanta con `REVIVE_HP_FRACT`
    (50 %); si todos caen → game over. Constantes en `shared.js`.
- **Hecho (Fase 2b, co-op autoritario):** el servidor corre un `HeadlessWorld` por
  sala (30 Hz sim, snapshot a 15 Hz) y el cliente es una "pantalla".
  - **Protocolo:** cliente → `input` (posición reportada client-trusted + facing +
    aiming/fire/reload/weapon + `aimPoint`); servidor → `snap` (jugadores con
    hp/derribo/munición, zombies, proyectiles, eventos drenados, score). El loadout
    viaja en `create`/`join` y el servidor lo aplica (`applyLoadout`).
  - **Cliente (`systems/netgame.js`):** `startCoopGame` (lo dispara `net.onStart`),
    `coopStep` reemplaza a `step()` — mueve al jugador local, envía inputs ~15/s y
    aplica snapshots: vida/munición/derribo propios autoritarios, compañeros
    (`RemotePlayer.setDowned`), **zombies títere** (`Zombie.setNetTarget`/
    `updatePuppet`, interpolados; muerte local al desaparecer del snap), proyectiles
    títere y eventos → FX locales. Sin oleadas/colisiones/daño locales.
  - **Derribo/reanimación EN RED verificados:** el servidor derriba (HUD Vida: 0,
    modelo tumbado), "REANIMANDO… %" en pantalla, aliado encima 10 s → en pie con
    50 %; si el aliado muere en el intento → todos caídos → GAME OVER. Verificado
    con bots reales (médico frágil murió reanimando = game over correcto; médico
    tanque completó la reanimación).
  - **Gotchas arreglados:** la pausa en co-op NO congela (el servidor sigue; solo
    libera el cursor); el lobby no se reabre por actualizaciones de sala en plena
    partida; al terminar (victoria/derrota) el cliente sale de la sala.
- **Pendiente (Fase 2c, pulido):** probar con latencia real tras desplegar en
  Railway (interpolación/feel), disparo local cosmético instantáneo (hoy el
  fogonazo/tracer llegan con el snap, ~70-140 ms), economía co-op (monedas/items
  no existen en el servidor), y re-lobby tras partida sin recrear sala.
- **Gotcha (patrón estado+vista):** al mover estado a la sim, **reexpón en la vista
  TODOS los campos que el resto del código lee** (getters que reenvían a `this.sim`).
  Si falta uno, se lee `undefined` → p. ej. faltó `Zombie.damage` y el jugador recibía
  `100 - undefined = NaN` (visible como "Vida: NaN"). Verifica combate + HUD tras cada paso.
- **Despliegue (Railway):** hoy el juego es estático (`npm run build` → `dist/`,
  servible en Railway). El servidor de simulación del multijugador correría también
  en Railway como proceso Node.

### Cámara cinematográfica (Game.js)
- Solo **delta del mouse** (pointer lock). `updateLook()` — NO usa la posición del
  cursor. `camYaw -= dX`, `camPitch -= dY` (clamp `PITCH_MIN/MAX`).
- Mezcla **explorar ↔ apuntar** con `player.aimBlend`. Parámetros en la const `CAM`
  (distancia, altura, hombro, `lookRight` para dejar al personaje en el tercio
  izquierdo, FOV, look-ahead). Métodos: `computeDesiredCamera`, `computeLookTarget`
  (incluye pitch + retroceso), `updateCamera` (lag/inercia, colisión, FOV).
- **Retroceso de cámara**: `recoilPitch`/`recoilYaw` (sumados en `addRecoil`,
  decaen en `updateCamera`). Sensibilidad: `LOOK_SENS`. Topes: `MAX_RECOIL_*`.

### Apuntado (RE2) — Player.js
- `aiming` = RMB mantenido. `aimBlend` suaviza el modo.
- `aim()` → `game.crosshairTarget(this.aimPoint)`: **raycast desde el centro de la
  cámara contra la escena** (zombies + paredes + suelo); si no golpea nada, punto
  lejano a **5000**. Ahí va la bala (independiente de la orientación del personaje/arma).
- `updateFacing`: el cuerpo mira al **movimiento** explorando y al **objetivo** apuntando (giro suave).
- `applyAimPose`: torso/cabeza/brazos giran hacia el objetivo (aproximación procedural).
- Disparo **restringido a apuntar**. Retícula visible solo apuntando.

### Armas — motor 100 % por parámetros (weapons.js + systems/combat.js + Player.fire)
- **Todo el comportamiento vive en `src/weapons.js`.** Para crear un arma nueva
  se añade una entrada con estos parámetros (sin tocar la lógica): `damage`,
  `fireRate` (cadencia máx = seg entre disparos), `range` (alcance), `spreadMin`
  /`spreadMax` (dispersión), `bloomPerShot`/`bloomRecover` (subida/recuperación de
  precisión), `recoilPitch`/`recoilYaw` (retroceso de cámara), `magSize`,
  `reloadTime`, `penetration` (enemigos extra que atraviesa), `pellets` (nº de
  raycasts). El header de `weapons.js` documenta cada campo.
- **Dos tipos de disparo (`kind`):**
  - `hitscan` → **pistola, rifle y escopeta comparten un único motor**:
    `Game.hitscanFire(origin, baseDir, w, mult, spread)`. Lanza `w.pellets`
    raycasts, cada uno desviado según la dispersión (resuelta por el bloom en
    Player), y cada bala atraviesa hasta `w.penetration` enemigos vía
    `Game.raycastPierce`. El daño sobre un mismo enemigo **se acumula** y se
    aplica una vez. Diferencias solo por parámetros: pistola = 1 perdigón y
    dispersión ínfima; escopeta = 6 perdigones en cono ancho fijo
    (`spreadMin==spreadMax`); rifle = 1 perdigón, auto, algo de bloom.
  - `grenade` → proyectil físico que explota en área (`Bullet` + `Game.explode`).
    Con **caída de bala**: el parámetro `gravity` del arma da arco balístico; la
    granada baja con la distancia y explota al posarse en el suelo/plataforma
    (`Bullet.update` usa `supportHeight`).
- **Precisión (bloom):** `spread = lerp(spreadMin, spreadMax, player.bloom)`. Cada
  disparo sube `bloom` (`bloomPerShot`); al no disparar se recupera con
  `bloomRecover` (en `Player.move`). 1ª bala casi perfecta; disparar seguido
  dispersa poco; espera breve → precisión restaurada.
- **Retroceso:** cámara vía `Game.addRecoil(recoilPitch, ±recoilYaw)` (decae en
  `updateCamera`); arma vía `player.gunRecoil` (atrás+arriba) y `player.gunKickYaw`
  (mínima variación horizontal), ambos recuperan en `updateGun`.
- **Compartido:** `Game.raycastPierce` (raycaster `pelletRay`, dedupe por zombie),
  `Game.spawnTracer` (traza). Los zombies se identifican por `mesh.userData.zombie`.
- **Cargador/recarga:** `player.ammo`, `tryFire`, `startReload/updateReload` (R),
  recarga automática al vaciar.

### Verticalidad / segundo piso (4 fases hechas)
- Jugador y zombies tienen `y`, `vy`, gravedad y **apoyo en plataformas**
  (`Game.platforms`, `supportHeight`, tolerancia de escalón). Salto: `JUMP_V`.
- Colisión por altura: `Walls` con `[y0,y1]`; las paredes de planta baja no
  estorban arriba, las barandillas solo bloquean arriba.
- Navegación multinivel: `NavGrid` con 2 capas unidas en las celdas de escalera.
- Casas de 2 plantas en `Map.buildHouse`: muros planta baja con hueco de puerta,
  **escalera-rampa centrada bajo la puerta**, **loft transitable**, barandilla,
  muros del 2º piso. Combate por nivel con `VERT_HIT`.
- **Cámara despejada arriba**: `Game.registerRoof`/`updateRoofFade` funden el
  tejado + muros superiores **de la casa actual** (materiales propios por casa).

### Economía de monedas
- Al morir un enemigo: `killZombie` → `dropCoins` + `maybeDropHealth`.
- **Monedas físicas** (Item `coin`): valores **1 (cobre), 5 (plata), 10 (dorado),
  25 (rojo, solo jefe · `BOSS_COIN_VALUE`)**. Zombies sueltan 0-3 (1/5/10). Imán al acercarte.
- **Presupuesto por oleada** (`coinBudget`, en `startNextWave`): oleada 1 ≈ 20-30,
  escala cada oleada. El jefe suelta **solo** la moneda roja de 25 (`BOSS_COIN_VALUE`).
- **Salud**: 0-2 cubos por oleada (`healthBudget`); si la oleada previa soltó 0 (y
  no es la 1), la siguiente garantiza ≥1.
- **Fin de nivel/día**: al matar al último, texto **"DÍA N COMPLETADO" 5 s**
  (recoger monedas) y luego el **menú de mejoras** (`waveCleared`/`waveEndTimer`
  en `updateWaves` → `openShop`).

### Progresión — modo niveles / campaña por días (systems/shared.js + shop.js)
- **1 nivel = 1 oleada = 1 día.** `wave` es el contador de día. Bucle: jugar día →
  "DÍA N COMPLETADO" 5 s → menú (`state='shop'`) → **[Siguiente día]** o mejorar.
- **Escalado por día** (curvas en `shared.js`, tope en `MAX_GAME_LEVEL 200`):
  `enemyHpMult` (×1 → ×10.95), `enemyCount` (~6 → ~105), `enemySpeedAdd` (tope +3),
  `enemyDamageMult` (tope ×3). Aplicadas en el constructor de `Zombie` y en
  `startNextWave`. Reparto de dificultad en vida+cantidad+velocidad+daño.
- **Mejoras (con monedas, persisten en la partida).** Por arma y por separado:
  `damage`, `fireRate`, `magSize`, `reload` (tope `MAX_WEAPON_LEVEL 50`). Personaje:
  `maxHp`, `speed` (tope `MAX_PLAYER_LEVEL 50`). Efecto en `WEAPON_UPGRADES`/
  `PLAYER_UPGRADES`; coste `upgradeCost(nivel)` (sube ~9%/nivel). El jugador aplica
  las mejoras de arma en `Player.effWeapon(key)` (**único sitio** que combina base +
  mejoras) y la vida en `applyMaxHpUpgrade`.
- **Equilibrio:** el jugador topa mejoras (50) antes del día 200 → el "muro" del modo
  infinito lo marca el enjambre (cantidad + velocidad), no balas-esponja. Todo tuneable.
- **Menú principal:** `[JUGAR MODO NIVELES]` (`startGame`) y `[MEJORAR ARMAS]`
  (`openUpgradeMenu`, modo `'menu'` con botón Volver). El mismo `Hud.showShop`
  renderiza ambos contextos según `handlers.mode` (`'level'` vs `'menu'`).

### Modo jefe (systems/bossmode.js)
- **Nivel único** elegido en el menú principal → submenú de dificultad. Cada
  dificultad usa los parámetros de enemigo de un nivel de campaña: **Fácil 50,
  Normal 100, Difícil 150, Insano 200** (config en `BOSS_MODES`, `shared.js`).
- **Hordas:** 50 enemigos normales en total, **máx 12 a la vez**, uno cada **2 s**,
  mezcla **zombie 55% / esqueleto 30% / fantasma 15%** (`BOSS_MODE_MIX`).
- **Jefes** (2× vida del nivel): Fácil 1 (a los 5 s), Normal 2 (5 s, 10 s), Difícil
  3 (5/10/15 s), Insano 4 a la vez (10 s). Tiempos en `BOSS_MODES[x].bossTimes`.
- **Mapa ×3:** `Game.setWorldSize(WORLD*3)` reescala solo suelo + muro perimetral +
  límites (`worldSize`); el vecindario y la nav quedan fijos a `WORLD` (los enemigos
  fuera de la rejilla van directos al jugador). `buildBounds(size)` (re)construye.
- **Loadout:** usa las **mejoras de campaña** persistidas (ver abajo). **Victoria**
  al matar todo → "¡NIVEL COMPLETADO!" → menú. Morir → game over → menú.

### Salas co-op del modo jefe (Fase 1: lobby + presencia)
- **Flujo:** menú modo jefe → `CREAR SALA` (código de 4 letras) o `UNIRSE` con código →
  lobby con lista de jugadores (máx 4, 👑 = anfitrión) → el anfitrión elige dificultad
  y **todos arrancan a la vez**. Salir/morir/ganar → se abandona la sala.
- **Qué sincroniza la Fase 1:** solo **presencia** — cada cliente ve a sus compañeros
  (`RemotePlayer`) moverse en el arena (~12 estados/s, interpolados). **Los enemigos
  NO se comparten aún**: cada cliente simula sus propias hordas. La autoridad del
  servidor sobre enemigos/daño es la **Fase 2** (la separación sim/render ya la permite).
- **Dev local:** el multijugador necesita `node server.js` corriendo APARTE de
  `npm run dev` (el cliente en 5173 se conecta a `ws://localhost:4173`). En
  producción usa el mismo origen (wss automático en HTTPS).

### Despliegue (Railway)
- `npm run build` → `dist/` (verificado: index + assets + 410 .glb). `npm start` →
  `server.js` sirve `dist/` y el WebSocket de salas en `process.env.PORT`.
- En Railway: Deploy from GitHub repo; si `zombies-game` es subcarpeta, poner
  **Root Directory** = `zombies-game`. Railway corre install → build → start.

### Persistencia del loadout (localStorage)
- `Game.saveProgress/loadProgress/applyProgress` guardan **armas desbloqueadas +
  mejoras** (`weaponUpgrades`, `playerUpgrades`) en `localStorage['zombies-progress']`.
- Se guarda al comprar mejoras (`shop`) y al recoger un arma (`combat`); se carga en
  `prepare()` sobre el jugador nuevo (campaña **y** modo jefe). El día NO persiste.

### Animaciones
- Jugador: mixer con `idle/holding-right`, `sprint`, `holding-right-shoot`
  (`Player.updateAnimation`), más `applyAimPose` procedural encima.
- Zombies: `walk/sprint`; **aparición** desenterrándose (empiezan bajo tierra y
  suben); **muerte** con clip `die`, el cuerpo queda tirado y desaparece a los 5 s
  (`Game.corpses`/`updateCorpses`).

---

## Convenciones y gotchas (¡leer antes de tocar!)

1. **Motor casi-2D con altura por rangos.** La colisión/navegación son AABB en XZ
   con rango `[y0,y1]`, NO física 3D completa. El combate usa raycasts (hitscan) y
   un gate de altura `VERT_HIT` para los proyectiles.
2. **Modelos por nodos, sin esqueleto/IK.** Las animaciones Kenney mueven nodos
   (`torso`, `head`, `arm-right`, ...). El "aim offset", la "IK de manos" y las
   "animation layers" son **aproximaciones procedurales** (rotar nodos), no un
   solucionador real.
3. **Pointer Lock obligatorio para la cámara.** Si no se concede (iframe/panel),
   la cámara no gira y aparece el aviso de clic. Probar en pestaña real.
4. **Falsos errores de HMR:** al guardar a mitad de una edición, Vite recarga
   módulos inconsistentes y la consola puede llenarse de
   `computeBoundingSphere NaN`. Verifica el estado REAL forzando el recálculo:
   recorre la escena con `geometry.computeBoundingSphere()` y cuenta NaN (0 = limpio).
5. **El screenshot del preview se cuelga a veces.** Reiniciar el dev server lo
   arregla. Para capturas estables: `state='frozen'` o
   `renderer.setAnimationLoop(null)` y `renderer.render(...)` manual.
6. **Depuración por eval:** todo es accesible vía `window.__game` (player, zombies,
   cámara, etc.). Para probar disparos/daño coloca el objetivo justo bajo la mira
   (la retícula apunta recto al frente, no al suelo cercano).

---

## Estado actual (todo hecho y verificado)

- ✅ Mapa grande con casas entrables de 2 plantas, torres, vallas, parques.
- ✅ Segundo piso transitable (verticalidad, escaleras, nav multinivel, fade de cámara, salto).
- ✅ Cámara RE2 (explorar/apuntar, OTS, lag, look-ahead, colisión, pitch).
- ✅ Mouse capture por delta (sin lógica de posición de cursor).
- ✅ Disparo exacto a la retícula (raycast cámara→escena, 5000 si nada).
- ✅ Economía de monedas (drops por valor/color, presupuesto por oleada, "OLEADA TERMINADA" 7 s, tienda reajustada, salud 0-2 con garantía).
- ✅ Escopeta hitscan (6 perdigones, daño acumulable, devastadora de cerca).
- ✅ Rifle hitscan (bloom + retroceso, auto, preciso/militar).
- ✅ Animaciones de correr / disparar / muerte / aparición de enemigos.

## Ideas pendientes / posibles mejoras
- Interiores con muebles/cobertura; más edificios con piso transitable.
- Oclusión de cámara para torres/rascacielos (ahora solo funden las casas).
- Headshots con daño extra (el raycast ya da el punto exacto del impacto).
- Pulido del "feel" de cámara/retroceso/bloom (valores en `weapons.js` y consts de `Game.js`).
- Controles táctiles para apuntado vertical/salto en móvil.

## Valores fáciles de tunear
- **Armas**: `src/weapons.js` — TODO por parámetros (daño, cadencia, alcance, dispersión mín/máx, bloom, retroceso vertical/horizontal, cargador, recarga, penetración, nº de perdigones). Añadir un arma = añadir una entrada. Motor en `src/systems/combat.js`.
- **Cámara**: const `CAM`, `LOOK_SENS`, `PITCH_MIN/MAX`, `MAX_RECOIL_*` en `src/systems/shared.js`; lógica en `src/systems/camera.js`.
- **Economía/progresión**: en `src/systems/shared.js` → curvas de escalado (`enemyHpMult`, `enemyCount`, `enemySpeedAdd`, `enemyDamageMult`), efecto de mejoras (`WEAPON_UPGRADES`, `PLAYER_UPGRADES`), coste (`upgradeCost`), topes (`MAX_GAME_LEVEL`/`MAX_WEAPON_LEVEL`/`MAX_PLAYER_LEVEL`), `COIN_DENOMS`. Presupuesto de monedas en `startNextWave` (`waves.js`).
- **Oleadas**: `startNextWave` (`toSpawn`, `spawnInterval`), `pickType` (mezcla de enemigos) en `src/systems/waves.js`.
- **Mundo**: `WORLD` (tamaño) en `src/systems/shared.js`; layout de manzanas en `Map.js`.
