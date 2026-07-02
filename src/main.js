import Game from './Game.js';

const container = document.getElementById('game');
const game = new Game(container);

// Expuesto solo para depuración en desarrollo.
if (import.meta.env.DEV) {
  window.__game = game;
}
