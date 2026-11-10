import Phaser from 'phaser';
import './style.css';
import { GameScene } from './GameScene';

// Рендерим в физическом разрешении экрана (до 2x), чтобы на retina было чётко
const DPR = Math.min(window.devicePixelRatio || 1, 2);

function start() {
  document.getElementById('start')!.classList.add('hidden');
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#151a14',
    scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
    input: { activePointers: 4 },
    scene: [GameScene],
  });
  game.registry.set('dpr', DPR);
  let t = 0;
  const onResize = () => {
    clearTimeout(t);
    // iOS отдаёт новые размеры не сразу после поворота
    t = window.setTimeout(() => game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR), 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}

document.getElementById('start-btn')!.addEventListener('click', start, { once: true });
// Блокируем жесты Safari (зум щипком, двойной тап)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
