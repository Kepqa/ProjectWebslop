import Phaser from 'phaser';
import './style.css';
import { GameScene } from './GameScene';
import { ClientScene } from './ClientScene';
import { Net, type Msg } from './net';
import { session } from './session';
import { sfx } from './sfx';
import { STAGES, loadProgress } from './stages';
import { fetchStats, isDev, trackRun, trackVisit } from './stats';
import { CHAPTERS } from './story';
import { settings, saveSettings } from './settings';
import { META, buyMeta, loadMeta } from './meta';
import { ACHIEVEMENTS, LOCKED_BY, isUnlocked, loadAch, unlockedSet } from './achievements';
import { SYNERGIES, UPGRADES, byId } from './upgrades';
import { BUILD, BUILD_DATE, VERSION, checkUpdate } from './version';

// Рендерим в физическом разрешении экрана (до 2x), чтобы на retina было чётко
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const $ = (id: string) => document.getElementById(id)!;

let game: Phaser.Game | null = null;
type Lobby = 'idle' | 'hosting' | 'host-ready' | 'joining' | 'joined';
let lobby: Lobby = 'idle';

function fmt(t: number) { return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

type Mode = 'survival' | 'story';
interface Pick { mode: Mode; stage: number; chapter: number }

/** Карточки уровней выживания и глав сюжета. onPick — что делать по нажатию. */
function cards(wrapId: string, onPick: (p: Pick) => void, opts: { story?: boolean; survival?: boolean; disabled?: boolean } = {}) {
  const p = loadProgress();
  const wrap = $(wrapId);
  wrap.innerHTML = '';
  const add = (cls: string, html: string, locked: boolean, pick: Pick) => {
    const b = document.createElement('button');
    b.className = `stage ${cls}`;
    b.disabled = locked || !!opts.disabled;
    b.innerHTML = html;
    b.addEventListener('click', () => onPick(pick));
    wrap.appendChild(b);
  };
  if (opts.story) CHAPTERS.forEach((ch, i) => {
    const locked = !ch.ready || (i > (p.story ?? 0) && !isDev());
    const st = !ch.ready ? '🔨 Скоро' : locked ? '🔒' : (p.story ?? 0) > i ? '✅ Пройдена' : '▶ Играть';
    add(`s1 ${ch.ready ? '' : 'locked-soon'}`, `<span class="snum">Глава ${i + 1}</span><span class="sname">${ch.name}</span><span class="sdesc">${ch.goal}</span><span class="sstat">${st}</span>`, locked, { mode: 'story', stage: 0, chapter: i });
  });
  if (opts.survival) STAGES.forEach((st, i) => {
    const locked = i > p.unlocked && !isDev();
    const stat = locked ? '🔒 Пройди предыдущий' : p.cleared[i] ? `✅ ${fmt(p.best[i] ?? 0)}` : p.best[i] ? `Рекорд ${fmt(p.best[i])}` : '▶ Играть';
    add(`s${i + 1}`, `<span class="snum">Арена ${i + 1}</span><span class="sname">${st.name}</span><span class="sstat">${stat}</span>`, locked, { mode: 'survival', stage: i, chapter: 0 });
  });
}

function renderStages() {
  cards('chapters', (p) => startSolo(p), { story: true });
  cards('stages', (p) => startSolo(p), { survival: true });
  const ready = lobby === 'host-ready';
  $('coop-choices').classList.toggle('hidden', !ready);
  if (ready) cards('coop-choices', (p) => startCoopHost(p), { story: true, survival: true });
}

type Panel = 'main' | 'story' | 'survival' | 'coop' | 'shop' | 'codex' | 'ach';
function showPanel(id: Panel) {
  for (const k of ['main', 'story', 'survival', 'coop', 'shop', 'codex', 'ach']) $(`menu-${k}`).classList.toggle('hidden', k !== id);
  $('menu-sub').classList.toggle('hidden', id !== 'main');
  document.querySelector('.tips')!.classList.toggle('hidden', id !== 'main');
  document.querySelector('.settings')!.classList.toggle('hidden', id !== 'main');
  if (id === 'shop') renderShop();
  if (id === 'codex') renderCodex();
  if (id === 'ach') renderAch();
  renderBones();
}

/** Справочник предметов: что делает, синергии, как открыть. */
function renderCodex() {
  const un = unlockedSet();
  const groups: [string, string][] = [['swipe', '🗡️ Свойства клинка'], ['shape', '🌀 Формы свайпа'], ['trinket', '🏮 Тринкеты']];
  $('codex').innerHTML = groups.map(([kind, title]) => `<div class="cx-group"><h3>${title}</h3><div class="cx-grid">${UPGRADES.filter((u) => u.kind === kind).map((u) => {
    const ok = isUnlocked(u.id, un);
    const syn = SYNERGIES.filter((x) => x.a === u.id || x.b === u.id).map((x) => `${x.icon} ${x.name} (+ ${byId(x.a === u.id ? x.b : x.a)!.icon})`).join(', ');
    const lock = ok ? '' : `<span class="lock">🔒 ${LOCKED_BY[u.id].icon} ${LOCKED_BY[u.id].name}: ${LOCKED_BY[u.id].desc}</span>`;
    return `<div class="cx ${ok ? '' : 'locked'}"><b>${u.icon} ${u.name}</b><span>${u.desc(1)}</span>${syn ? `<span class="syn">🔗 ${syn}</span>` : ''}${lock}</div>`;
  }).join('')}</div></div>`).join('');
}

function renderAch() {
  const st = loadAch();
  $('achs').innerHTML = ACHIEVEMENTS.map((a) => {
    const done = st.done.includes(a.id);
    const ul = a.unlock?.map((id) => `${byId(id)!.icon} ${byId(id)!.name}`).join(', ');
    return `<div class="ach ${done ? 'done' : ''}"><i>${done ? a.icon : '🔒'}</i><div><b>${a.name}</b>${a.desc}${ul ? `<div class="ul">Открывает: ${ul}</div>` : ''}</div></div>`;
  }).join('');
}

function renderBones() {
  const b = loadMeta().bones;
  $('bones').textContent = `🦴 ${b}`;
  $('bones-small').textContent = String(b);
  $('ach-small').textContent = `${loadAch().done.length}/${ACHIEVEMENTS.length}`;
}

/** Мастерская: постоянные улучшения за кости. */
function renderShop() {
  const m = loadMeta();
  const wrap = $('shop');
  wrap.innerHTML = '';
  for (const d of META) {
    const l = m.lv[d.id] ?? 0, maxed = l >= d.max, cost = d.cost[l];
    const c = document.createElement('div');
    c.className = 'shopcard';
    c.innerHTML = `<div class="top"><i>${d.icon}</i>${d.name}</div>
      <div class="pips">${Array.from({ length: d.max }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('')}</div>
      <div class="d">${maxed ? d.desc(l) : `Сейчас: ${l ? d.desc(l) : '—'}<br>Дальше: ${d.desc(l + 1)}`}</div>`;
    const b = document.createElement('button');
    b.textContent = maxed ? 'Максимум' : `Купить · ${cost} 🦴`;
    b.disabled = maxed || m.bones < cost;
    b.onclick = () => { if (buyMeta(d.id)) { sfx.unlock(); sfx.play('chest'); renderShop(); renderBones(); } };
    c.appendChild(b);
    wrap.appendChild(c);
  }
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
  game.events.on('coop-start', (p: Pick) => startCoopHost(p));
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
  showPanel(lobby === 'idle' ? 'main' : 'coop');
  renderBones();
  $('start').classList.remove('hidden');
}

function startSolo(p: Pick) { trackRun('solo'); runScene('game', { ...p }); }

function startCoopHost(p: Pick) {
  const net = session.net;
  if (!net?.connected) { showMenu(true); return; }
  const seed = (Math.random() * 1e9) | 0;
  const time = Number(new URLSearchParams(location.search).get('time')) || undefined;
  net.send({ t: 'start', ...p, seed, time });
  trackRun('coop');
  runScene('game', { ...p, seed, coop: true });
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
    if (m.t === 'start' && net.role === 'client') { runScene('client', { stage: m.stage, seed: m.seed, time: m.time, mode: m.mode, chapter: m.chapter }); return; }
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
      setLobby('host-ready', roomHtml(net.code, '✅ Напарник подключился! Выберите, во что играть:'));
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
      setLobby('joined', `✅ Подключено к комнате <b>${code}</b>. Хост выбирает, во что играть…`);
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
const syncMute = () => {
  muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
  $('set-sound').textContent = sfx.muted ? '🔇 Звук выкл' : '🔊 Звук';
  $('set-sound').classList.toggle('on', !sfx.muted);
};
syncMute();
const toggleMute = () => {
  sfx.unlock(); sfx.setMuted(!sfx.muted); syncMute();
  if (!sfx.muted) setTimeout(() => sfx.play('chest'), 60); // проверочный звук
};
muteBtn.addEventListener('click', toggleMute);
$('set-sound').addEventListener('click', toggleMute);

// Гироскоп


// Настройки: мрачный стиль и режим для левши
const syncSet = () => {
  $('set-gloomy').classList.toggle('on', settings.gloomy);
  $('set-lefty').classList.toggle('on', settings.lefty);
  document.body.classList.toggle('lefty', settings.lefty);
};
syncSet();
$('set-gloomy').addEventListener('click', () => { settings.gloomy = !settings.gloomy; saveSettings(); syncSet(); });
$('set-lefty').addEventListener('click', () => { settings.lefty = !settings.lefty; saveSettings(); syncSet(); });

// Навигация меню
document.querySelectorAll<HTMLButtonElement>('.mode, .sub').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); showPanel(b.dataset.go as Panel); }));
document.querySelectorAll<HTMLButtonElement>('.back').forEach((b) => b.addEventListener('click', () => showPanel('main')));
// iOS считает жестом только click/touchend/keydown (не pointerdown) — будим звук на них
for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, () => sfx.unlock(), { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sfx.unlock(); });

// ---------- Режим разработчика: 5 нажатий на заголовок → код ----------
const DEV_CODE = 'ZOMBIDEV';
let titleTaps = 0, titleAt = 0;
function renderDevInfo() {
  const el = $('dev-info');
  el.classList.toggle('hidden', !isDev());
  if (!isDev()) return;
  el.textContent = '🛠 Режим разработчика';
  void fetchStats().then((st) => {
    if (st.users !== null && st.users !== undefined) el.textContent += ` · игроков: ${st.users}, забегов: ${st.runs ?? '?'}`;
  });
}
$('title').addEventListener('click', () => {
  const now = performance.now();
  titleTaps = now - titleAt < 1500 ? titleTaps + 1 : 1;
  titleAt = now;
  if (titleTaps < 5) return;
  titleTaps = 0;
  if (isDev()) {
    if (confirm('Выключить режим разработчика?')) localStorage.removeItem('ss_dev');
  } else {
    const code = prompt('Код разработчика:');
    if (code === null) return;
    if (code.trim().toUpperCase() === DEV_CODE) localStorage.setItem('ss_dev', '1');
    else { alert('Неверный код'); return; }
  }
  renderDevInfo(); renderStages();
});

// Версия и проверка обновлений (страница могла остаться в кэше)
$('version').textContent = `v${VERSION} · ${BUILD.split('+')[1]} · ${BUILD_DATE}`;
$('pause-version').textContent = `v${VERSION} (${BUILD.split('+')[1]})`;
const pollUpdate = async () => {
  const v = await checkUpdate();
  if (!v) return;
  const el = $('update');
  el.textContent = `🔄 Вышла версия ${v} — нажмите, чтобы обновить`;
  el.classList.remove('hidden');
  el.onclick = () => location.reload();
};
void pollUpdate();
setInterval(() => { if (!$('start').classList.contains('hidden')) void pollUpdate(); }, 120000);

trackVisit();
renderDevInfo();
renderBones();
setLobby('idle');
// Блокируем жесты Safari (зум щипком, двойной тап)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
