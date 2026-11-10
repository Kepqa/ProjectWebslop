import Phaser from 'phaser';
import './style.css';
import { GameScene } from './GameScene';
import { sfx } from './sfx';
import { STAGES, loadProgress } from './stages';

// Рендерим в физическом разрешении экрана (до 2x), чтобы на retina было чётко
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const $ = (id: string) => document.getElementById(id)!;

let game: Phaser.Game | null = null;

function fmt(t: number) { return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

function renderStages() {
  const p = loadProgress();
  const wrap = $('stages');
  wrap.innerHTML = '';
  STAGES.forEach((st, i) => {
    const b = document.createElement('button');
    const locked = i > p.unlocked;
    b.className = `stage s${i + 1}`;
    b.disabled = locked;
    const stat = locked ? '🔒 Пройди предыдущий уровень'
      : p.cleared[i] ? `✅ Пройден · лучшее время ${fmt(p.best[i] ?? 0)}`
        : p.best[i] ? `Лучшее время ${fmt(p.best[i])}` : 'Новый';
    b.innerHTML = `<span class="snum">Уровень ${i + 1}</span><span class="sname">${st.name}</span><span>${st.desc}</span><span class="sstat">${stat}</span>`;
    b.addEventListener('click', () => start(i));
    wrap.appendChild(b);
  });
}

function showMenu() {
  if (game) game.scene.stop('game');
  $('hud').classList.add('hidden');
  for (const id of ['levelup', 'end', 'joy-base', 'joy-knob']) { const e = $(id); if (id.startsWith('joy')) e.style.display = 'none'; else e.classList.add('hidden'); }
  renderStages();
  $('start').classList.remove('hidden');
}

function start(stage: number) {
  sfx.unlock();
  $('start').classList.add('hidden');
  if (game) { game.scene.start('game', { stage }); return; }
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#151a14',
    scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
    input: { activePointers: 4 },
    scene: [],
  });
  game.registry.set('dpr', DPR);
  game.scene.add('game', GameScene, true, { stage });
  game.events.on('menu', showMenu);
  let t = 0;
  const onResize = () => {
    clearTimeout(t);
    // iOS отдаёт новые размеры не сразу после поворота
    t = window.setTimeout(() => game!.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR), 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}

const muteBtn = $('mute');
const syncMute = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
syncMute();
muteBtn.addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.muted); syncMute(); });
// Любое касание «будит» звук (iOS приостанавливает AudioContext)
document.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });

renderStages();
// Блокируем жесты Safari (зум щипком, двойной тап)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
