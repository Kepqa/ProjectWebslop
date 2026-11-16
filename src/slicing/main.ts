import './slicing.css';
import { play as snd, unlockAudio } from './audio';
import { BUILD, BUILD_DATE, VERSION, checkUpdate } from '../version';

/**
 * Slicing Through — игра на тайминг. Ниндзя стоит в центре, враги подходят и замахиваются: вокруг врага сжимается
 * кольцо. Свайп в сторону врага — мгновенный удар туда и обратно. Попал в окно перед его ударом — убил;
 * рано — тебя парировали (оглушение, комбо сгорает); поздно — получил удар; взмах в пустоту — тоже оглушение.
 * Мир в своих единицах: ширина арены AW, высота AH подстраивается под экран (портрет — основной).
 */
const $ = (id: string) => document.getElementById(id)!;
const cv = $('cv') as HTMLCanvasElement;
const g = cv.getContext('2d')!;

// ---------- настройки ----------
const AW = 360;
const HERO_R = 12;
const STRIKE_D = 62;        // на каком расстоянии от ниндзя враг останавливается и замахивается
const WINDOW = 0.25;        // окно «хорошо» — последние секунды замаха
const PERFECT = 0.1;        // окно «идеально»
const FLICK_PX = 22;        // px: на столько провести пальцем — и удар срабатывает сразу, не дожидаясь отпускания
const CONE = 0.8;           // рад: насколько свайп может промахнуться по направлению к цели
const STAGGER = 0.4;        // с оглушения после парирования или взмаха в пустоту
const IFRAMES = 1.0;
const MAX_HP = 3;
const HEAL_EVERY = 20;      // +1 жизнь за каждые 20 комбо

type Kind = 'basic' | 'fast' | 'feint' | 'heavy' | 'archer';
type Phase = 'spawn' | 'walk' | 'wind' | 'recover' | 'leave';
interface Foe {
  kind: Kind; x: number; y: number; a: number; r: number; phase: Phase; t: number; w: number;
  fake: boolean; hp: number; shots: number; dead: boolean; flash: number;
}
interface Arrow { x: number; y: number; a: number; from: Foe }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Pop { x: number; y: number; text: string; color: string; life: number }

/** Скорость подхода, длина замаха (с), радиус, с какой секунды забега появляется, вес в выборе. */
const KINDS: Record<Kind, { speed: number; wind: number; r: number; from: number; weight: number }> = {
  basic: { speed: 75, wind: 1.0, r: 13, from: 0, weight: 4 },
  fast: { speed: 135, wind: 0.55, r: 11, from: 15, weight: 3 },
  archer: { speed: 60, wind: 1.1, r: 12, from: 25, weight: 2 },
  feint: { speed: 65, wind: 0.9, r: 13, from: 35, weight: 2 },
  heavy: { speed: 45, wind: 1.1, r: 17, from: 50, weight: 2 },
};

// ---------- состояние ----------
let AH = 640, scale = 1, ox = 0, oy = 0, dpr = 1, safeTop = 0;
let cx = AW / 2, cy = 360;  // ниндзя
const hero = { hp: MAX_HP, inv: 0, stagger: 0, slashA: 0, slashT: 0, slashD: 0, face: -Math.PI / 2 };
let foes: Foe[] = [], arrows: Arrow[] = [], parts: Part[] = [], pops: Pop[] = [];
let time = 0, spawnCd = 0, stage = 1;
let score = 0, combo = 0, bestCombo = 0, kills = 0, perfects = 0;
let slowT = 0, hitstop = 0, shake = 0;
let touch: { id: number; sx: number; sy: number; done: boolean } | null = null;
let state: 'menu' | 'play' | 'paused' | 'over' = 'menu';
let banner = { text: '', sub: '', t: 0 };
let hint = '';
const seen = new Set<Kind>();

const BEST_KEY = 'slicing_best_timing';
function loadBest(): { score: number; time: number } {
  try { const b = JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); if (b) return { score: +b.score || 0, time: +b.time || 0 }; } catch { /* ignore */ }
  return { score: 0, time: 0 };
}
function buzz(p: number | number[]) { try { navigator.vibrate?.(p); } catch { /* ignore */ } }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- экран ----------
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  const vw = innerWidth, vh = innerHeight;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  cv.style.width = `${vw}px`; cv.style.height = `${vh}px`;
  scale = Math.min(vw / AW, vh / 560);
  AH = Math.min(vh / scale, 820);
  ox = (vw - AW * scale) / 2; oy = (vh - AH * scale) / 2;
  safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  cx = AW / 2; cy = AH * 0.55;
}
addEventListener('resize', resize);
resize();

// ---------- забег ----------
function newRun() {
  Object.assign(hero, { hp: MAX_HP, inv: 0, stagger: 0, slashT: 0 });
  foes = []; arrows = []; parts = []; pops = [];
  time = 0; spawnCd = 0.6; stage = 1;
  score = 0; combo = 0; bestCombo = 0; kills = 0; perfects = 0;
  slowT = 0; hitstop = 0; shake = 0; touch = null;
  seen.clear();
  hint = 'Свайп к врагу, когда кольцо пожелтеет';
}

/** Сколько врагов держать на поле и насколько быстрее их замах — растут со временем. */
const wanted = () => Math.min(6, 1 + Math.floor((time + 10) / 18));
const windK = () => Math.max(0.65, 1 - time / 360);

function spawn() {
  const pool = (Object.keys(KINDS) as Kind[]).filter((k) => time >= KINDS[k].from);
  let roll = Math.random() * pool.reduce((s, k) => s + KINDS[k].weight, 0), kind: Kind = 'basic';
  for (const k of pool) { roll -= KINDS[k].weight; if (roll <= 0) { kind = k; break; } }
  // направление подальше от уже занятых, чтобы свайп однозначно выбирал цель
  let a = 0, best = -1;
  for (let i = 0; i < 16; i++) {
    const c = Math.random() * Math.PI * 2;
    const gap = Math.min(Math.PI, ...foes.filter((f) => !f.dead).map((f) => angDiff(c, f.a)));
    if (gap > best) { best = gap; a = c; }
  }
  const d = Math.hypot(AW, AH) / 2 + 20;
  const x = clamp(cx + Math.cos(a) * d, 16, AW - 16), y = clamp(cy + Math.sin(a) * d, 16, AH - 16);
  const k = KINDS[kind];
  foes.push({ kind, x, y, a: Math.atan2(y - cy, x - cx), r: k.r, phase: 'spawn', t: 0.45, w: k.wind * windK(),
    fake: kind === 'feint', hp: kind === 'heavy' ? 2 : 1, shots: 0, dead: false, flash: 0 });
  if (!seen.has(kind)) {
    seen.add(kind);
    const intro: Partial<Record<Kind, [string, string]>> = {
      fast: ['Быстрый', 'Короткий замах — реагируй сразу'],
      archer: ['Лучник', 'Режь стрелу у самого лица. Идеально — и она летит обратно'],
      feint: ['Ронин', 'Пунктирное кольцо — обманный замах. Жди второго'],
      heavy: ['Латник', 'Два удара: после первого он сразу замахивается снова'],
    };
    const t = intro[kind];
    if (t) showBanner(t[0], t[1]);
  }
}

function showBanner(text: string, sub: string) { banner = { text, sub, t: sub ? 2.4 : 1.2 }; }
function pop(x: number, y: number, text: string, color: string) { pops.push({ x, y, text, color, life: 0.7 }); }

// ---------- ввод ----------
cv.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== 'play' || touch) return;
  touch = { id: e.pointerId, sx: e.clientX, sy: e.clientY, done: false };
  try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
cv.addEventListener('pointermove', (e) => {
  if (!touch || e.pointerId !== touch.id || touch.done || state !== 'play') return;
  const dx = e.clientX - touch.sx, dy = e.clientY - touch.sy;
  if (Math.hypot(dx, dy) >= FLICK_PX) { touch.done = true; slash(Math.atan2(dy, dx)); }
});
const release = (e: PointerEvent) => { if (touch && e.pointerId === touch.id) touch = null; };
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);

// ---------- удар ----------
/** Окно замаха: сколько секунд осталось до удара врага; null — бить сейчас рано (или обманный замах). */
function windowLeft(f: Foe) {
  if (f.phase !== 'wind' || f.fake) return null;
  const left = f.w - f.t;
  return left <= WINDOW ? left : null;
}

function slash(a: number) {
  if (hero.stagger > 0) return;
  hero.face = a;
  // цели: стрелы рядом и враги на позиции удара, в конусе свайпа; ближайшая по углу
  type T = { kind: 'foe'; f: Foe; d: number } | { kind: 'arrow'; ar: Arrow; d: number };
  const cands: T[] = [];
  for (const f of foes) if (!f.dead && (f.phase === 'wind' || f.phase === 'recover' || f.phase === 'walk') && Math.hypot(f.x - cx, f.y - cy) < STRIKE_D + 50)
    cands.push({ kind: 'foe', f, d: angDiff(a, Math.atan2(f.y - cy, f.x - cx)) });
  for (const ar of arrows) if (Math.hypot(ar.x - cx, ar.y - cy) < 150) cands.push({ kind: 'arrow', ar, d: angDiff(a, Math.atan2(ar.y - cy, ar.x - cx)) });
  const tgt = cands.filter((c) => c.d < CONE).sort((p, q) => p.d - q.d)[0];
  hero.slashA = a; hero.slashT = 0.12;
  if (!tgt) { hero.slashD = 70; whiff('мимо'); return; }

  if (tgt.kind === 'arrow') {
    const ar = tgt.ar, d = Math.hypot(ar.x - cx, ar.y - cy);
    hero.slashD = d;
    if (d > 95) { whiff('рано'); return; }
    arrows.splice(arrows.indexOf(ar), 1);
    if (d < 50) {
      // идеальный срез: стрела летит обратно в лучника
      const f = ar.from;
      if (!f.dead) { kill(f, true); pop(f.x, f.y, 'ОТРАЖЕНО', '#ffd58a'); }
      success(ar.x, ar.y, true);
    } else success(ar.x, ar.y, false);
    burst(ar.x, ar.y, '#f2e3b3', 8, 160);
    return;
  }

  const f = tgt.f;
  hero.slashD = Math.hypot(f.x - cx, f.y - cy);
  const left = windowLeft(f);
  if (left === null) { parried(f); return; }
  const perfect = left <= PERFECT;
  if (f.hp > 1) {
    // латник: первый удар сбивает, и он тут же замахивается коротко
    f.hp--; f.t = 0; f.w = 0.5 * windK(); f.flash = 0.15;
    snd('bounce', 0.9); burst(f.x, f.y, '#d6dce8', 10, 180);
    success(f.x, f.y, perfect);
    return;
  }
  kill(f, perfect);
  success(f.x, f.y, perfect);
}

function success(x: number, y: number, perfect: boolean) {
  combo++; bestCombo = Math.max(bestCombo, combo);
  score += Math.round((perfect ? 200 : 100) * (1 + Math.min(combo, 50) / 10));
  if (perfect) {
    perfects++; slowT = 0.14; hitstop = Math.max(hitstop, 0.05); shake = Math.min(1, shake + 0.25);
    pop(x, y - 18, 'ИДЕАЛЬНО', '#ffd58a'); snd('multi', 0.6, 1.1); buzz(14);
  } else {
    hitstop = Math.max(hitstop, 0.03); shake = Math.min(1, shake + 0.12);
    pop(x, y - 18, 'хорошо', '#c9d2ea'); buzz(8);
  }
  if (combo % HEAL_EVERY === 0 && hero.hp < MAX_HP) { hero.hp++; showBanner(`Комбо ${combo}`, '+1 жизнь'); }
  hint = '';
}

function kill(f: Foe, perfect: boolean) {
  f.dead = true; kills++;
  burst(f.x, f.y, '#c8243a', perfect ? 22 : 14, perfect ? 280 : 200);
  burst(f.x, f.y, '#151018', 8, 140);
  snd('cut', 0.85, 1 + Math.min(combo, 16) * 0.035);
}

/** Рано: враг отбил удар. Ниндзя оглушён, комбо сгорает. */
function parried(f: Foe) {
  hero.stagger = STAGGER; combo = 0;
  f.flash = 0.2;
  pop(f.x, f.y - 18, 'рано', '#ff8a7a');
  snd('parry', 0.9); shake = Math.min(1, shake + 0.2); buzz(20);
  if (hint) hint = 'Рано! Жди жёлтого кольца';
}

function whiff(text: string) {
  hero.stagger = STAGGER; combo = 0;
  pop(cx + Math.cos(hero.slashA) * 60, cy + Math.sin(hero.slashA) * 60, text, '#8a90a8');
  snd('dash', 0.4, 0.8);
}

function hurt(from: { x: number; y: number }) {
  if (hero.inv > 0) return;
  hero.hp--; hero.inv = IFRAMES; combo = 0;
  shake = Math.min(1, shake + 0.7); hitstop = Math.max(hitstop, 0.08);
  burst(cx, cy, '#e8453c', 14, 200);
  pop(from.x, from.y - 18, 'поздно', '#ff6a5a');
  snd('hurt', 1); buzz([30, 30, 20]);
  if (hero.hp <= 0) gameOver();
}

// ---------- обновление мира ----------
function update(dt: number) {
  time += dt;
  if (hero.inv > 0) hero.inv -= dt;
  if (hero.stagger > 0) hero.stagger -= dt;
  if (hero.slashT > 0) hero.slashT -= dt;
  if (Math.floor(time / 30) + 1 > stage) { stage++; showBanner(`Этап ${stage}`, 'Быстрее и больше врагов'); snd('gong', 0.6); }

  const alive = foes.filter((f) => !f.dead && f.phase !== 'leave').length;
  spawnCd -= dt;
  if (alive < wanted() && spawnCd <= 0) { spawn(); spawnCd = Math.max(0.35, 1.1 - time / 200); }

  for (const f of foes) {
    if (f.dead) continue;
    if (f.flash > 0) f.flash -= dt;
    const dx = cx - f.x, dy = cy - f.y, d = Math.hypot(dx, dy) || 1;
    const k = KINDS[f.kind];
    const stopAt = f.kind === 'archer' ? 190 : STRIKE_D;
    if (f.phase === 'spawn') { if ((f.t -= dt) <= 0) f.phase = 'walk'; continue; }
    if (f.phase === 'walk') {
      const step = k.speed * dt;
      if (d - step <= stopAt) { f.x = cx - (dx / d) * stopAt; f.y = cy - (dy / d) * stopAt; f.phase = 'wind'; f.t = 0; }
      else { f.x += (dx / d) * step; f.y += (dy / d) * step; }
      continue;
    }
    if (f.phase === 'leave') {
      f.x -= (dx / d) * 90 * dt; f.y -= (dy / d) * 90 * dt;
      if (f.x < -30 || f.x > AW + 30 || f.y < -30 || f.y > AH + 30) f.dead = true;
      continue;
    }
    if (f.phase === 'recover') { if ((f.t -= dt) <= 0) { f.phase = 'wind'; f.t = 0; f.w = k.wind * windK(); } continue; }
    // замах
    f.t += dt;
    if (f.fake && f.t >= f.w * 0.75) {
      // обманный замах обрывается — следующий настоящий
      f.fake = false; f.t = 0; f.w = k.wind * windK();
      continue;
    }
    if (f.t >= f.w) {
      if (f.kind === 'archer') {
        arrows.push({ x: f.x, y: f.y, a: Math.atan2(dy, dx), from: f });
        snd('bow', 0.6);
        f.shots++;
        f.phase = f.shots >= 3 ? 'leave' : 'recover'; f.t = 0.9;
      } else {
        hurt(f);
        if (state !== 'play') return;
        f.phase = 'recover'; f.t = 0.7; f.fake = f.kind === 'feint';
      }
    }
  }
  foes = foes.filter((f) => !f.dead);

  for (let i = arrows.length - 1; i >= 0; i--) {
    const ar = arrows[i];
    ar.x += Math.cos(ar.a) * 230 * dt; ar.y += Math.sin(ar.a) * 230 * dt;
    if (Math.hypot(ar.x - cx, ar.y - cy) < HERO_R) {
      arrows.splice(i, 1); hurt(ar);
      if (state !== 'play') return;
    }
  }

  for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
  parts = parts.filter((p) => p.life > 0);
  for (const p of pops) { p.life -= dt; p.y -= 30 * dt; }
  pops = pops.filter((p) => p.life > 0);
  if (banner.t > 0) banner.t -= dt;
}

function burst(x: number, y: number, color: string, n: number, sp: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7), life = 0.3 + Math.random() * 0.35;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 2 + Math.random() * 3 });
  }
}

// ---------- отрисовка ----------
function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#06070d'; g.fillRect(0, 0, cv.width, cv.height);
  const s = shake * shake * 7;
  g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + (Math.random() - 0.5) * s * scale), dpr * (oy + (Math.random() - 0.5) * s * scale));

  // пол: тёмные доски додзё и круг ниндзя
  g.fillStyle = '#15151f'; g.fillRect(0, 0, AW, AH);
  g.strokeStyle = '#1d1d2a'; g.lineWidth = 1;
  for (let x = 45; x < AW; x += 45) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, AH); g.stroke(); }
  g.strokeStyle = '#26263a'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, STRIKE_D, 0, Math.PI * 2); g.stroke();

  // появление
  for (const f of foes) if (f.phase === 'spawn') {
    g.strokeStyle = `rgba(232,69,60,${0.6 - f.t})`; g.lineWidth = 2;
    g.beginPath(); g.arc(f.x, f.y, f.r + f.t * 40, 0, Math.PI * 2); g.stroke();
  }
  for (const f of foes) if (f.phase !== 'spawn') drawFoe(f);

  // стрелы: в зоне среза подсвечены
  for (const ar of arrows) {
    const d = Math.hypot(ar.x - cx, ar.y - cy);
    g.strokeStyle = d < 50 ? '#ffd23a' : d < 95 ? '#fff4c8' : '#c9b98a'; g.lineWidth = d < 95 ? 3 : 2;
    g.beginPath(); g.moveTo(ar.x, ar.y); g.lineTo(ar.x - Math.cos(ar.a) * 16, ar.y - Math.sin(ar.a) * 16); g.stroke();
  }

  drawHero();

  for (const p of parts) {
    g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.color;
    g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  g.globalAlpha = 1;

  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of pops) {
    g.globalAlpha = Math.min(1, p.life * 2.5); g.fillStyle = p.color;
    g.font = p.text === 'ИДЕАЛЬНО' || p.text === 'ОТРАЖЕНО' ? '800 15px Unbounded, sans-serif' : '700 14px Onest, sans-serif';
    g.fillText(p.text, p.x, p.y);
  }
  g.globalAlpha = 1; g.textBaseline = 'alphabetic';

  if (state !== 'menu') drawHud();
}

function drawFoe(f: Foe) {
  const body = { basic: '#8a5a3c', fast: '#33476e', feint: '#5e3a6e', heavy: '#5d6475', archer: '#4f6e48' }[f.kind];
  const face = Math.atan2(cy - f.y, cx - f.x), c = Math.cos(face), sn = Math.sin(face);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(f.x, f.y + f.r * 0.7, f.r, f.r * 0.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = f.flash > 0 ? '#ffffff' : body; g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
  g.fillStyle = f.kind === 'heavy' ? '#9aa3b5' : f.kind === 'archer' ? '#7d8f5a' : '#c9a35e';
  g.beginPath(); g.arc(f.x, f.y, f.r * 0.6, 0, Math.PI * 2); g.fill();
  if (f.kind === 'heavy') {
    for (let i = 0; i < f.hp; i++) { g.fillStyle = '#e8eef8'; g.fillRect(f.x - 7 + i * 9, f.y - f.r - 9, 6, 4); }
  }
  // оружие поднимается во время замаха
  const lift = f.phase === 'wind' ? Math.min(1, f.t / f.w) : 0;
  g.strokeStyle = f.kind === 'archer' ? '#d9c08a' : '#d4d0c6'; g.lineWidth = 2.5;
  if (f.kind === 'archer') {
    g.beginPath(); g.arc(f.x + c * 4, f.y + sn * 4, f.r + 2, face - 0.9, face + 0.9); g.stroke();
  } else {
    const wa = face + (Math.PI / 2) * (1 - lift) - 0.2, len = f.kind === 'fast' ? 14 : 22;
    g.beginPath(); g.moveTo(f.x + c * 6, f.y + sn * 6); g.lineTo(f.x + c * 6 + Math.cos(wa) * len, f.y + sn * 6 + Math.sin(wa) * len); g.stroke();
  }
  // кольцо замаха: сжимается к телу; в окне — жёлтое, в «идеально» — белое; обманный замах — пунктир
  if (f.phase === 'wind') {
    const left = f.w - f.t, k = left / f.w;
    const inWin = left <= WINDOW && (f.fake ? left > f.w * 0.25 : true);
    g.strokeStyle = !inWin ? 'rgba(232,69,60,0.85)' : left <= PERFECT && !f.fake ? '#ffffff' : '#ffd23a';
    g.lineWidth = inWin ? 3.5 : 2;
    if (f.fake) g.setLineDash([5, 5]);
    g.beginPath(); g.arc(f.x, f.y, f.r + 4 + 34 * k, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.arc(f.x, f.y, f.r + 4, 0, Math.PI * 2); g.stroke();
  }
}

function drawHero() {
  if (hero.inv > 0 && Math.floor(hero.inv * 14) % 2 === 0) return; // мигает только после урона
  // удар: ниндзя на миг уходит к цели и возвращается, за ним белый след
  const k = hero.slashT > 0 ? Math.sin((1 - hero.slashT / 0.12) * Math.PI) : 0;
  const reach = Math.max(0, hero.slashD - 14) * k;
  const x = cx + Math.cos(hero.slashA) * reach, y = cy + Math.sin(hero.slashA) * reach;
  if (hero.slashT > 0) {
    g.strokeStyle = `rgba(240,244,255,${hero.slashT / 0.12})`; g.lineWidth = 6; g.lineCap = 'round';
    const ex = cx + Math.cos(hero.slashA) * (hero.slashD + 10), ey = cy + Math.sin(hero.slashA) * (hero.slashD + 10);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
  }
  const dx = Math.cos(hero.face), dy = Math.sin(hero.face);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x, y + 9, 12, 4, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8453c'; g.lineWidth = 3; g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const w = Math.sin(time * 10 + side) * 4;
    g.beginPath(); g.moveTo(x - dx * 8, y - dy * 8);
    g.quadraticCurveTo(x - dx * 16 - dy * (side * 5 + w), y - dy * 16 + dx * (side * 5 + w), x - dx * 24 - dy * side * 7, y - dy * 24 + dx * side * 7);
    g.stroke();
  }
  g.fillStyle = hero.stagger > 0 ? '#2a2236' : '#0c0c12'; g.beginPath(); g.arc(x, y, HERO_R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8453c'; g.lineWidth = 3;
  g.beginPath(); g.arc(x, y, HERO_R - 3, hero.face - 1.3, hero.face + 1.3); g.stroke();
  g.strokeStyle = '#f4f1e8'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x + dx * 6 - dy * 4, y + dy * 6 + dx * 4); g.lineTo(x + dx * 6 + dy * 4, y + dy * 6 - dx * 4); g.stroke();
  if (hero.stagger > 0) {
    g.fillStyle = '#ffe28a'; g.font = '700 12px Onest, sans-serif'; g.textAlign = 'center';
    g.fillText('✦', x + Math.cos(time * 9) * 12, y - HERO_R - 6);
  }
}

function drawHud() {
  const top = Math.max(10, safeTop / scale + 6);
  g.textBaseline = 'top';
  g.font = '700 18px Onest, sans-serif'; g.textAlign = 'left';
  for (let i = 0; i < MAX_HP; i++) { g.fillStyle = i < hero.hp ? '#e8453c' : '#3a3442'; g.fillText('♥', 12 + i * 20, top); }
  g.fillStyle = '#b9bfd3'; g.textAlign = 'center'; g.font = '600 13px "JetBrains Mono", monospace';
  g.fillText(`${fmtTime(time)} · ЭТАП ${stage}`, AW / 2, top + 3);
  g.textAlign = 'right'; g.fillStyle = '#eef0f7'; g.font = '700 18px "JetBrains Mono", monospace';
  g.fillText(String(score), AW - 64, top);
  if (combo >= 2) {
    g.textAlign = 'center'; g.fillStyle = '#ffd58a'; g.font = `800 ${16 + Math.min(combo, 20)}px Unbounded, sans-serif`;
    g.fillText(`×${combo}`, AW / 2, top + 22);
  }
  if (banner.t > 0) {
    g.globalAlpha = Math.min(1, banner.t * 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#eef0f7'; g.font = '800 26px Unbounded, sans-serif'; g.fillText(banner.text, AW / 2, AH * 0.2);
    if (banner.sub) { g.fillStyle = '#b9bfd3'; g.font = '500 14px Onest, sans-serif'; g.fillText(banner.sub, AW / 2, AH * 0.2 + 28); }
    g.globalAlpha = 1;
  }
  if (hint) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.6 + Math.sin(time * 4) * 0.25;
    g.fillStyle = '#eef0f7'; g.font = '600 14px Onest, sans-serif'; g.fillText(hint, AW / 2, AH - 50);
    g.globalAlpha = 1;
  }
  g.textBaseline = 'alphabetic';
}

// ---------- экраны ----------
function show(id: string | null) {
  for (const o of ['menu', 'paused', 'over']) $(o).classList.toggle('hidden', o !== id);
  $('pause').classList.toggle('hidden', state !== 'play');
}
function renderRecord() {
  const b = loadBest();
  $('record').textContent = b.score ? `Рекорд: ${b.score} очков · ${fmtTime(b.time)}` : '';
}
function play() { unlockAudio(); newRun(); state = 'play'; show(null); }
function pause() { if (state !== 'play') return; state = 'paused'; touch = null; show('paused'); }
function gameOver() {
  state = 'over'; touch = null;
  const b = loadBest(), rec = score > b.score;
  try { localStorage.setItem(BEST_KEY, JSON.stringify({ score: Math.max(score, b.score), time: Math.max(time, b.time) })); } catch { /* ignore */ }
  $('over-sub').textContent = `${fmtTime(time)} · ${kills} врагов · идеально ${perfects} · лучшее комбо ×${bestCombo}`;
  $('over-rec').textContent = rec ? `Новый рекорд: ${score}!` : `${score} очков · рекорд ${b.score}`;
  snd('gong', 0.9, 0.7);
  show('over');
}

$('go').onclick = play;
$('again').onclick = play;
$('resume').onclick = () => { state = 'play'; show(null); };
$('to-menu').onclick = $('over-menu').onclick = () => { state = 'menu'; renderRecord(); show('menu'); };
$('pause').onclick = pause;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') { if (state === 'play') pause(); else if (state === 'paused') { state = 'play'; show(null); } }
  if (e.key === 'Enter' && (state === 'menu' || state === 'over')) play();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

renderRecord();
show('menu');

// версия сборки и проверка, не вышла ли новая (страница могла открыться из кэша)
$('ver').textContent = `v${VERSION} · ${BUILD.split('+')[1]} · ${BUILD_DATE}`;
$('pause-ver').textContent = `v${VERSION}`;
const pollUpdate = async () => {
  const v = await checkUpdate();
  if (!v) return;
  const el = $('update');
  el.textContent = `🔄 Вышла версия ${v} — нажми, чтобы обновить`;
  el.classList.remove('hidden');
  el.onclick = () => location.reload();
};
void pollUpdate();
setInterval(() => { if (state === 'menu' || state === 'over') void pollUpdate(); }, 120000);

let last = performance.now();
function frame(now: number) {
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') {
    if (slowT > 0) slowT -= rdt;
    if (hitstop > 0) hitstop -= rdt;
    else update(rdt * (slowT > 0 ? 0.3 : 1));
    shake = Math.max(0, shake - rdt * 1.8);
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
