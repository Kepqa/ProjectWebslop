import './slicing.css';
import { sfx } from '../sfx';

/**
 * Slicing Through — прототип. Один палец: тянешь и отпускаешь — ниндзя рвётся по линии и рубит всех на пути.
 * Пока палец на экране, время замедлено. Рывки — заряды; каждое убийство возвращает заряд.
 * Мир в своих единицах: ширина арены AW, высота AH подстраивается под экран (портрет — основной).
 */
const $ = (id: string) => document.getElementById(id)!;
const cv = $('cv') as HTMLCanvasElement;
const g = cv.getContext('2d')!;

// ---------- настройки ----------
const AW = 360;
const HERO_R = 11;
const DASH_SPEED = 1500;  // ед/с
const DASH_MAX = 250;     // самый длинный рывок
const DRAG_K = 2.2;       // рывок = длина протяжки пальца × DRAG_K
const MIN_DRAG = 12;      // px экрана: короче — не рывок
const MAX_CHARGES = 3;
const RECHARGE = 1.1;     // с на один заряд
const SLOW = 0.2;         // скорость времени, пока палец на экране
const IFRAMES = 1.2;
const MAX_HP = 3;

type Kind = 'grunt' | 'shield' | 'archer';
interface Foe { kind: Kind; x: number; y: number; r: number; face: number; stun: number; cd: number; aim: number; aimA: number; spawn: number; dead: boolean }
interface Arrow { x: number; y: number; vx: number; vy: number }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Mark { x: number; y: number; a: number; len: number }

// ---------- состояние ----------
let AH = 640, scale = 1, ox = 0, oy = 0, dpr = 1, safeTop = 0;
const hero = { x: AW / 2, y: 320, hp: MAX_HP, inv: 0, dashing: false, dx: 0, dy: -1, left: 0, kills: 0 };
let charges = MAX_CHARGES, rechargeT = 0;
let foes: Foe[] = [], arrows: Arrow[] = [], parts: Part[] = [], marks: Mark[] = [];
let trail: { x: number; y: number; t: number }[] = [];
let wave = 0, queue: Kind[] = [], spawnT = 0, breakT = 0;
let score = 0, combo = 0, bestCombo = 0, kills = 0, clock = 0;
let timeScale = 1, hitstop = 0, shake = 0;
let aiming: { id: number; sx: number; sy: number; cx: number; cy: number } | null = null;
let state: 'menu' | 'play' | 'paused' | 'over' = 'menu';
let banner = { text: '', sub: '', t: 0 };
let hint = '';
const seen = new Set<Kind>();

const BEST_KEY = 'slicing_best';
function loadBest(): { score: number; wave: number } {
  try { const b = JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); if (b) return { score: +b.score || 0, wave: +b.wave || 0 }; } catch { /* ignore */ }
  return { score: 0, wave: 0 };
}
function buzz(p: number | number[]) { try { navigator.vibrate?.(p); } catch { /* ignore */ } }

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
  hero.y = Math.min(hero.y, AH - HERO_R);
}
addEventListener('resize', resize);
resize();

// ---------- забег ----------
function newRun() {
  Object.assign(hero, { x: AW / 2, y: AH * 0.6, hp: MAX_HP, inv: 0, dashing: false, left: 0, kills: 0 });
  charges = MAX_CHARGES; rechargeT = 0;
  foes = []; arrows = []; parts = []; marks = []; trail = [];
  wave = 0; queue = []; breakT = 0.6;
  score = 0; combo = 0; bestCombo = 0; kills = 0; clock = 0;
  timeScale = 1; hitstop = 0; shake = 0; aiming = null;
  seen.clear();
  hint = 'Потяни палец в любом месте и отпусти';
}

function waveList(n: number): Kind[] {
  const list: Kind[] = [];
  const grunts = n === 1 ? 3 : Math.min(24, 2 + n * 2);
  const shields = n >= 3 ? Math.min(6, n - 2) : 0;
  const archers = n >= 4 ? Math.min(5, Math.floor((n - 2) / 2)) : 0;
  for (let i = 0; i < grunts; i++) list.push('grunt');
  for (let i = 0; i < shields; i++) list.splice(2 + Math.floor(Math.random() * (list.length - 1)), 0, 'shield');
  for (let i = 0; i < archers; i++) list.splice(2 + Math.floor(Math.random() * (list.length - 1)), 0, 'archer');
  return list;
}

function startWave() {
  wave++;
  queue = waveList(wave);
  spawnT = 0.3;
  showBanner(`Волна ${wave}`, '');
}

function spawnFoe(kind: Kind) {
  let x = 0, y = 0;
  for (let i = 0; i < 12; i++) {
    const side = Math.floor(Math.random() * 4), m = 22;
    x = side < 2 ? m + Math.random() * (AW - 2 * m) : side === 2 ? m : AW - m;
    y = side >= 2 ? m + Math.random() * (AH - 2 * m) : side === 0 ? m : AH - m;
    if (Math.hypot(x - hero.x, y - hero.y) > 150) break;
  }
  foes.push({ kind, x, y, r: kind === 'shield' ? 14 : 12, face: Math.atan2(hero.y - y, hero.x - x), stun: 0,
    cd: 1.5 + Math.random(), aim: 0, aimA: 0, spawn: 0.6, dead: false });
  if (!seen.has(kind)) {
    seen.add(kind);
    if (kind === 'shield') showBanner('Щитоносец', 'В лоб не пробить — заходи сбоку или со спины');
    if (kind === 'archer') showBanner('Лучник', 'Стрелу можно срезать рывком');
  }
}

function showBanner(text: string, sub: string) { banner = { text, sub, t: sub ? 2.6 : 1.3 }; }

// ---------- ввод ----------
cv.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (state !== 'play' || aiming) return;
  aiming = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY };
  try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
cv.addEventListener('pointermove', (e) => {
  if (aiming && e.pointerId === aiming.id) { aiming.cx = e.clientX; aiming.cy = e.clientY; }
});
const release = (e: PointerEvent) => {
  if (!aiming || e.pointerId !== aiming.id) return;
  const a = aiming; aiming = null;
  if (e.type !== 'pointerup' || state !== 'play') return;
  const d = aimVec(a);
  if (d && charges >= 1 && !hero.dashing) startDash(d.x, d.y, d.len);
};
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);

/** Направление и длина рывка по протяжке пальца; null — протяжка слишком короткая. */
function aimVec(a: { sx: number; sy: number; cx: number; cy: number }) {
  const px = a.cx - a.sx, py = a.cy - a.sy, l = Math.hypot(px, py);
  if (l < MIN_DRAG) return null;
  return { x: px / l, y: py / l, len: Math.min(DASH_MAX, (l / scale) * DRAG_K) };
}

// ---------- рывок ----------
function startDash(dx: number, dy: number, len: number) {
  Object.assign(hero, { dashing: true, dx, dy, left: len, kills: 0 });
  charges -= 1;
  hint = '';
  sfx.play('slice', 0.9);
}

function endDash() {
  hero.dashing = false;
  hero.inv = Math.max(hero.inv, 0.15); // миг после рывка: не умирать от врага, в которого только что влетел
  if (hero.kills === 0) combo = 0;
  if (hero.kills >= 3) {
    showBanner(`×${hero.kills}`, '');
    hitstop = Math.max(hitstop, 0.09); shake = Math.min(1, shake + 0.4);
    buzz(16);
  }
  if (hero.kills > 0 && wave === 1 && kills <= 2) hint = 'Убийство возвращает рывок — режь цепочкой';
}

/** Расстояние от точки до отрезка и параметр проекции t ∈ [0, 1]. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return { d: Math.hypot(px - (ax + vx * t), py - (ay + vy * t)), t };
}

function updateDash(dt: number) {
  const step = Math.min(hero.left, DASH_SPEED * dt);
  const ax = hero.x, ay = hero.y;
  let bx = ax + hero.dx * step, by = ay + hero.dy * step;
  const wall = bx < HERO_R || bx > AW - HERO_R || by < HERO_R || by > AH - HERO_R;
  bx = clamp(bx, HERO_R, AW - HERO_R); by = clamp(by, HERO_R, AH - HERO_R);

  const hits: { f: Foe; t: number }[] = [];
  for (const f of foes) {
    if (f.dead || f.spawn > 0) continue;
    const s = segDist(f.x, f.y, ax, ay, bx, by);
    if (s.d < f.r + HERO_R) hits.push({ f, t: s.t });
  }
  hits.sort((p, q) => p.t - q.t);
  for (const { f, t } of hits) {
    const front = hero.dx * Math.cos(f.face) + hero.dy * Math.sin(f.face) < -0.35;
    if (f.kind === 'shield' && f.stun <= 0 && front) {
      // удар в щит: рывок обрывается, щитоносец оглушён и открыт с любой стороны
      bx = ax + (bx - ax) * t - hero.dx * (f.r + HERO_R) * 0.5; by = ay + (by - ay) * t - hero.dy * (f.r + HERO_R) * 0.5;
      bx = clamp(bx, HERO_R, AW - HERO_R); by = clamp(by, HERO_R, AH - HERO_R);
      f.stun = 1.1; f.x += hero.dx * 18; f.y += hero.dy * 18;
      burst(f.x - hero.dx * f.r, f.y - hero.dy * f.r, '#e9eef8', 8, 160);
      sfx.play('clank'); shake = Math.min(1, shake + 0.35); buzz(12);
      pushTrail(bx, by); hero.x = bx; hero.y = by; hero.left = 0;
      endDash();
      return;
    }
    kill(f);
  }
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (segDist(a.x, a.y, ax, ay, bx, by).d < HERO_R + 6) {
      arrows.splice(i, 1); score += 5;
      burst(a.x, a.y, '#f2e3b3', 5, 120); sfx.play('pop', 0.7);
    }
  }
  pushTrail(bx, by);
  hero.x = bx; hero.y = by; hero.left -= step;
  if (hero.left <= 0.01 || wall) endDash();
}

function kill(f: Foe) {
  f.dead = true;
  combo++; kills++; hero.kills++;
  bestCombo = Math.max(bestCombo, combo);
  score += 10 * Math.min(combo, 30);
  charges = Math.min(MAX_CHARGES, charges + 1);
  hitstop = Math.max(hitstop, 0.025);
  shake = Math.min(1, shake + 0.12);
  burst(f.x, f.y, '#c8243a', 12, 220);
  burst(f.x, f.y, '#151018', 6, 140);
  marks.push({ x: f.x, y: f.y, a: Math.atan2(hero.dy, hero.dx), len: 18 + Math.random() * 16 });
  if (marks.length > 90) marks.shift();
  sfx.play('kill', 0.9, 1 + Math.min(combo, 16) * 0.045);
  buzz(7);
}

function pushTrail(x: number, y: number) { trail.push({ x, y, t: clock }); }

// ---------- урон по герою ----------
function hurt() {
  hero.hp--; hero.inv = IFRAMES; combo = 0;
  shake = Math.min(1, shake + 0.7); hitstop = Math.max(hitstop, 0.08);
  sfx.play('hurt'); buzz([30, 30, 20]);
  for (const f of foes) {
    const dx = f.x - hero.x, dy = f.y - hero.y, d = Math.hypot(dx, dy) || 1;
    if (d < 90) { f.x += (dx / d) * (90 - d); f.y += (dy / d) * (90 - d); f.stun = Math.max(f.stun, 0.4); }
  }
  if (hero.hp <= 0) gameOver();
}

// ---------- обновление мира ----------
function update(dt: number) {
  clock += dt;
  if (hero.inv > 0) hero.inv -= dt;
  if (charges < MAX_CHARGES) {
    rechargeT += dt;
    if (rechargeT >= RECHARGE) { rechargeT = 0; charges++; }
  } else rechargeT = 0;
  if (hero.dashing) updateDash(dt);

  // волны
  if (breakT > 0) {
    breakT -= dt;
    if (breakT <= 0) startWave();
  } else if (queue.length) {
    spawnT -= dt;
    if (spawnT <= 0) { spawnFoe(queue.shift()!); spawnT = wave === 1 ? 1.4 : Math.max(0.3, 0.95 - wave * 0.05); }
  } else if (!foes.length) {
    breakT = 1.8;
    if (wave % 3 === 0 && hero.hp < MAX_HP) { hero.hp++; showBanner('Волна пройдена', '+1 жизнь'); sfx.play('heal'); }
    else showBanner('Волна пройдена', '');
    sfx.play('level', 0.7);
  }

  // враги
  const speedUp = Math.min(1.5, 1 + wave * 0.04);
  for (const f of foes) {
    if (f.dead) continue;
    if (f.spawn > 0) { f.spawn -= dt; continue; }
    const tx = hero.x - f.x, ty = hero.y - f.y, dist = Math.hypot(tx, ty) || 1;
    const want = Math.atan2(ty, tx);
    if (f.stun > 0) { f.stun -= dt; continue; }
    // щитоносец поворачивается медленно — после рывка мимо него есть окно, чтобы зайти со спины
    f.face = f.kind === 'shield' ? turn(f.face, want, 2.0 * dt) : want;
    let sp = 0;
    if (f.kind === 'grunt') sp = 44 * speedUp;
    else if (f.kind === 'shield') sp = 30 * speedUp;
    else {
      sp = dist > 230 ? 40 : dist < 150 ? -36 : 0;
      if (f.aim > 0) {
        f.aim -= dt; sp = 0;
        if (f.aim > 0.25) f.aimA = want; // последние 0.25 с прицел замирает — можно уйти
        if (f.aim <= 0) {
          arrows.push({ x: f.x + Math.cos(f.aimA) * 14, y: f.y + Math.sin(f.aimA) * 14, vx: Math.cos(f.aimA) * 270, vy: Math.sin(f.aimA) * 270 });
          f.cd = 2.4 + Math.random() * 1.2; sfx.play('throw', 0.6);
        }
      } else if ((f.cd -= dt) <= 0 && dist < 360) { f.aim = 0.8; f.aimA = want; }
    }
    f.x += (tx / dist) * sp * dt; f.y += (ty / dist) * sp * dt;
    f.x = clamp(f.x, f.r, AW - f.r); f.y = clamp(f.y, f.r, AH - f.r);
    if (!hero.dashing && hero.inv <= 0 && dist < f.r + HERO_R - 2) hurt();
    if (state !== 'play') return;
  }
  foes = foes.filter((f) => !f.dead);
  // толкаемся, чтобы не слипались
  for (let i = 0; i < foes.length; i++) for (let j = i + 1; j < foes.length; j++) {
    const a = foes[i], b = foes[j];
    if (a.spawn > 0 || b.spawn > 0) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, o = a.r + b.r - d;
    if (o > 0) { a.x -= (dx / d) * o / 2; a.y -= (dy / d) * o / 2; b.x += (dx / d) * o / 2; b.y += (dy / d) * o / 2; }
  }

  // стрелы
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (a.x < -20 || a.x > AW + 20 || a.y < -20 || a.y > AH + 20) { arrows.splice(i, 1); continue; }
    if (!hero.dashing && hero.inv <= 0 && Math.hypot(a.x - hero.x, a.y - hero.y) < HERO_R + 3) {
      arrows.splice(i, 1); hurt();
      if (state !== 'play') return;
    }
  }

  for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
  parts = parts.filter((p) => p.life > 0);
  trail = trail.filter((t) => clock - t.t < 0.3);
  if (banner.t > 0) banner.t -= dt / Math.max(timeScale, 0.5);
}

function turn(a: number, b: number, max: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -max, max);
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

  // пол: тёмные доски додзё
  g.fillStyle = '#15151f'; g.fillRect(0, 0, AW, AH);
  g.strokeStyle = '#1d1d2a'; g.lineWidth = 1;
  for (let x = 45; x < AW; x += 45) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, AH); g.stroke(); }
  for (let i = 0; i < 14; i++) { const x = (i % 8) * 45, y = ((i * 137) % AH); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 45, y); g.stroke(); }
  // следы туши
  g.strokeStyle = '#3a1219'; g.lineCap = 'round';
  for (const m of marks) {
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(m.x - Math.cos(m.a) * m.len, m.y - Math.sin(m.a) * m.len); g.lineTo(m.x + Math.cos(m.a) * m.len, m.y + Math.sin(m.a) * m.len); g.stroke();
  }

  // появление врагов
  for (const f of foes) if (f.spawn > 0) {
    g.strokeStyle = `rgba(232,69,60,${0.3 + (0.6 - f.spawn)})`; g.lineWidth = 2;
    g.beginPath(); g.arc(f.x, f.y, f.r + f.spawn * 30, 0, Math.PI * 2); g.stroke();
  }
  // прицел лучников
  for (const f of foes) if (f.kind === 'archer' && f.aim > 0 && f.spawn <= 0) {
    const locked = f.aim <= 0.25;
    g.strokeStyle = locked ? 'rgba(255,80,60,0.85)' : 'rgba(255,80,60,0.3)'; g.lineWidth = locked ? 2 : 1;
    g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + Math.cos(f.aimA) * 600, f.y + Math.sin(f.aimA) * 600); g.stroke();
    g.setLineDash([]);
  }
  for (const f of foes) if (f.spawn <= 0) drawFoe(f);

  // стрелы
  g.strokeStyle = '#f2e3b3'; g.lineWidth = 2;
  for (const a of arrows) {
    const l = Math.hypot(a.vx, a.vy) || 1;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x - (a.vx / l) * 14, a.y - (a.vy / l) * 14); g.stroke();
  }

  // след рывка
  if (trail.length > 1) {
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], k = 1 - (clock - b.t) / 0.3;
      if (k <= 0) continue;
      g.strokeStyle = `rgba(240,244,255,${k})`; g.lineWidth = 2 + k * 8;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  }

  // прицел героя
  if (aiming && state === 'play') {
    const d = aimVec(aiming);
    if (d) {
      const ok = charges >= 1;
      const ex = clamp(hero.x + d.x * d.len, HERO_R, AW - HERO_R), ey = clamp(hero.y + d.y * d.len, HERO_R, AH - HERO_R);
      g.strokeStyle = ok ? 'rgba(255,255,255,0.75)' : 'rgba(150,150,170,0.5)'; g.lineWidth = 2;
      g.setLineDash([8, 7]);
      g.beginPath(); g.moveTo(hero.x, hero.y); g.lineTo(ex, ey); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(ex, ey, HERO_R, 0, Math.PI * 2); g.stroke();
    }
  }

  drawHero();

  for (const p of parts) {
    g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.color;
    g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  g.globalAlpha = 1;

  // замедление: холодная дымка по краям
  if (timeScale < 0.95) {
    const k = (1 - timeScale) / (1 - SLOW);
    const grd = g.createRadialGradient(AW / 2, AH / 2, AH * 0.3, AW / 2, AH / 2, AH * 0.75);
    grd.addColorStop(0, 'rgba(60,90,160,0)'); grd.addColorStop(1, `rgba(60,90,160,${0.35 * k})`);
    g.fillStyle = grd; g.fillRect(0, 0, AW, AH);
  }

  if (state !== 'menu') drawHud();
}

function drawFoe(f: Foe) {
  const body = f.kind === 'grunt' ? '#8a5a3c' : f.kind === 'shield' ? '#5d6475' : '#4f6e48';
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(f.x, f.y + f.r * 0.7, f.r, f.r * 0.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = body; g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
  // соломенная шляпа сверху
  g.fillStyle = f.kind === 'archer' ? '#7d8f5a' : '#c9a35e';
  g.beginPath(); g.arc(f.x, f.y, f.r * 0.62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#00000040'; g.beginPath(); g.arc(f.x, f.y, f.r * 0.18, 0, Math.PI * 2); g.fill();
  const c = Math.cos(f.face), sn = Math.sin(f.face);
  if (f.kind === 'shield') {
    // щит — дуга перед лицом
    g.strokeStyle = f.stun > 0 ? '#7a8090' : '#d6dce8'; g.lineWidth = 5; g.lineCap = 'butt';
    g.beginPath(); g.arc(f.x, f.y, f.r + 4, f.face - 1.0, f.face + 1.0); g.stroke();
    g.lineCap = 'round';
  } else if (f.kind === 'archer') {
    g.strokeStyle = '#d9c08a'; g.lineWidth = 2;
    g.beginPath(); g.arc(f.x + c * 4, f.y + sn * 4, f.r + 2, f.face - 0.9, f.face + 0.9); g.stroke();
  } else {
    // копьё
    g.strokeStyle = '#b8b2a6'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(f.x + c * 4 - sn * 7, f.y + sn * 4 + c * 7); g.lineTo(f.x + c * 22 - sn * 7, f.y + sn * 22 + c * 7); g.stroke();
  }
  if (f.stun > 0) {
    g.fillStyle = '#ffe28a'; g.font = '700 12px Onest, sans-serif'; g.textAlign = 'center';
    g.fillText('✦', f.x + Math.cos(clock * 8) * 9, f.y - f.r - 6);
  }
}

function drawHero() {
  if (hero.inv > 0 && Math.floor(hero.inv * 14) % 2 === 0) return;
  const { x, y, dx, dy } = hero;
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x, y + 8, 11, 4, 0, 0, Math.PI * 2); g.fill();
  // концы красной повязки развеваются за спиной
  g.strokeStyle = '#e8453c'; g.lineWidth = 3; g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const w = Math.sin(clock * 10 + side) * 4;
    g.beginPath(); g.moveTo(x - dx * 8, y - dy * 8);
    g.quadraticCurveTo(x - dx * 16 - dy * (side * 5 + w), y - dy * 16 + dx * (side * 5 + w), x - dx * 24 - dy * (side * 7), y - dy * 24 + dx * (side * 7));
    g.stroke();
  }
  g.fillStyle = '#0c0c12'; g.beginPath(); g.arc(x, y, HERO_R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a2a3a'; g.lineWidth = 1.5; g.stroke();
  g.strokeStyle = '#e8453c'; g.lineWidth = 3;
  g.beginPath(); g.arc(x, y, HERO_R - 3, Math.atan2(dy, dx) - 1.3, Math.atan2(dy, dx) + 1.3); g.stroke();
  // прорезь для глаз
  g.strokeStyle = '#f4f1e8'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x + dx * 6 - dy * 4, y + dy * 6 + dx * 4); g.lineTo(x + dx * 6 + dy * 4, y + dy * 6 - dx * 4); g.stroke();
  // заряды рывка под ниндзя
  for (let i = 0; i < MAX_CHARGES; i++) {
    const px = x + (i - 1) * 10, py = y + HERO_R + 9;
    const fill = i < charges ? 1 : i === charges ? rechargeT / RECHARGE : 0;
    g.fillStyle = '#ffffff22'; g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
    if (fill > 0) { g.fillStyle = i < charges ? '#f4f1e8' : '#f4f1e888'; g.beginPath(); g.arc(px, py, 3.2 * fill, 0, Math.PI * 2); g.fill(); }
  }
}

function drawHud() {
  const top = Math.max(10, safeTop / scale + 6);
  g.textBaseline = 'top';
  g.font = '700 18px Onest, sans-serif'; g.textAlign = 'left';
  for (let i = 0; i < MAX_HP; i++) { g.fillStyle = i < hero.hp ? '#e8453c' : '#3a3442'; g.fillText('♥', 12 + i * 20, top); }
  g.fillStyle = '#b9bfd3'; g.textAlign = 'center'; g.font = '600 13px "JetBrains Mono", monospace';
  g.fillText(`ВОЛНА ${Math.max(1, wave)}`, AW / 2, top + 3);
  g.textAlign = 'right'; g.fillStyle = '#eef0f7'; g.font = '700 18px "JetBrains Mono", monospace';
  g.fillText(String(score), AW - 64, top);
  if (combo >= 2) {
    g.textAlign = 'center'; g.fillStyle = '#ffd58a'; g.font = `800 ${16 + Math.min(combo, 20)}px Unbounded, sans-serif`;
    g.fillText(`×${combo}`, AW / 2, top + 22);
  }
  if (banner.t > 0) {
    g.globalAlpha = Math.min(1, banner.t * 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#eef0f7'; g.font = '800 28px Unbounded, sans-serif'; g.fillText(banner.text, AW / 2, AH * 0.3);
    if (banner.sub) { g.fillStyle = '#b9bfd3'; g.font = '500 15px Onest, sans-serif'; g.fillText(banner.sub, AW / 2, AH * 0.3 + 30); }
    g.globalAlpha = 1;
  }
  if (hint) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.6 + Math.sin(clock * 4) * 0.25;
    g.fillStyle = '#eef0f7'; g.font = '600 15px Onest, sans-serif'; g.fillText(hint, AW / 2, AH - 60);
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
  $('record').textContent = b.score ? `Рекорд: ${b.score} очков · волна ${b.wave}` : '';
}
function play() { sfx.unlock(); newRun(); state = 'play'; show(null); }
function pause() { if (state !== 'play') return; state = 'paused'; aiming = null; show('paused'); }
function gameOver() {
  state = 'over'; aiming = null;
  const b = loadBest(), rec = score > b.score;
  try { localStorage.setItem(BEST_KEY, JSON.stringify({ score: Math.max(score, b.score), wave: Math.max(wave, b.wave) })); } catch { /* ignore */ }
  $('over-sub').textContent = `Волна ${wave} · ${kills} врагов · лучшее комбо ×${bestCombo}`;
  $('over-rec').textContent = rec ? `Новый рекорд: ${score}!` : `${score} очков · рекорд ${b.score}`;
  sfx.play('lose');
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

let last = performance.now();
function frame(now: number) {
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') {
    timeScale += ((aiming ? SLOW : 1) - timeScale) * Math.min(1, rdt * 18);
    if (hitstop > 0) hitstop -= rdt;
    else update(rdt * timeScale);
    shake = Math.max(0, shake - rdt * 1.8);
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
