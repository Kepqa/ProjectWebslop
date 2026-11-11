import Phaser from 'phaser';
import { S, ZLOOK, type ZType } from './textures';
import { grim, tone } from './art';

/** Визуальные эффекты, общие для хоста и гостя (гость воспроизводит их по сетевым событиям). */
export type Fx =
  | { kind: 'ring'; x: number; y: number; r: number; color: number; born: number; life: number; width?: number }
  | { kind: 'bolt'; pts: number[]; born: number; life: number }
  | { kind: 'poly'; pts: { x: number; y: number }[]; born: number; life: number; color: number }
  | { kind: 'slash'; x1: number; y1: number; x2: number; y2: number; born: number; life: number }
  | { kind: 'wave'; cx: number; cy: number; pts: number[]; s0: number; s1: number; born: number; life: number; fire: boolean };

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
export const EMITTERS = ['gore', 'spark', 'dust', 'wood', 'acid', 'magic', 'chunk', 'heal'] as const;
export type EmitterName = typeof EMITTERS[number];

export class Effects {
  fx: Fx[] = [];
  private em: Record<EmitterName, Emitter>;
  private splats: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    const mk = (cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, tex = 'dot') =>
      scene.add.particles(0, 0, tex, { emitting: false, ...cfg, tint: Array.isArray(cfg.tint) ? (cfg.tint as number[]).map(tone) : cfg.tint }).setDepth(9);
    this.em = {
      gore: mk({ speed: { min: 80, max: 340 }, lifespan: { min: 280, max: 650 }, scale: { start: 0.7, end: 0 }, tint: [0x8c2f39, 0x5c1a22, 0x6b8f3a, 0xa61e4d] }),
      spark: mk({ speed: { min: 120, max: 380 }, lifespan: { min: 120, max: 320 }, scale: { start: 0.35, end: 0 }, tint: [0xffffff, 0xc5f6fa, 0x66d9e8], blendMode: 'ADD' }),
      dust: mk({ speed: { min: 30, max: 140 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.5, end: 0 }, tint: [0x868e96, 0x5c5f66, 0x495057] }),
      wood: mk({ speed: { min: 90, max: 300 }, lifespan: { min: 350, max: 650 }, rotate: { min: 0, max: 360 }, scale: { start: 0.7, end: 0.3 }, tint: [0x9c6b3a, 0x7a4f28, 0xc08a50] }, 'chip'),
      acid: mk({ speed: { min: 40, max: 200 }, lifespan: { min: 250, max: 500 }, scale: { start: 0.5, end: 0 }, tint: [0xc0eb75, 0x94d82d, 0x5c940d] }),
      magic: mk({ speed: { min: 150, max: 420 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.6, end: 0 }, tint: [0xb197fc, 0xffd43b, 0xffffff], blendMode: 'ADD' }),
      // куски тела: цвет задаётся перед выбросом
      chunk: mk({ speed: { min: 120, max: 360 }, lifespan: { min: 350, max: 700 }, rotate: { min: 0, max: 360 }, scale: { start: 1.3, end: 0.5 }, alpha: { start: 1, end: 0 } }, 'chip'),
      heal: mk({ speed: { min: 40, max: 140 }, lifespan: { min: 500, max: 900 }, scale: { start: 0.6, end: 0 }, tint: [0x69db7c, 0xb2f2bb, 0xffffff], gravityY: -120 }),
    };
  }

  burst(name: EmitterName, n: number, x: number, y: number) { this.em[name].explode(n, x, y); }

  ring(now: number, x: number, y: number, r: number, color: number, life: number, width?: number) {
    this.fx.push({ kind: 'ring', x, y, r, color: tone(color), born: now, life, width });
  }
  bolt(now: number, pts: number[]) { this.fx.push({ kind: 'bolt', pts, born: now, life: 0.2 }); }
  poly(now: number, pts: { x: number; y: number }[], color: number) { this.fx.push({ kind: 'poly', pts, born: now, life: 0.5, color: tone(color) }); }
  /** Волна формы свайпа: pts — точки относительно центра, масштаб растёт s0→s1. */
  wave(now: number, cx: number, cy: number, pts: number[], s1: number, life: number, fire: boolean) {
    this.fx.push({ kind: 'wave', cx, cy, pts, s0: 1, s1, born: now, life, fire });
  }

  text(x: number, y: number, text: string, color: string, size = 22) {
    const t = this.scene.add.text(x, y, text, { fontFamily: 'Unbounded, system-ui, sans-serif', fontSize: `${Math.round(size * 0.82)}px`, fontStyle: '800', color, stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5).setDepth(15).setResolution(2).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 55, alpha: 0, delay: 250, duration: 750, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  /** Цифра урона: мелкая, быстро всплывает; крит — крупнее и жёлтая. */
  num(x: number, y: number, text: string, crit: boolean) {
    const t = this.scene.add.text(x, y, text, { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: crit ? '20px' : '14px', fontStyle: '700', color: crit ? '#ffd43b' : '#f1f3f5', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(15).setResolution(2).setScale(crit ? 1.5 : 1.15);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 110, ease: 'Quad.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 30, alpha: 0, delay: 120, duration: 420, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  /** Разрез по свайпу: белая вспышка-линия и две половинки, разлетающиеся в стороны с кровью. */
  slice(type: ZType, x: number, y: number, ang: number, lvl: number) {
    const now = this.scene.time.now / 1000;
    const r = ZLOOK[type].r * (1 + 0.07 * lvl);
    const cx = Math.cos(ang), cy = Math.sin(ang), nx = -cy, ny = cx;
    this.slashes.push({ kind: 'slash', x1: x - cx * r * 1.6, y1: y - cy * r * 1.6, x2: x + cx * r * 1.6, y2: y + cy * r * 1.6, born: now, life: 0.14 });
    const sc = (1 + 0.07 * lvl) / S;
    for (const side of [1, -1]) {
      const h = this.scene.add.image(x, y, `${type}_half`).setRotation(side === 1 ? ang : ang + Math.PI).setDepth(4.6).setScale(sc);
      const dist = 26 + r * 1.2;
      this.scene.tweens.add({
        targets: h, x: x + nx * side * dist + cx * 18, y: y + ny * side * dist + cy * 18,
        rotation: h.rotation + side * (0.8 + Math.random() * 0.7), duration: 520, ease: 'Cubic.easeOut',
      });
      this.scene.tweens.add({ targets: h, alpha: 0, scale: sc * 0.8, delay: 380, duration: 320, onComplete: () => h.destroy() });
      this.em.gore.explode(4, x + nx * side * 6, y + ny * side * 6);
    }
  }

  /** Смерть не от клинка: тело раздувается вспышкой и разлетается кусками. */
  pop(type: ZType, x: number, y: number, lvl: number, now: number) {
    const look = ZLOOK[type];
    const sc = (1 + 0.07 * lvl) / S;
    const img = this.scene.add.image(x, y, type).setDepth(4.6).setScale(sc).setTintFill(0xffffff);
    this.scene.tweens.add({ targets: img, scale: sc * 1.55, alpha: 0, duration: 150, ease: 'Quad.easeOut', onComplete: () => img.destroy() });
    const big = look.r >= 26;
    this.em.chunk.setParticleTint(tone(look.color));
    this.em.chunk.explode(big ? 16 : 8, x, y);
    this.em.gore.explode(big ? 18 : 8, x, y);
    this.ring(now, x, y, look.r + 16, look.color, 0.22, 4);
    // мрачный стиль: смерть оставляет больше крови
    if (grim()) this.splat(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16, look.r * 0.8);
  }

  private slashes: Fx[] = [];

  deathRing(now: number, type: ZType, x: number, y: number, r: number) {
    this.ring(now, x, y, r + 8, ZLOOK[type].color, 0.2);
  }

  splat(x: number, y: number, r: number) {
    const s = this.scene.add.image(x, y, 'splat').setDepth(1).setRotation(Math.random() * 6.28).setScale(0).setAlpha(grim() ? 0.9 : 0.75);
    this.scene.tweens.add({ targets: s, scale: r / 14 / S, duration: 160, ease: 'Back.easeOut' });
    this.splats.push(s);
    if (this.splats.length > (grim() ? 320 : 140)) this.splats.shift()!.destroy();
  }

  /** Анимация падения в пропасть: использует готовую картинку или создаёт новую. */
  fall(img: Phaser.GameObjects.Image) {
    this.scene.tweens.add({ targets: img, scale: 0.05 / S, angle: img.angle + 260, alpha: 0, duration: 650, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }

  draw(g: Phaser.GameObjects.Graphics, now: number) {
    // вспышки разреза живут по реальному времени сцены
    const rt = this.scene.time.now / 1000;
    this.slashes = this.slashes.filter((f) => {
      if (f.kind !== 'slash') return false;
      const k = (rt - f.born) / f.life;
      if (k >= 1) return false;
      g.lineStyle(7 * (1 - k), 0xffffff, 1 - k).lineBetween(f.x1, f.y1, f.x2, f.y2);
      g.lineStyle(14 * (1 - k), 0xc5f6fa, 0.35 * (1 - k)).lineBetween(f.x1, f.y1, f.x2, f.y2);
      return true;
    });
    this.fx = this.fx.filter((f) => {
      const t = (now - f.born) / f.life;
      if (t >= 1 || t < -0.5) return false;
      const a = 1 - Math.max(0, t);
      if (f.kind === 'ring') {
        const rr = f.r * (0.4 + Phaser.Math.Easing.Cubic.Out(Math.max(0, t)) * 0.6);
        g.fillStyle(f.color, a * 0.22).fillCircle(f.x, f.y, rr);
        g.lineStyle(f.width ?? 3, f.color, a).strokeCircle(f.x, f.y, rr);
      } else if (f.kind === 'bolt') {
        for (const [w, c, al] of [[5, 0x74c0fc, 0.4], [2, 0xfff3bf, 1]] as const) {
          g.lineStyle(w, c, a * al);
          g.beginPath(); g.moveTo(f.pts[0], f.pts[1]);
          for (let i = 2; i < f.pts.length; i += 2) g.lineTo(f.pts[i], f.pts[i + 1]);
          g.strokePath();
        }
      } else if (f.kind === 'poly') {
        g.fillStyle(f.color, a * 0.28).fillPoints(f.pts, true);
        g.lineStyle(3 + t * 5, 0xffffff, a * 0.9).strokePoints(f.pts, true);
      } else if (f.kind === 'wave') {
        const k = Phaser.Math.Easing.Cubic.Out(Math.max(0, t));
        const sc = f.s0 + (f.s1 - f.s0) * k;
        g.lineStyle(10 * a + 2, f.fire ? 0xff922b : 0x74c0fc, a * 0.85);
        g.beginPath();
        for (let i = 0; i < f.pts.length; i += 2) {
          const px = f.cx + f.pts[i] * sc, py = f.cy + f.pts[i + 1] * sc;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokePath();
      }
      return true;
    });
  }
}

/** Отрисовка следа свайпа (общая). */
export interface TrailSeg { x1: number; y1: number; x2: number; y2: number; born: number; kind: 'blade' | 'dull' | 'echo'; width: number; color?: number }

export function drawTrail(g: Phaser.GameObjects.Graphics, s: TrailSeg, now: number, life: number) {
  const a = Math.max(0, 1 - (now - s.born) / life);
  if (s.kind === 'dull') {
    g.lineStyle(3, 0x868e96, a * 0.5).lineBetween(s.x1, s.y1, s.x2, s.y2);
    return;
  }
  // Лента клинка: чем старше участок, тем он тоньше — хвост сам сходит на нет.
  // Скруглённые стыки, чтобы широкий след не рвался на поворотах.
  // мрачный стиль: холодная сталь без неона
  const G = grim();
  const glow = G ? (s.kind === 'echo' ? 0x8f8aa8 : 0xc9cdd0) : s.kind === 'echo' ? 0xb197fc : s.color ?? 0x66d9e8;
  const k = a * a * (3 - 2 * a);
  const w = s.width * (0.25 + 0.75 * k);
  if (!G) g.lineStyle(w * 2.1, glow, a * 0.13).lineBetween(s.x1, s.y1, s.x2, s.y2);
  g.lineStyle(w * 1.15, glow, a * (G ? 0.38 : 0.55)).lineBetween(s.x1, s.y1, s.x2, s.y2);
  g.fillStyle(glow, a * (G ? 0.38 : 0.55)).fillCircle(s.x2, s.y2, w * 0.575);
  const core = Math.max(1.5, w * 0.42);
  g.lineStyle(core, 0xffffff, Math.min(1, a * 1.3)).lineBetween(s.x1, s.y1, s.x2, s.y2);
  g.fillStyle(0xffffff, Math.min(1, a * 1.3)).fillCircle(s.x2, s.y2, core / 2);
}

export function trailLife(kind: TrailSeg['kind'], long: boolean) {
  return kind === 'dull' ? 0.15 : kind === 'echo' ? 0.25 : long ? 0.6 : 0.26;
}

/** Телеграфы атак (общий формат для сети): [код, ...параметры]. */
export type Tele = [0, number, number, number, number, number] // рывок: x,y,dirX,dirY,r
  | [1, number, number, number] // удар по площади: x,y,k
  | [2, number, number, number] // цель прыжка: x,y,R
  | [3, number, number] // фитиль: x,y
  | [4, number, number, number]; // источник угрозы без своей зоны (прыгун в замахе, плевун, босс): x,y,вид

export function drawTele(g: Phaser.GameObjects.Graphics, t: Tele, now: number, slamR: number, bombR: number) {
  if (t[0] === 4) return;
  if (t[0] === 0) {
    const [, x, y, dx, dy, r] = t;
    const a = 0.35 + Math.sin(now * 30) * 0.2;
    g.lineStyle(r * 1.4, 0xff6b6b, a * 0.4).lineBetween(x, y, x + dx * 300, y + dy * 300);
    g.lineStyle(2, 0xff8787, a).lineBetween(x, y, x + dx * 300, y + dy * 300);
  } else if (t[0] === 1) {
    const [, x, y, k] = t;
    g.fillStyle(0xff6b6b, 0.12 + k * 0.15).fillCircle(x, y, slamR * k);
    g.lineStyle(3, 0xff6b6b, 0.8).strokeCircle(x, y, slamR);
  } else if (t[0] === 2) {
    const [, x, y, R] = t;
    const a = 0.4 + Math.sin(now * 25) * 0.2;
    g.fillStyle(0xff6b6b, 0.12).fillCircle(x, y, R);
    g.lineStyle(2, 0xff8787, a).strokeCircle(x, y, R);
  } else {
    const [, x, y] = t;
    g.lineStyle(2, 0xff6b00, 0.5 + Math.sin(now * 40) * 0.3).strokeCircle(x, y, bombR);
  }
}

/** Цвета меток: 0 прыжок, 1 плевок/снаряд, 2 рывок, 3 взрыв, 4 босс. */
const WARN = [0xff6b6b, 0xa9e34b, 0xff922b, 0xffa94d, 0xffd43b];

/**
 * Метки у края экрана: «!» со стрелкой туда, откуда сейчас прилетит — прыгун в замахе, таран, плевун,
 * подрывник с фитилём, вражеский снаряд, босс. Только для угроз за пределами экрана.
 */
export function drawWarnings(g: Phaser.GameObjects.Graphics, cam: Phaser.Cameras.Scene2D.Camera, dpr: number, tele: Tele[], shots: { x: number; y: number; vx: number; vy: number }[], now: number) {
  const v = cam.worldView, k = cam.zoom / dpr; // k — CSS-пикселей на единицу мира
  const m = 30 / k, top = 128 / k;
  const x0 = v.x + m, x1 = v.right - m, y0 = v.y + top, y1 = v.bottom - m;
  const cx = v.centerX, cy = v.centerY;
  const pts: [number, number, number][] = [];
  for (const t of tele) {
    if (t[0] === 0) pts.push([t[1], t[2], 2]);
    else if (t[0] === 1) pts.push([t[1], t[2], 4]);
    else if (t[0] === 3) pts.push([t[1], t[2], 3]);
    else if (t[0] === 4) pts.push([t[1], t[2], t[3]]);
  }
  // снаряды — только те, что летят в сторону героя
  for (const s of shots) if ((cx - s.x) * s.vx + (cy - s.y) * s.vy > 0) pts.push([s.x, s.y, 1]);
  const used: [number, number][] = [];
  const pulse = 1 + Math.sin(now * 14) * 0.12;
  for (const [x, y, kind] of pts) {
    if (x >= v.x && x <= v.right && y >= v.y && y <= v.bottom) continue;
    if (used.length >= 8) break;
    const px = Math.min(x1, Math.max(x0, x)), py = Math.min(y1, Math.max(y0, y));
    if (used.some(([ux, uy]) => Math.abs(ux - px) < 44 / k && Math.abs(uy - py) < 44 / k)) continue;
    used.push([px, py]);
    const c = WARN[kind] ?? WARN[0], r = (15 / k) * pulse, a = Math.atan2(y - py, x - px);
    g.fillStyle(0x000000, 0.8).fillCircle(px, py, r);
    g.lineStyle(2.5 / k, c, 1).strokeCircle(px, py, r);
    // «!»
    g.fillStyle(c, 1).fillRect(px - 1.8 / k, py - 8 / k, 3.6 / k, 9.5 / k).fillCircle(px, py + 5.5 / k, 2.1 / k);
    // стрелка наружу
    const ax = px + Math.cos(a) * (r + 9 / k), ay = py + Math.sin(a) * (r + 9 / k);
    const bx = px + Math.cos(a + 0.5) * (r + 1 / k), by = py + Math.sin(a + 0.5) * (r + 1 / k);
    const dx = px + Math.cos(a - 0.5) * (r + 1 / k), dy = py + Math.sin(a - 0.5) * (r + 1 / k);
    g.fillStyle(c, 1).fillTriangle(ax, ay, bx, by, dx, dy);
  }
}
