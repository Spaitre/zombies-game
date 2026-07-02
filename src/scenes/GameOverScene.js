import Phaser from 'phaser';

const HIGHSCORE_KEY = 'zombies-highscore';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data) {
    const { width, height } = this.scale;
    const score = data.score ?? 0;
    const wave = data.wave ?? 0;

    const prevBest = Number(localStorage.getItem(HIGHSCORE_KEY) || 0);
    const best = Math.max(prevBest, score);
    localStorage.setItem(HIGHSCORE_KEY, String(best));
    const isNewRecord = score > prevBest && score > 0;

    this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0, 0);

    this.add
      .text(width / 2, height / 2 - 120, 'GAME OVER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        color: '#e53935',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 40, `Llegaste a la oleada ${wave}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2, `Puntos: ${score}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 40, `Récord: ${best}${isNewRecord ? '  ¡NUEVO!' : ''}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: isNewRecord ? '#ffd54f' : '#9e9e9e',
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(width / 2, height / 2 + 110, 'JUGAR DE NUEVO', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        color: '#15151c',
        backgroundColor: '#4fc3f7',
        padding: { x: 24, y: 12 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setBackgroundColor('#81d4fa'));
    btn.on('pointerout', () => btn.setBackgroundColor('#4fc3f7'));
    btn.on('pointerdown', () => this.scene.start('GameScene'));

    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
  }
}
