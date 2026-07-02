import * as THREE from 'three';
import Input from './Input.js';
import Hud from './Hud.js';
import Walls from './Walls.js';
import NavGrid from './NavGrid.js';
import Player from './entities/Player.js';
import AudioManager from './Audio.js';
import TouchControls from './Touch.js';
import Models from './Models.js';
import { buildMap } from './Map.js';
import { WORLD, rand, dist2 } from './systems/shared.js';
import wavesMixin from './systems/waves.js';
import combatMixin from './systems/combat.js';
import effectsMixin from './systems/effects.js';
import economyMixin from './systems/economy.js';
import shopMixin from './systems/shop.js';
import cameraMixin from './systems/camera.js';
import platformsMixin from './systems/platforms.js';
import bossModeMixin from './systems/bossmode.js';
import netClientMixin from './systems/netclient.js';
import netGameMixin from './systems/netgame.js';

export default class Game {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x223047);
    this.scene.fog = new THREE.Fog(0x223047, 44, 120);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camYaw = 0;
    this.camPitch = 0; // apuntado vertical (arriba/abajo)
    this.recoilPitch = 0; // retroceso de cámara (vertical), se recupera solo
    this.recoilYaw = 0;
    this._ndcCenter = { x: 0, y: 0 };
    this._aimObjs = [];

    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioManager();
    this.hud = new Hud();
    this.hud.audio = this.audio;
    this.touch = new TouchControls(this.input);
    this.models = new Models();

    // Sumidero de efectos de CLIENTE (visuales/audio/cámara). La lógica de juego
    // (sim y combate) los dispara por aquí en vez de llamar al render/audio
    // directamente, separando el daño (gameplay) de los FX. Un servidor headless
    // usaría un no-op (o un difusor de eventos por la red) en su lugar.
    this.fx = {
      blood: (pos) => this.spawnBlood(pos),
      tracer: (from, to, color) => this.spawnTracer(from, to, color),
      explosion: (pos, radius) => this.spawnExplosion(pos, radius),
      muzzleFlash: (pos) => this.spawnMuzzleFlash(pos),
      recoil: (pitch, yaw) => this.addRecoil(pitch, yaw),
      sound: (name, arg) => {
        const a = this.audio;
        if (!a) return;
        if (name === 'shoot') a.shoot(arg);
        else if (typeof a[name] === 'function') a[name]();
      },
    };

    this.raycaster = new THREE.Raycaster();
    this.camRay = new THREE.Raycaster();
    this.pelletRay = new THREE.Raycaster(); // raycasts de la escopeta (hitscan)
    this._pelletObjs = [];
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.platforms = []; // plataformas/rampas transitables (verticalidad)
    this.roofs = [];     // partes superiores de casas a ocultar al entrar arriba
    this.clock = new THREE.Clock();
    this._pointerHit = new THREE.Vector3();
    this._camHead = new THREE.Vector3();
    this._camDesired = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._camLookAt = new THREE.Vector3();       // punto de mira suavizado (lag)
    this._lookTargetDesired = new THREE.Vector3();
    this._lookAheadAmt = 0;                       // look-ahead suavizado
    this.mode = 'campaign';   // 'campaign' (modo niveles) o 'boss' (modo jefe)
    this.worldSize = WORLD;   // tamaño del arena (el modo jefe lo triplica)
    this.net = null;               // cliente de salas co-op (se crea al usarlo)
    this.remotePlayers = new Map(); // id -> RemotePlayer (compañeros de sala)
    // Cámara en primera persona (tecla V); preferencia recordada.
    this.firstPerson = localStorage.getItem('zombies-fpv') === '1';
    this.state = 'loading';

    window.addEventListener('resize', () => this.onResize());
    // Si se pierde el pointer-lock (Esc) durante el juego, se recupera al clic.
    this.renderer.domElement.addEventListener('mousedown', () => {
      if (this.state === 'playing' && !this.input.pointerLocked) this.lockPointer();
    });
    // Esc pausa: al soltar la captura del cursor (Esc) o por la propia tecla.
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.state === 'playing') this.pauseGame();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pauseGame();
      if (e.code === 'KeyV' && (this.state === 'playing' || this.state === 'paused')) {
        this.setFirstPerson(!this.firstPerson);
      }
    });

    this.init();
  }

  /** Carga modelos, construye el mapa y arranca en el menú. */
  async init() {
    this.hud.showLoading();
    await this.models.loadAll([
      ['keeper', '/models/characters/character-keeper.glb'],
      ['zombie', '/models/characters/character-zombie.glb'],
      ['skeleton', '/models/characters/character-skeleton.glb'],
      ['ghost', '/models/characters/character-ghost.glb'],
      ['bA', '/models/map/building-type-a.glb'],
      ['bB', '/models/map/building-type-b.glb'],
      ['bC', '/models/map/building-type-c.glb'],
      ['bD', '/models/map/building-type-d.glb'],
      ['bE', '/models/map/building-type-e.glb'],
      ['bF', '/models/map/building-type-f.glb'],
      ['bG', '/models/map/building-type-g.glb'],
      ['bH', '/models/map/building-type-h.glb'],
      // Edificios de varios pisos (city-commercial) para las manzanas-torre.
      ['cityA', '/models/city-commercial/building-a.glb'],
      ['cityB', '/models/city-commercial/building-c.glb'],
      ['cityC', '/models/city-commercial/building-e.glb'],
      ['tree', '/models/map/tree-large.glb'],
      ['treeSmall', '/models/map/tree-small.glb'],
      ['fence', '/models/map/fence-1x4.glb'],
      ['planter', '/models/map/planter.glb'],
      ['pathStones', '/models/map/path-stones-long.glb'],
    ]);

    this.buildEnvironment();
    this.prepare();
    this.hud.hideLoading();
    this.showMainMenu();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  buildEnvironment() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    this.scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x2a3b2a, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(12, 26, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -WORLD;
    sun.shadow.camera.right = WORLD;
    sun.shadow.camera.top = WORLD;
    sun.shadow.camera.bottom = -WORLD;
    sun.shadow.camera.far = 80;
    this.scene.add(sun);

    // Materiales del suelo y del muro perimetral (reutilizados al reescalar).
    this._groundMat = new THREE.MeshStandardMaterial({ color: 0x3b5a3b, roughness: 1 });
    this._perimMat = new THREE.MeshStandardMaterial({ color: 0x37474f });
    this._perimeter = [];
    this.buildBounds(this.worldSize); // suelo + muro perimetral al tamaño actual

    // Mapa suburbano (edificios = obstáculos) SIEMPRE centrado a WORLD, aunque el
    // arena sea más grande (modo jefe): los enemigos fuera de la rejilla van directo
    // al jugador y la nav (WORLD) los guía al llegar al vecindario.
    this.walls = new Walls();
    buildMap(this, WORLD);
    this.nav = new NavGrid(WORLD, this.walls, this.platforms, 1, 0.55);
  }

  /** (Re)construye el suelo y el muro perimetral al tamaño `size`. El vecindario
   *  y la navegación quedan fijos a WORLD; solo cambian los límites del arena. */
  buildBounds(size) {
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh.geometry.dispose(); }
    for (const w of this._perimeter) { this.scene.remove(w); w.geometry.dispose(); }
    this._perimeter = [];

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size * 2 + 60, size * 2 + 60), this._groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundMesh = ground; // objetivo del raycast de la mira (impacto en el suelo)

    const geoH = new THREE.BoxGeometry(size * 2 + 1, 1.6, 0.5);
    const geoV = new THREE.BoxGeometry(0.5, 1.6, size * 2 + 1);
    for (const [x, z, geo] of [
      [0, -size, geoH], [0, size, geoH], [-size, 0, geoV], [size, 0, geoV],
    ]) {
      const w = new THREE.Mesh(geo, this._perimMat);
      w.position.set(x, 0.8, z);
      w.receiveShadow = true;
      this.scene.add(w);
      this._perimeter.push(w);
    }
  }

  /** Cambia el tamaño del arena (límites + suelo + perímetro). El vecindario y la
   *  nav no cambian. Usado por el modo jefe (mapa ×3). */
  setWorldSize(size) {
    if (this.worldSize === size) return;
    this.worldSize = size;
    this.buildBounds(size);
  }

  // --- Ciclo de partida ----------------------------------------------------

  prepare() {
    if (this.player) this.scene.remove(this.player.mesh);
    for (const z of this.zombies || []) this.scene.remove(z.mesh);
    for (const c of this.corpses || []) this.scene.remove(c.mesh);
    for (const b of this.bullets || []) this.scene.remove(b.mesh);
    for (const e of this.effects || []) this.scene.remove(e.mesh);
    for (const it of this.items || []) this.scene.remove(it.mesh);
    for (const eb of this.enemyBullets || []) this.scene.remove(eb.mesh);

    this.zombies = [];
    this.corpses = [];
    this.bullets = [];
    this.effects = [];
    this.items = [];
    this.enemyBullets = [];
    this.score = 0;
    this.coins = 0;
    this.wave = 0;
    this.boss = null;
    this.shake = 0;

    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 0.8;

    this.player = new Player(this);
    this.applyProgress(this.player); // carga armas/mejoras guardadas (loadout de campaña)
    this.applyCameraMode();          // 1ª/3ª persona sobre el jugador nuevo
    this.camYaw = this.player.mesh.rotation.y;
    this.snapCamera();
    this.hud.hideBossBar();
    this.hud.update(this.stats());
  }

  startGame() {
    this.mode = 'campaign';
    this.setWorldSize(WORLD); // arena normal (por si venía del modo jefe)
    this.prepare();
    this.hud.hideMenu();
    this.hud.hideGameOver();
    this.hud.hideShop();
    this.state = 'playing';
    this.lockPointer();
    this.startNextWave();
  }

  // --- Progreso persistente (loadout de campaña: armas y mejoras) -----------

  loadProgress() {
    try { return JSON.parse(localStorage.getItem('zombies-progress') || 'null'); } catch { return null; }
  }

  /** Guarda armas desbloqueadas + mejoras del jugador actual. */
  saveProgress() {
    if (!this.player) return;
    const s = this.player.sim;
    const data = { owned: [...s.owned], weaponUpgrades: s.weaponUpgrades, playerUpgrades: s.playerUpgrades };
    try { localStorage.setItem('zombies-progress', JSON.stringify(data)); } catch { /* sin storage */ }
  }

  /** Aplica el progreso guardado a un jugador recién creado. */
  applyProgress(player) {
    const data = this.loadProgress();
    if (!data) return;
    const s = player.sim;
    if (Array.isArray(data.owned)) s.owned = new Set(data.owned);
    if (data.weaponUpgrades) {
      for (const k in s.weaponUpgrades) if (data.weaponUpgrades[k]) Object.assign(s.weaponUpgrades[k], data.weaponUpgrades[k]);
    }
    if (data.playerUpgrades) Object.assign(s.playerUpgrades, data.playerUpgrades);
    player.applyMaxHpUpgrade();
    s.hp = s.maxHp;
    for (const k in s.ammo) s.ammo[k] = player.effWeapon(k).magSize; // cargadores al tamaño mejorado
  }

  /** Muestra el menú principal con sus tres modos/acciones. */
  showMainMenu() {
    this.state = 'menu';
    this.mode = 'campaign';
    this.setWorldSize(WORLD);
    this.netCleanup(); // si venía de una sala co-op, sal de ella
    this.hud.hideBossBar();
    this.hud.hideShop();
    this.hud.hideGameOver();
    this.hud.hideBossMenu();
    this.hud.showMenu(
      () => this.startGame(),
      () => this.openUpgradeMenu(),
      () => this.openBossMenu(),
    );
  }

  openBossMenu() {
    this.hud.hideMenu();
    this.hud.showBossMenu(
      (diff) => this.startBossMode(diff),
      () => { this.hud.hideBossMenu(); this.showMainMenu(); },
      () => this.createRoom(),
      (code) => this.joinRoom(code),
    );
  }

  stats() {
    const w = this.player.effWeapon(this.player.weapon);
    return {
      hp: this.player.hp, maxHp: this.player.maxHp,
      score: this.score, coins: this.coins, wave: this.wave,
      dayLabel: this.mode === 'boss' && this.bossCfg ? `JEFE · ${this.bossCfg.label}` : null,
      weapon: w.name,
      ammo: this.player.ammo[this.player.weapon],
      magSize: w.magSize,
      reloading: this.player.reloading,
    };
  }

  // --- Pausa y captura de cursor -------------------------------------------

  lockPointer() {
    const el = this.renderer.domElement;
    if (!el.requestPointerLock) return;
    const p = el.requestPointerLock();
    // En algunos navegadores devuelve una promesa; ignora el rechazo (se
    // reintenta al hacer clic en el área de juego).
    if (p && p.catch) p.catch(() => {});
  }

  unlockPointer() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.firing = false;
    this.hud.showPause(() => this.resumeGame(), () => this.quitToMenu());
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.hud.hidePause();
    this.state = 'playing';
    this.lockPointer(); // vuelve a capturar el cursor
  }

  /** Abandona la partida y vuelve al menú principal (desde la pausa). */
  quitToMenu() {
    this.hud.hidePause();
    this.unlockPointer();
    this.showMainMenu();
  }

  // --- Cámara: primera ↔ tercera persona (tecla V) --------------------------

  setFirstPerson(v) {
    this.firstPerson = v;
    try { localStorage.setItem('zombies-fpv', v ? '1' : '0'); } catch { /* sin storage */ }
    // Al volver a 3ª persona, reencaja el pitch en su rango más corto.
    if (!v) this.camPitch = THREE.MathUtils.clamp(this.camPitch, -0.6, 0.55);
    this.applyCameraMode();
    this.hud.announce(v ? 'CÁMARA: PRIMERA PERSONA' : 'CÁMARA: TERCERA PERSONA', 1100);
  }

  /** Aplica el modo de cámara al jugador actual: en 1ª persona se oculta su
   *  modelo y el arma cuelga de la cámara como viewmodel. */
  applyCameraMode() {
    const p = this.player;
    if (!p) return;
    if (this.firstPerson) {
      if (this.camera.parent !== this.scene) this.scene.add(this.camera); // hijos visibles
      p.model.visible = false;
      this.camera.add(p.gun); // reparenta (three lo quita del mesh del jugador)
    } else {
      p.model.visible = true;
      p.mesh.add(p.gun); // updateGun le devuelve su transform local en el siguiente frame
    }
  }

  // --- Consultas de mundo --------------------------------------------------

  clampToWorld(pos, r) {
    const m = this.worldSize - r - 0.5;
    pos.x = THREE.MathUtils.clamp(pos.x, -m, m);
    pos.z = THREE.MathUtils.clamp(pos.z, -m, m);
  }

  isInWorld(pos) {
    return Math.abs(pos.x) <= this.worldSize && Math.abs(pos.z) <= this.worldSize;
  }

  randomOpenPosition(minDistFromPlayer) {
    const m = WORLD - 2;
    for (let i = 0; i < 30; i += 1) {
      const p = new THREE.Vector3(rand(-m, m), 0.6, rand(-m, m));
      this.walls.resolveCircle(p, 1);
      if (!this.walls.blocksPoint(p, 0.5)
        && dist2(p.x, p.z, this.player.position.x, this.player.position.z) > minDistFromPlayer ** 2) {
        return p;
      }
    }
    return new THREE.Vector3(0, 0.6, 0);
  }

  // --- Bucle principal -----------------------------------------------------
  //
  // Separación lógica ↔ render (paso 1, base para el multijugador): el bucle se
  // divide en `step()` (SIMULACIÓN: lógica de juego pura, lo que un servidor
  // autoritario ejecutaría) y `present()` (RENDER: cámara, efectos, HUD y dibujo,
  // solo en el cliente). `frame()` los orquesta en el cliente local.
  //
  // Pendiente para headless real (sin Three.js en el servidor): las entidades aún
  // guardan su `mesh`/materiales, y `player.aim()` deriva la puntería del raycast
  // de la cámara. El siguiente seam es mover el estado de simulación fuera de los
  // objetos de render y sustituir el aim por "intención de disparo" (dir/‑input).

  frame() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    if (this.state === 'playing') {
      this.updateLook(delta); // entrada de cámara local (delta del mouse)
      if (this.coopActive) this.coopStep(delta); // co-op: manda el servidor
      else this.step(delta, time);               // solo: simulación local
    } else if (this.coopActive && this.state === 'paused') {
      // En co-op la pausa NO congela el mundo (el servidor sigue): se sigue
      // enviando input y aplicando snapshots; solo se libera el cursor.
      this.coopStep(delta);
    }
    this.present(delta);      // render (cliente)
  }

  /** Un tick de SIMULACIÓN: toda la lógica de juego, sin render. Punto de entrada
   *  que un servidor autoritario ejecutaría para el multijugador. */
  step(delta, time) {
    this.player.aim();
    this.player.handleWeaponSwitch();
    this.player.handleReload(time);
    this.player.updateReload(time);
    this.player.move(delta);
    this.player.tryFire(time);

    if (this.mode === 'boss') this.updateBossLevel(delta);
    else this.updateWaves(delta);
    this.netTick(delta); // co-op: envía el estado propio (throttle interno)
    // recalcula solo si el jugador cambia de celda o de nivel (planta/loft).
    this.nav.computeFlowField(this.player.position, this.player.position.y > 1.3 ? 1 : 0);
    for (const z of this.zombies) z.update(delta, this.player, this.zombies);
    for (const b of this.bullets) b.update(delta);
    for (const eb of this.enemyBullets) eb.update(delta);
    for (const it of this.items) it.update(delta);

    this.handleCollisions(time);
  }

  /** PRESENTACIÓN (solo cliente): efectos visuales, cámara, HUD y dibujo. */
  present(delta) {
    if (this.state === 'playing') {
      this.updateRoofFade(delta);
      this.updateEffects(delta);
      this.updateBossBar();
      this.hud.update(this.stats());
    } else {
      this.updateEffects(delta);
    }

    this.updateCorpses(delta); // animación de muerte + desvanecido (siempre)
    for (const rp of this.remotePlayers.values()) rp.update(delta); // compañeros co-op
    this.updateAimUI();
    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
  }

  onPlayerHurt(shake) {
    this.shake = Math.max(this.shake, shake);
    this.fx.sound('hurt');
    this.hud.flashDamage();
  }

  gameOver() {
    this.state = 'over';
    this.unlockPointer(); // cursor libre para el menú de game over
    this.hud.hideBossBar();
    this.fx.sound('gameOver');
    // Al reintentar se vuelve al menú principal (para elegir modo).
    this.hud.showGameOver(this.score, this.wave, () => this.showMainMenu());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Ensambla los sistemas (mixins) en el prototipo. Cada método usa `this` =
// instancia de Game, exactamente igual que cuando vivían en esta clase.
Object.assign(
  Game.prototype,
  wavesMixin,
  combatMixin,
  effectsMixin,
  economyMixin,
  shopMixin,
  cameraMixin,
  platformsMixin,
  bossModeMixin,
  netClientMixin,
  netGameMixin,
);
