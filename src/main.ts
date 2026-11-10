import Phaser from 'phaser';
import './style.css';
import { GameScene } from './GameScene';
import { ClientScene } from './ClientScene';
import { Net, type Msg } from './net';
import { session } from './session';
import { sfx } from './sfx';
import { STAGES, loadProgress } from './stages';

// Рендерим в физическом разрешении экрана (до 2x), чтобы на retina было чётко
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const $ = (id: string) => document.getElementById(id)!;

let game: Phaser.Game | null = null;
type Lobby = 'idle' | 'hosting' | 'host-ready' | 'joining' | 'joined';
let lobby: Lobby = 'idle';

function fmt(t: number) { return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

function renderStages() {
  const p = loadProgress();
  const wrap = $('stages');
  wrap.innerHTML = '';
  STAGES.forEach((st, i) => {
    const b = document.createElement('button');
    const locked = i > p.unlocked;
    b.className = `stage s${i + 1}`;
    // гость ждёт выбора хоста; хост без напарника не может стартовать кооп
    b.disabled = locked || lobby === 'joined' || lobby === 'joining' || lobby === 'hosting';
    const stat = locked ? '🔒 Пройди предыдущий уровень'
      : p.cleared[i] ? `✅ Пройден · лучшее время ${fmt(p.best[i] ?? 0)}`
        : p.best[i] ? `Лучшее время ${fmt(p.best[i])}` : 'Новый';
    const cta = lobby === 'host-ready' && !locked ? '<span class="sstat">▶ Играть вдвоём</span>' : '';
    b.innerHTML = `<span class="snum">Уровень ${i + 1}</span><span class="sname">${st.name}</span><span>${st.desc}</span><span class="sstat">${stat}</span>${cta}`;
    b.addEventListener('click', () => (lobby === 'host-ready' ? startCoopHost(i) : startSolo(i)));
    wrap.appendChild(b);
  });
}

function setLobby(state: Lobby, html = '') {
  lobby = state;
  $('coop-idle').classList.toggle('hidden', state !== 'idle');
  $('coop-status').classList.toggle('hidden', state === 'idle');
  $('coop-cancel').classList.toggle('hidden', state === 'idle');
  $('coop-cancel').textContent = state === 'idle' ? '' : state === 'host-ready' || state === 'joined' ? 'Выйти из комнаты' : 'Отмена';
  $('coop-status').innerHTML = html;
  renderStages();
}

function ensureGame() {
  if (game) return game;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#151a14',
    scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
    input: { activePointers: 4 },
    scene: [],
  });
  game.registry.set('dpr', DPR);
  game.scene.add('game', GameScene, false);
  game.scene.add('client', ClientScene, false);
  game.events.on('menu', () => showMenu(true));
  game.events.on('coop-start', (stage: number) => startCoopHost(stage));
  let t = 0;
  const onResize = () => {
    clearTimeout(t);
    // iOS отдаёт новые размеры не сразу после поворота
    t = window.setTimeout(() => game!.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR), 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  return game;
}

function runScene(key: 'game' | 'client', data: object) {
  sfx.unlock();
  $('start').classList.add('hidden');
  const g = ensureGame();
  const other = key === 'game' ? 'client' : 'game';
  if (g.scene.isActive(other)) g.scene.stop(other);
  if (g.scene.isActive(key)) g.scene.stop(key);
  g.scene.start(key, data);
}

function stopScenes() {
  if (!game) return;
  for (const k of ['game', 'client']) if (game.scene.isActive(k)) game.scene.stop(k);
}

function showMenu(leaveRoom: boolean) {
  stopScenes();
  if (leaveRoom) closeNet();
  $('hud').classList.add('hidden');
  for (const id of ['levelup', 'end', 'pause-ov', 'vote', 'wait', 'countdown']) $(id).classList.add('hidden');
  for (const id of ['joy-base', 'joy-knob']) $(id).style.display = 'none';
  document.body.style.background = '';
  renderStages();
  $('start').classList.remove('hidden');
}

function startSolo(stage: number) { runScene('game', { stage }); }

function startCoopHost(stage: number) {
  const net = session.net;
  if (!net?.connected) { showMenu(true); return; }
  const seed = (Math.random() * 1e9) | 0;
  const time = Number(new URLSearchParams(location.search).get('time')) || undefined;
  net.send({ t: 'start', stage, seed, time });
  runScene('game', { stage, seed, coop: true });
}

// ---------- Сеть / лобби ----------
function closeNet() {
  session.net?.close();
  session.net = null;
  session.onMsg = session.onSnap = session.onClose = null;
  setLobby('idle');
}

function bindNet(net: Net) {
  session.net = net;
  net.onMsg = (m: Msg) => {
    if (m.t === 'start' && net.role === 'client') { runScene('client', { stage: m.stage, seed: m.seed, time: m.time }); return; }
    session.onMsg?.(m);
  };
  net.onSnap = (b) => session.onSnap?.(b);
  net.onClose = (reason) => {
    if (session.onClose) { session.onClose(reason); }
    if (net.role === 'host' && session.net === net) {
      // хост остаётся в комнате и ждёт нового гостя
      setLobby('hosting', roomHtml(net.code, `${reason}. Ждём напарника…`));
    } else if (session.net === net) {
      session.net = null;
      setLobby('idle');
      $('coop-status').classList.remove('hidden');
      $('coop-status').textContent = reason;
    }
  };
}

function roomHtml(code: string, note: string) {
  return `Код комнаты:<span class="code">${code}</span>${note}`;
}

async function hostRoom() {
  sfx.unlock();
  setLobby('hosting', 'Создаём комнату…');
  try {
    const net = await Net.host();
    if (lobby !== 'hosting') { net.close(); return; }
    bindNet(net);
    setLobby('hosting', roomHtml(net.code, 'Продиктуйте код напарнику. Ждём подключения…'));
    net.onOpen = () => {
      sfx.play('chest');
      setLobby('host-ready', roomHtml(net.code, '✅ Напарник подключился! Выберите уровень выше.'));
    };
  } catch (e) {
    setLobby('idle');
    $('coop-status').classList.remove('hidden');
    $('coop-status').textContent = `Не удалось создать комнату: ${(e as Error).message}`;
  }
}

async function joinRoom() {
  sfx.unlock();
  const code = ($('coop-code') as HTMLInputElement).value.trim().toUpperCase();
  if (code.length < 5) { ($('coop-code') as HTMLInputElement).focus(); return; }
  setLobby('joining', `Подключаемся к комнате <b>${code}</b>…`);
  try {
    const net = await Net.join(code);
    if (lobby !== 'joining') { net.close(); return; }
    bindNet(net);
    net.onOpen = () => {
      sfx.play('chest');
      setLobby('joined', `✅ Подключено к комнате <b>${code}</b>. Хост выбирает уровень…`);
    };
  } catch (e) {
    setLobby('idle');
    $('coop-status').classList.remove('hidden');
    $('coop-status').textContent = (e as Error).message;
  }
}

$('coop-host').addEventListener('click', () => void hostRoom());
$('coop-join').addEventListener('click', () => void joinRoom());
($('coop-code') as HTMLInputElement).addEventListener('keydown', (e) => { if (e.key === 'Enter') void joinRoom(); });
$('coop-cancel').addEventListener('click', () => closeNet());

// ---------- Звук ----------
const muteBtn = $('mute');
const syncMute = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
syncMute();
muteBtn.addEventListener('click', () => {
  sfx.unlock(); sfx.setMuted(!sfx.muted); syncMute();
  if (!sfx.muted) setTimeout(() => sfx.play('chest'), 60); // проверочный звук
});
// iOS считает жестом только click/touchend/keydown (не pointerdown) — будим звук на них
for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, () => sfx.unlock(), { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sfx.unlock(); });

setLobby('idle');
// Блокируем жесты Safari (зум щипком, двойной тап)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
