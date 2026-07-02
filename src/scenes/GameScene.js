import Phaser from 'phaser';
import Player from '../entities/Player.js';
import Zombie from '../entities/Zombie.js';
import Bullet from '../entities/Bullet.js';

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1200;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Suelo en mosaico para dar sensación de movimiento.
    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'tile')
      .setOrigin(0, 0)
      .setDepth(0);

    // Jugador en el centro del mundo.
    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

    // Cámara que sigue al jugador.
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Pools de balas y zombies (reutilización de objetos = rendimiento).
    this.bullets = this.physics.add.group({
      classType: Bullet,
      maxSize: 60,
      runChildUpdate: true,
    });
    this.zombies = this.physics.add.group({ classType: Zombie, maxSize: 200 });

    // Capa de partículas/efectos (sangre, fogonazos).
    this.effects = this.add.group();

    this.setupInput();
    this.setupCollisions();
    this.setupHud();

    // Estado de partida.
    this.score = 0;
    this.wave = 0;
    this.zombiesToSpawn = 0;
    this.zombiesAlive = 0;
    this.betweenWaves = true;

    this.startNextWave();
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
  }

  setupCollisions() {
    // Bala impacta zombie.
    this.physics.add.overlap(this.bullets, this.zombies, (bullet, zombie) => {
      if (!bullet.active || !zombie.active) return;
      bullet.disableBody(true, true);
      if (zombie.hurt(bullet.damage)) {
        zombie.kill();
        this.zombiesAlive -= 1;
        this.addScore(10);
        this.checkWaveCleared();
      }
    });

    // Zombie toca al jugador.
    this.physics.add.overlap(this.player, this.zombies, (player, zombie) => {
      if (!zombie.active) return;
      const hit = player.takeDamage(zombie.damage, this.time.now);
      if (hit) {
        this.cameras.main.shake(120, 0.008);
        this.updateHud();
        if (player.hp <= 0) this.gameOver();
      }
    });

    // Los zombies se empujan entre sí para no apilarse en un solo punto.
    this.physics.add.collider(this.zombies, this.zombies);
  }

  setupHud() {
    const style = { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#ffffff' };
    this.hpText = this.add.text(16, 14, '', style).setScrollFactor(0).setDepth(100);
    this.scoreText = this.add.text(16, 42, '', style).setScrollFactor(0).setDepth(100);
    this.waveText = this.add
      .text(this.scale.width - 16, 14, '', style)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // Barra de vida.
    this.hpBarBg = this.add.rectangle(16, 80, 220, 16, 0x000000, 0.5)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.hpBar = this.add.rectangle(18, 82, 216, 12, 0xe53935)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(101);

    this.announce = this.add
      .text(this.scale.width / 2, this.scale.height / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '48px',
        color: '#ffd54f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);

    this.updateHud();
  }

  updateHud() {
    this.hpText.setText(`Vida: ${this.player.hp}`);
    this.scoreText.setText(`Puntos: ${this.score}`);
    this.waveText.setText(`Oleada: ${this.wave}`);
    this.hpBar.width = 216 * (this.player.hp / this.player.maxHp);
  }

  addScore(amount) {
    this.score += amount;
    this.updateHud();
  }

  // --- Oleadas -------------------------------------------------------------

  startNextWave() {
    this.wave += 1;
    this.betweenWaves = false;
    this.zombiesToSpawn = 4 + this.wave * 2;
    this.zombiesAlive = this.zombiesToSpawn;
    this.updateHud();

    this.showAnnounce(`OLEADA ${this.wave}`);

    // Genera los zombies de forma escalonada.
    this.spawnTimer = this.time.addEvent({
      delay: Math.max(250, 900 - this.wave * 40),
      repeat: this.zombiesToSpawn - 1,
      callback: () => this.spawnZombie(),
    });
  }

  spawnZombie() {
    const zombie = this.zombies.get();
    if (!zombie) {
      this.zombiesAlive -= 1;
      return;
    }
    const { x, y } = this.randomEdgePosition();
    zombie.spawn(x, y, this.wave);
  }

  /** Punto de aparición en el borde del mundo, lejos del jugador. */
  randomEdgePosition() {
    const margin = 40;
    let x;
    let y;
    do {
      const side = Phaser.Math.Between(0, 3);
      if (side === 0) { x = margin; y = Phaser.Math.Between(0, WORLD_HEIGHT); }
      else if (side === 1) { x = WORLD_WIDTH - margin; y = Phaser.Math.Between(0, WORLD_HEIGHT); }
      else if (side === 2) { x = Phaser.Math.Between(0, WORLD_WIDTH); y = margin; }
      else { x = Phaser.Math.Between(0, WORLD_WIDTH); y = WORLD_HEIGHT - margin; }
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 350);
    return { x, y };
  }

  checkWaveCleared() {
    if (this.zombiesAlive <= 0 && this.zombiesToSpawn <= 0 && !this.betweenWaves) {
      this.betweenWaves = true;
      this.showAnnounce(`¡OLEADA ${this.wave} COMPLETA!`);
      this.time.delayedCall(2200, () => this.startNextWave());
    }
  }

  showAnnounce(text) {
    this.announce.setText(text).setAlpha(1);
    this.tweens.add({
      targets: this.announce,
      alpha: 0,
      delay: 1200,
      duration: 800,
    });
  }

  // --- Efectos -------------------------------------------------------------

  spawnMuzzleFlash(x, y) {
    const flash = this.add.circle(x, y, 6, 0xfff176, 0.9).setDepth(9);
    this.tweens.add({
      targets: flash,
      scale: 0,
      alpha: 0,
      duration: 90,
      onComplete: () => flash.destroy(),
    });
  }

  spawnBlood(x, y) {
    for (let i = 0; i < 6; i += 1) {
      const p = this.add.circle(x, y, Phaser.Math.Between(2, 5), 0x8e0000, 1).setDepth(4);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(15, 40);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 400,
        onComplete: () => p.destroy(),
      });
    }
  }

  // --- Bucle principal -----------------------------------------------------

  update(time) {
    if (!this.player.active) return;

    this.player.handleMovement(this.cursors, this.keys);
    this.player.aimAndFire(this.input.activePointer, time, this.bullets);

    this.zombies.children.iterate((z) => {
      if (z && z.active) z.chase(this.player);
      return true;
    });

    // Cuando el temporizador termina de generar, marca que ya no quedan por salir.
    if (this.spawnTimer && this.spawnTimer.getRepeatCount() === 0) {
      this.zombiesToSpawn = 0;
    }
  }

  gameOver() {
    this.player.setVelocity(0, 0);
    this.player.active = false;
    this.scene.start('GameOverScene', { score: this.score, wave: this.wave });
  }
}
