/**
 * Живые превью на карточках хаба: короткие зацикленные сценки на Canvas 2D.
 * Крутятся только когда карточка видна; при «уменьшить движение» — один статичный кадр.
 */
type Draw = (c: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

// ---------- Swipe Survivors: толпа ползёт к герою, свайп режет её ----------
interface Z { x: number; y: number; hit: number }
function survivors(): Draw {
  const zs: Z[] = [];
  const parts: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  const spawn = (w: number, h: number): Z => {
    const a = Math.random() * Math.PI * 2, r = Math.hypot(w, h) * 0.55;
    return { x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, hit: 0 };
  };
  let lastT = 0, lastCut = -1;
  return (c, w, h, t) => {
    const dt = Math.min(0.05, t - lastT); lastT = t;
    while (zs.length < 34) zs.push(spawn(w, h));
    c.fillStyle = '#2c3a28'; c.fillRect(0, 0, w, h);
    // трава пятнами
    c.fillStyle = '#33442e';
    for (let i = 0; i < 18; i++) c.fillRect((i * 97) % w, (i * 53) % h, 18, 6);
    const hx = w / 2 + Math.sin(t * 0.8) * w * 0.08, hy = h / 2 + Math.cos(t * 0.6) * h * 0.06;
    // свайп раз в 1.6 с: дуга через толпу
    const cyc = t % 1.6, k = Math.min(1, cyc / 0.22);
    const cut = Math.floor(t / 1.6);
    const ang0 = cut * 2.1;
    const arc = (u: number) => ({ x: hx + Math.cos(ang0 + u * 2.4) * w * 0.26, y: hy + Math.sin(ang0 + u * 2.4) * h * 0.3 });
    for (const z of zs) {
      const dx = hx - z.x, dy = hy - z.y, d = Math.hypot(dx, dy) || 1;
      if (d > 26) { z.x += (dx / d) * 22 * dt; z.y += (dy / d) * 22 * dt; }
      if (cut !== lastCut && cyc < 0.22) {
        for (let u = 0; u <= k; u += 0.05) { const p = arc(u); if (Math.hypot(p.x - z.x, p.y - z.y) < 16) z.hit = 1; }
      }
    }
    if (cyc >= 0.22) lastCut = cut;
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      if (z.hit) {
        for (let j = 0; j < 6; j++) parts.push({ x: z.x, y: z.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5 });
        zs[i] = spawn(w, h);
      }
    }
    for (const z of zs) {
      c.fillStyle = '#6f8f45'; c.beginPath(); c.arc(z.x, z.y, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e6f2a0'; c.fillRect(z.x - 4, z.y - 3, 2, 2); c.fillRect(z.x + 2, z.y - 3, 2, 2);
    }
    for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    c.fillStyle = '#b6d36b';
    for (const p of parts) { c.globalAlpha = p.life * 2; c.fillRect(p.x - 2, p.y - 2, 4, 4); }
    c.globalAlpha = 1;
    // герой
    c.fillStyle = '#00000040'; c.beginPath(); c.ellipse(hx, hy + 9, 11, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f2d27a'; c.beginPath(); c.arc(hx, hy, 10, 0, Math.PI * 2); c.fill();
    // след свайпа
    if (cyc < 0.5) {
      c.lineCap = 'round'; c.strokeStyle = '#eaf7ff';
      c.globalAlpha = 1 - Math.max(0, (cyc - 0.22) / 0.28);
      c.lineWidth = 5; c.beginPath();
      for (let u = Math.max(0, k - 0.6); u <= k; u += 0.04) { const p = arc(u); u === Math.max(0, k - 0.6) ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y); }
      c.stroke(); c.globalAlpha = 1;
    }
  };
}

// ---------- Дуэль: обмен ударами и огненный шар на закате ----------
function duel(): Draw {
  return (c, w, h, t) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a1438'); g.addColorStop(0.7, '#a0485a'); g.addColorStop(1, '#e4855a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const gy = h * 0.8;
    c.fillStyle = '#ffd98f'; c.globalAlpha = 0.9; c.beginPath(); c.arc(w / 2, gy - h * 0.12, h * 0.2, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    c.fillStyle = '#4a2246'; c.beginPath(); c.moveTo(0, gy);
    for (let x = 0; x <= w; x += 10) c.lineTo(x, gy - h * 0.12 - Math.sin(x * 0.03) * h * 0.05);
    c.lineTo(w, gy); c.fill();
    c.fillStyle = '#1e0e1a'; c.fillRect(0, gy, w, h - gy);

    const cyc = t % 3.2;
    const s = h / 200;
    // левый: выпад на 0.3–0.7 с; правый: блок, затем каст на 1.6 с, шар летит, левый прыгает
    const lunge = cyc > 0.3 && cyc < 0.8 ? Math.sin(((cyc - 0.3) / 0.5) * Math.PI) : 0;
    const jump = cyc > 2.05 && cyc < 2.65 ? Math.sin(((cyc - 2.05) / 0.6) * Math.PI) : 0;
    const lx = w * 0.32 + lunge * w * 0.09, ly = gy - jump * h * 0.28;
    const rx = w * 0.68;
    const swing = cyc > 0.45 && cyc < 0.75 ? (cyc - 0.45) / 0.3 : cyc >= 0.75 && cyc < 1.2 ? 1 : 0;
    figure(c, lx, ly, s, 1, -1.1 + swing * 1.8, '#140a12');
    const blocking = cyc > 0.35 && cyc < 1.1, casting = cyc > 1.5 && cyc < 1.85;
    figure(c, rx, gy, s, -1, blocking ? -1.5 : casting ? -0.4 : 0.2, '#140a12');
    // искры блока
    if (cyc > 0.62 && cyc < 0.9) {
      const k = (cyc - 0.62) / 0.28;
      c.fillStyle = '#cfe6ff';
      for (let i = 0; i < 8; i++) { const a = i * 0.8; c.globalAlpha = 1 - k; c.fillRect(rx - 22 * s + Math.cos(a) * k * 30 * s, gy - 62 * s + Math.sin(a) * k * 30 * s, 3 * s, 3 * s); }
      c.globalAlpha = 1;
    }
    // огненный шар
    if (cyc > 1.85 && cyc < 2.9) {
      const k = (cyc - 1.85) / 1.05;
      const fx = rx - 30 * s - k * w * 0.7, fy = gy - 60 * s;
      const fg = c.createRadialGradient(fx, fy, 1, fx, fy, 16 * s);
      fg.addColorStop(0, '#fff6c8'); fg.addColorStop(0.4, '#ff9a3d'); fg.addColorStop(1, '#ff4a1d00');
      c.fillStyle = fg; c.beginPath(); c.arc(fx, fy, 16 * s, 0, Math.PI * 2); c.fill();
    }
    if (casting) {
      const og = c.createRadialGradient(rx - 34 * s, gy - 70 * s, 1, rx - 34 * s, gy - 70 * s, 14 * s);
      og.addColorStop(0, '#ffe3a1'); og.addColorStop(1, '#ff8a3d00');
      c.fillStyle = og; c.beginPath(); c.arc(rx - 34 * s, gy - 70 * s, 14 * s, 0, Math.PI * 2); c.fill();
    }
  };
}

/** Силуэт бойца: ноги у (x, y), f — куда смотрит, arm — угол руки с клинком. */
function figure(c: CanvasRenderingContext2D, x: number, y: number, s: number, f: number, arm: number, col: string) {
  c.save(); c.translate(x, y); c.scale(f * s, s);
  c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round';
  c.lineWidth = 7; c.beginPath(); c.moveTo(-6, 0); c.lineTo(-2, -34); c.moveTo(8, 0); c.lineTo(2, -34); c.stroke();
  c.beginPath(); c.roundRect(-9, -76, 18, 44, 7); c.fill();
  c.beginPath(); c.arc(0, -88, 10, 0, Math.PI * 2); c.fill();
  const hx = 4 + Math.cos(arm) * 22, hy = -66 + Math.sin(arm) * 22;
  c.lineWidth = 6; c.beginPath(); c.moveTo(4, -68); c.lineTo(hx, hy); c.stroke();
  c.strokeStyle = '#e8e8f0'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(arm) * 40, hy + Math.sin(arm) * 40); c.stroke();
  c.restore();
}

// ---------- Slicing Through: ниндзя рывками прорубает цепочку врагов ----------
function slicing(): Draw {
  const foes = Array.from({ length: 7 }, (_, i) => ({ a: i * 0.9, r: 0.3 + (i % 3) * 0.08, dead: -9 }));
  let hx = 0.5, hy = 0.5, fromX = 0.5, fromY = 0.5, toX = 0.5, toY = 0.5, last = -1;
  const trail: { x: number; y: number; t: number }[] = [];
  return (c, w, h, t) => {
    c.fillStyle = '#15151f'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#1d1d2a'; c.lineWidth = 1;
    for (let x = 30; x < w; x += 30) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    const pos = (f: typeof foes[0], tt: number) => ({ x: 0.5 + Math.cos(f.a + tt * 0.25) * f.r, y: 0.5 + Math.sin(f.a + tt * 0.25) * f.r * 0.9 });
    // рывок раз в 0.8 с к ближайшему живому врагу
    const step = Math.floor(t / 0.8);
    if (step !== last) {
      last = step;
      const alive = foes.filter((f) => t - f.dead > 1.2);
      const tgt = alive[step % Math.max(1, alive.length)];
      if (tgt) { const p = pos(tgt, t); fromX = hx; fromY = hy; toX = p.x + (p.x - hx) * 0.25; toY = p.y + (p.y - hy) * 0.25; tgt.dead = t; }
    }
    const k = Math.min(1, (t % 0.8) / 0.15);
    hx = fromX + (toX - fromX) * k; hy = fromY + (toY - fromY) * k;
    if (k < 1) trail.push({ x: hx * w, y: hy * h, t });
    while (trail.length && t - trail[0].t > 0.3) trail.shift();
    c.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const q = 1 - (t - trail[i].t) / 0.3;
      c.strokeStyle = `rgba(240,244,255,${q})`; c.lineWidth = 2 + q * 6;
      c.beginPath(); c.moveTo(trail[i - 1].x, trail[i - 1].y); c.lineTo(trail[i].x, trail[i].y); c.stroke();
    }
    for (const f of foes) {
      const p = pos(f, t), x = p.x * w, y = p.y * h, since = t - f.dead;
      if (since >= 0 && since < 0.4) {
        c.fillStyle = '#c8243a';
        for (let j = 0; j < 6; j++) c.fillRect(x + Math.cos(j) * since * 70, y + Math.sin(j * 1.7) * since * 70, 3, 3);
      }
      if (since < 1.2) continue;
      c.fillStyle = '#8a5a3c'; c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c9a35e'; c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#0c0c12'; c.beginPath(); c.arc(hx * w, hy * h, 9, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e8453c'; c.lineWidth = 3; c.beginPath(); c.arc(hx * w, hy * h, 6, 0, Math.PI * 2); c.stroke();
  };
}

const SCENES: Record<string, () => Draw> = { survivors, duel, slicing };

export function startPreviews() {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items: { cv: HTMLCanvasElement; draw: Draw; visible: boolean }[] = [];
  for (const cv of document.querySelectorAll<HTMLCanvasElement>('canvas.preview[data-game]')) {
    const make = SCENES[cv.dataset.game!];
    if (make) items.push({ cv, draw: make(), visible: true });
  }
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const it of items) {
      const r = it.cv.getBoundingClientRect();
      it.cv.width = Math.round(r.width * dpr); it.cv.height = Math.round(r.height * dpr);
    }
  };
  size(); addEventListener('resize', size);
  const io = new IntersectionObserver((es) => { for (const e of es) { const it = items.find((i) => i.cv === e.target); if (it) it.visible = e.isIntersecting; } });
  for (const it of items) io.observe(it.cv);
  const render = (t: number) => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const it of items) {
      if (!it.visible && !still) continue;
      const c = it.cv.getContext('2d')!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      it.draw(c, it.cv.width / dpr, it.cv.height / dpr, t);
    }
  };
  // статичный кадр: прокручиваем сценку пару секунд, чтобы толпа успела подойти
  // первый кадр рисуем у всех сразу, чтобы карточка ниже экрана не была пустой;
  // статичный режим: прокручиваем сценку пару секунд, чтобы толпа успела подойти
  for (const it of items) it.visible = true;
  for (let t = 0; t < 4.6; t += 0.05) render(t);
  if (still) return;
  const loop = (now: number) => { render(now / 1000); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
