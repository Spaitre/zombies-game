import Phaser from 'phaser';

/**
 * BootScene genera todas las texturas de forma procedural (sin archivos de
 * imagen) usando Graphics. Así el juego corre sin assets externos y evita
 * cualquier problema de copyright. En fases siguientes se pueden reemplazar
 * por sprites reales.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.makeCircleTexture('player', 18, 0x4fc3f7, 0x0288d1);
    this.makeCircleTexture('zombie', 16, 0x7cb342, 0x33691e);
    this.makeCircleTexture('bullet', 5, 0xfff59d, 0xfbc02d);
    this.makeTileTexture();

    this.scene.start('GameScene');
  }

  /** Dibuja un círculo relleno con borde y lo registra como textura. */
  makeCircleTexture(key, radius, fill, stroke) {
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.lineStyle(3, stroke, 1);
    g.fillCircle(radius, radius, radius);
    g.strokeCircle(radius, radius, radius);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  /** Textura del suelo: un patrón sutil para dar sensación de movimiento. */
  makeTileTexture() {
    const size = 64;
    const g = this.add.graphics();
    g.fillStyle(0x1d1d28, 1);
    g.fillRect(0, 0, size, size);
    g.lineStyle(1, 0x26263a, 1);
    g.strokeRect(0, 0, size, size);
    g.generateTexture('tile', size, size);
    g.destroy();
  }
}
