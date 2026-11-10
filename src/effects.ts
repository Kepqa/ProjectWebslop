import Phaser from 'phaser';
import { S, ZLOOK, type ZType } from './textures';

/** Визуальные эффекты, общие для хоста и гостя (гость воспроизводит их по сетевым событиям). */
export type Fx =
  | { kind: 'ring'; x: number; y: number; r: number; color: number; born: number; life: number; width?: number }
  | { kind: 'bolt'; pts: number[]; born: number; life: number }
  | { kind: 'poly'; pts: { x: number; y: number }[]; born: number; life: number; color: number };

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
export const EMITTERS = ['gore', 'spark', 'dust', 'wood', 'acid', 'magic'] as const;
export type EmitterName = typeof EMITTERS[number];

export class Effects {
  fx: Fx[] = [];
  private em: Record<EmitterName, Emitter>;
  private splats: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    const mk = (cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, tex = 'dot') =>
      scene.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(9);
    this.em = {
      gore: mk({ speed: { min: 60, max: 280 }, lifespan: { min: 250, max: 600 }, scale: { start: 0.55, end: 0 }, tint: [0x8c2f39, 0x5c1a22, 0x6b8f3a, 0xa61e4d] }),
      spark: mk({ speed: { min: 120, max: 380 }, lifespan: { min: 120, max: 320 }, scale: { start: 0.35, end: 0 }, tint: [0xffffff, 0xc5f6fa, 0x66d9e8], blendMode: 'ADD' }),
      dust: mk({ speed: { min: 30, max: 140 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.5, end: 0 }, tint: [0x868e96, 0x5c5f66, 0x495057] }),
      wood: mk({ speed: { min: 90, max: 300 }, lifespan: { min: 350, max: 650 }, rotate: { min: 0, max: 360 }, scale: { start: 0.7, end: 0.3 }, tint: [0x9c6b3a, 0x7a4f28, 0xc08a50] }, 'chip'),
      acid: mk({ speed: { min: 40, max: 200 }, lifespan: { min: 250, max: 500 }, scale: { start: 0.5, end: 0 }, tint: [0xc0eb75, 0x94d82d, 0x5c940d] }),
      magic: mk({ speed: { min: 150, max: 420 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.6, end: 0 }, tint: [0xb197fc, 0xffd43b, 0xffffff], blendMode: 'ADD' }),
    };
  }

  burst(name: EmitterName, n: number, x: number, y: number) { this.em[name].explode(n, x, y); }

  ring(now: number, x: number, y: number, r: number, color: number, life: number, width?: number) {
    this.fx.push({ kind: 'ring', x, y, r, color, born: now, life, width });
  }
  bolt(now: number, pts: number[]) { this.fx.push({ kind: 'bolt', pts, born: now, life: 0.2 }); }
  poly(now: number, pts: { x: number; y: number }[], color: number) { this.fx.push({ kind: 'poly', pts, born: now, life: 0.5, color }); }

  text(x: number, y: number, text: string, color: string, size = 22) {
    const t = this.scene.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, fontStyle: '900', color, stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5).setDepth(15).setResolution(2).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 55, alpha: 0, delay: 250, duration: 750, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  slice(type: ZType, x: number, y: number, ang: number, lvl: number) {
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const sc = (1 + 0.07 * lvl) / S;
    for (const side of [1, -1]) {
      const h = this.scene.add.image(x, y, `${type}_half`).setRotation(side === 1 ? ang : ang + Math.PI).setDepth(4.6).setScale(sc);
      this.scene.tweens.add({
        targets: h, x: x + nx * side * 34 + Math.cos(ang) * 22, y: y + ny * side * 34 + Math.sin(ang) * 22,
        rotation: h.rotation + side * 0.9, alpha: 0, scale: sc * 0.85, duration: 480, ease: 'Cubic.easeOut', onComplete: () => h.destroy(),
      });
    }
  }

  deathRing(now: number, type: ZType, x: number, y: number, r: number) {
    this.ring(now, x, y, r + 8, ZLOOK[type].color, 0.2);
  }

  splat(x: number, y: number, r: number) {
    const s = this.scene.add.image(x, y, 'splat').setDepth(1).setRotation(Math.random() * 6.28).setScale(0).setAlpha(0.75);
    this.scene.tweens.add({ targets: s, scale: r / 14 / S, duration: 160, ease: 'Back.easeOut' });
    this.splats.push(s);
    if (this.splats.length > 140) this.splats.shift()!.destroy();
  }

  /** Анимация падения в пропасть: использует готовую картинку или создаёт новую. */
  fall(img: Phaser.GameObjects.Image) {
    this.scene.tweens.add({ targets: img, scale: 0.05 / S, angle: img.angle + 260, alpha: 0, duration: 650, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }

  draw(g: Phaser.GameObjects.Graphics, now: number) {
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
      } else {
        g.fillStyle(f.color, a * 0.35).fillPoints(f.pts, true);
        g.lineStyle(4 + t * 6, 0xe5dbff, a).strokePoints(f.pts, true);
      }
      return true;
    });
  }
}

/** Отрисовка следа свайпа (общая). */
export interface TrailSeg { x1: number; y1: number; x2: number; y2: number; born: number; kind: 'blade' | 'dull' | 'echo'; width: number }

export function drawTrail(g: Phaser.GameObjects.Graphics, s: TrailSeg, now: number, life: number) {
  const a = Math.max(0, 1 - (now - s.born) / life);
  if (s.kind === 'dull') {
    g.lineStyle(3, 0x868e96, a * 0.6).lineBetween(s.x1, s.y1, s.x2, s.y2);
    return;
  }
  const glow = s.kind === 'echo' ? 0xb197fc : 0x66d9e8;
  g.lineStyle(s.width * 1.3 * a, glow, a * 0.18).lineBetween(s.x1, s.y1, s.x2, s.y2);
  g.lineStyle(s.width * a, glow, a * 0.4).lineBetween(s.x1, s.y1, s.x2, s.y2);
  g.lineStyle(Math.max(2, s.width * 0.3 * a), 0xffffff, a).lineBetween(s.x1, s.y1, s.x2, s.y2);
}

export function trailLife(kind: TrailSeg['kind'], long: boolean) {
  return kind === 'dull' ? 0.15 : kind === 'echo' ? 0.25 : long ? 0.6 : 0.22;
}

/** Телеграфы атак (общий формат для сети): [код, ...параметры]. */
export type Tele = [0, number, number, number, number, number] // рывок: x,y,dirX,dirY,r
  | [1, number, number, number] // удар по площади: x,y,k
  | [2, number, number, number] // цель прыжка: x,y,R
  | [3, number, number]; // фитиль: x,y

export function drawTele(g: Phaser.GameObjects.Graphics, t: Tele, now: number, slamR: number, bombR: number) {
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
