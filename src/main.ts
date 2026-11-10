import Phaser from 'phaser';
import './style.css';
import { GameScene } from './GameScene';

function start() {
  document.getElementById('start')!.classList.add('hidden');
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#151a14',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { activePointers: 4 },
    scene: [GameScene],
  });
}

document.getElementById('start-btn')!.addEventListener('click', start, { once: true });
// Блокируем жесты Safari (зум щипком, двойной тап)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
