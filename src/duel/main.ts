import './duel.css';
import { sfx } from '../sfx';
import { Bot, LEVELS } from './ai';
import { type Cmd, Game, HEROES, type Hero, NOCMD } from './game';
import { P1, P2, SOLO, clearInput, endFrame, initInput, label, readCmd, touchUsed } from './input';
import { Renderer } from './render';

const $ = (id: string) => document.getElementById(id)!;

type Mode = 'bot' | 'pvp';
interface Prefs { mode: Mode; p1: number; p2: number; lv: number }
const PREFS_KEY = 'duel_prefs';
const REC_KEY = 'duel_wins';

function loadPrefs(): Prefs {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (p) return { mode: p.mode === 'pvp' ? 'pvp' : 'bot', p1: +p.p1 || 0, p2: Number.isFinite(+p.p2) ? +p.p2 : -1, lv: +p.lv || 1 }; } catch { /* ignore */ }
  return { mode: 'bot', p1: 0, p2: -1, lv: 1 };
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } }
function loadWins(): number[] { try { const w = JSON.parse(localStorage.getItem(REC_KEY) || '[]'); return [0, 1, 2].map((i) => +w[i] || 0); } catch { return [0, 0, 0]; } }

const prefs = loadPrefs();
const renderer = new Renderer($('cv') as HTMLCanvasElement);
let game: Game | null = null;
let bot: Bot | null = null;
let paused = false;
let p2Hero: Hero = HEROES[0];

// ---------- меню ----------
function heroCards(wrapId: string, sel: number, allowRandom: boolean, onPick: (i: number) => void) {
  const wrap = $(wrapId);
  wrap.innerHTML = '';
  const list: { i: number; html: string; color: string }[] = HEROES.map((h, i) => ({
    i, color: h.accent,
    html: `<b>${h.name}</b><small>${h.title}</small><span class="sp">${h.spells.map((s) => `<i title="${s.name}: ${s.desc}">${s.icon}</i>`).join('')}</span><span class="st">❤ ${h.hp} · 👟 ${Math.round(h.speed / 10)} · ⚔ ${Math.round(h.power * 100)}%</span>`,
  }));
  if (allowRandom) list.push({ i: -1, color: '#ccc', html: '<b>🎲 Случайный</b><small>Пусть решит судьба</small>' });
  for (const it of list) {
    const b = document.createElement('button');
    b.className = `hero ${it.i === sel ? 'on' : ''}`;
    b.style.setProperty('--c', it.color);
    b.innerHTML = it.html;
    b.onclick = () => { onPick(it.i); renderMenu(); };
    wrap.appendChild(b);
  }
}

function renderMenu() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]')) b.classList.toggle('on', b.dataset.mode === prefs.mode);
  const pvp = prefs.mode === 'pvp';
  $('p1-title').textContent = pvp ? 'Игрок 1 (слева)' : 'Твой боец';
  $('p2-title').textContent = pvp ? 'Игрок 2 (справа)' : 'Соперник';
  heroCards('p1', prefs.p1, false, (i) => { prefs.p1 = i; });
  heroCards('p2', prefs.p2, true, (i) => { prefs.p2 = i; });
  const lv = $('levels');
  lv.classList.toggle('hidden', pvp);
  lv.innerHTML = LEVELS.map((l, i) => `<button class="chip ${i === prefs.lv ? 'on' : ''}" data-lv="${i}">${['🙂', '😠', '💀'][i]} ${l.name}</button>`).join('');
  for (const b of lv.querySelectorAll<HTMLButtonElement>('[data-lv]')) b.onclick = () => { prefs.lv = +b.dataset.lv!; renderMenu(); };
  const w = loadWins();
  $('record').textContent = pvp ? '' : `Побед над ботом: ${LEVELS.map((l, i) => `${l.name} — ${w[i]}`).join(' · ')}`;
  $('help').innerHTML = helpHtml(pvp);
  savePrefs();
}

function keys(map: typeof SOLO, k: keyof typeof SOLO) { return map[k].map(label).join(' / '); }
function helpHtml(pvp: boolean) {
  const moves = `<ul class="moves">
    <li><b>Удар</b> — быстрый, до 3 подряд; третий отбрасывает.</li>
    <li><b>Сильный удар</b> — долгий замах, тратит выносливость, сносит блок. Пока замахиваешься — тебя можно прервать.</li>
    <li><b>Блок</b> — режет урон почти до нуля, но тратит выносливость. Кончилась — блок пробит и ты оглушён.</li>
    <li><b>Парирование</b> — поставь блок за мгновение до удара: враг оглушён, тебе мана. Снаряды так отражаются.</li>
    <li><b>Кувырок</b> — неуязвимость на долю секунды, можно прокатиться сквозь врага.</li>
    <li><b>Заклинания</b> — тратят ману (синяя полоса). Мана копится со временем и за попадания.</li>
  </ul>`;
  const row = (name: string, m: typeof SOLO) => `<tr><td>${name}</td><td>${keys(m, 'left')} ${keys(m, 'right')}</td><td>${keys(m, 'jump')}</td><td>${keys(m, 'light')}</td><td>${keys(m, 'heavy')}</td><td>${keys(m, 'block')}</td><td>${keys(m, 'dodge')}</td><td>${keys(m, 's1')} ${keys(m, 's2')} ${keys(m, 's3')}</td></tr>`;
  const head = '<tr><th></th><th>Ходьба</th><th>Прыжок</th><th>Удар</th><th>Сильный</th><th>Блок</th><th>Кувырок</th><th>Заклинания</th></tr>';
  const table = `<div class="tbl"><table>${head}${pvp ? row('Игрок 1', P1) + row('Игрок 2', P2) : row('Клавиатура', SOLO)}</table></div>`;
  const touch = pvp ? '<p class="note">Режим вдвоём — только с клавиатуры.</p>' : '<p class="note">На телефоне — кнопки на экране. Лучше держать горизонтально.</p>';
  return moves + table + touch;
}

$('modes').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
  if (b) { prefs.mode = b.dataset.mode as Mode; renderMenu(); }
});

// ---------- бой ----------
function start() {
  sfx.unlock();
  const h1 = HEROES[prefs.p1];
  p2Hero = prefs.p2 >= 0 ? HEROES[prefs.p2] : HEROES[Math.floor(Math.random() * HEROES.length)];
  game = new Game(h1, p2Hero);
  bot = prefs.mode === 'bot' ? new Bot(game.f[1], LEVELS[prefs.lv]) : null;
  game.onEvent = (e) => {
    if (e === 'hit' && touchUsed.v) navigator.vibrate?.(15);
    if (e === 'over') setTimeout(showOver, 900);
  };
  const m1 = prefs.mode === 'pvp' ? P1 : SOLO;
  renderer.keyHints = [
    touchUsed.v && prefs.mode === 'bot' ? [] : [m1.s1, m1.s2, m1.s3].map((k) => label(k[0])),
    prefs.mode === 'pvp' ? [P2.s1, P2.s2, P2.s3].map((k) => label(k[0])) : [],
  ];
  // сенсорные кнопки заклинаний
  document.querySelectorAll<HTMLElement>('#touch .sp').forEach((b, i) => {
    b.querySelector('span')!.textContent = h1.spells[i].icon;
    b.title = h1.spells[i].name;
  });
  $('menu').classList.add('hidden'); $('over').classList.add('hidden'); $('paused').classList.add('hidden');
  $('pause').classList.remove('hidden');
  updateTouchVisibility();
  paused = false; clearInput();
}

function updateTouchVisibility() {
  const show = !!game && prefs.mode === 'bot' && (touchUsed.v || matchMedia('(pointer: coarse)').matches);
  $('touch').classList.toggle('hidden', !show);
  $('rotate').classList.toggle('hidden', !show);
  renderer.hudTop = 0;
}

function showOver() {
  if (!game) return;
  const [a, b] = game.f;
  const p1won = a.wins > b.wins;
  const draw = a.wins === b.wins;
  if (prefs.mode === 'bot') {
    $('over-title').textContent = draw ? 'Ничья' : p1won ? 'Победа!' : 'Поражение';
    $('over-sub').textContent = draw ? 'Оба устояли.' : p1won ? `${LEVELS[prefs.lv].name} повержен. Счёт ${a.wins}:${b.wins}.` : `Соперник — ${p2Hero.name}. Счёт ${a.wins}:${b.wins}. Попробуй парировать.`;
    sfx.play(p1won ? 'win' : 'lose');
    if (p1won) { const w = loadWins(); w[prefs.lv]++; try { localStorage.setItem(REC_KEY, JSON.stringify(w)); } catch { /* ignore */ } }
  } else {
    $('over-title').textContent = draw ? 'Ничья' : `Победил игрок ${p1won ? 1 : 2}!`;
    $('over-sub').textContent = `${a.hero.name} ${a.wins} : ${b.wins} ${b.hero.name}`;
    sfx.play('win');
  }
  $('over').classList.remove('hidden');
  $('pause').classList.add('hidden');
}

function toMenu() {
  game = null; bot = null; paused = false;
  for (const id of ['over', 'paused', 'pause', 'touch', 'rotate']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden');
  renderMenu();
}

function togglePause() {
  if (!game || game.phase === 'over') return;
  paused = !paused;
  $('paused').classList.toggle('hidden', !paused);
  clearInput();
}

$('go').onclick = start;
$('again').onclick = start;
$('over-menu').onclick = toMenu;
$('to-menu').onclick = toMenu;
$('resume').onclick = togglePause;
$('pause').onclick = togglePause;
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !paused && game.phase !== 'over') togglePause(); });

initInput(() => { sfx.unlock(); if (game && $('touch').classList.contains('hidden')) updateTouchVisibility(); }, () => {
  if (!$('menu').classList.contains('hidden')) return;
  togglePause();
});

// ---------- цикл ----------
let last = performance.now();
let menuT = 0;
function frame(now: number) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  menuT += dt;
  if (game && !paused) {
    let c1: Cmd, c2: Cmd;
    if (prefs.mode === 'bot') { c1 = readCmd(SOLO, true); c2 = bot ? bot.think(game) : NOCMD; }
    else { c1 = readCmd(P1, false); c2 = readCmd(P2, false); }
    game.update(dt, [c1, c2]);
    updateTouchSpells();
  }
  endFrame();
  renderer.draw(game, menuT);
  requestAnimationFrame(frame);
}

function updateTouchSpells() {
  if (!game || $('touch').classList.contains('hidden')) return;
  const f = game.f[0];
  document.querySelectorAll<HTMLElement>('#touch .sp').forEach((b, i) => {
    const s = f.hero.spells[i];
    const cd = f.cds[i] / s.cd;
    b.style.setProperty('--cd', String(cd));
    b.classList.toggle('dim', f.mana < s.mana || cd > 0);
  });
}

renderMenu();
requestAnimationFrame(frame);

if (location.search.includes('debug')) Object.assign(window, { get game() { return game; }, start, prefs });
