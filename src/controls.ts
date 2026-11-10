import Phaser from 'phaser';
import type { Hud } from './hud';

/**
 * Гироскоп: наклон устройства → направление движения. Нейтраль калибруется при включении и старте забега.
 * На iOS нужен запрос разрешения из обработчика нажатия (requestPermission).
 */
class Gyro {
  enabled = false;
  private beta = 0; private gamma = 0; private nb = 0; private ng = 0; private has = false; private listening = false;

  constructor() {
    try { this.enabled = localStorage.getItem('ss_gyro') === '1'; } catch { /* ignore */ }
  }

  get supported() { return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window; }

  /** Вызывать из клика. Возвращает, удалось ли включить. */
  async enable(): Promise<boolean> {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    try {
      if (DOE?.requestPermission && (await DOE.requestPermission()) !== 'granted') return false;
    } catch { return false; }
    this.listen();
    this.enabled = true;
    try { localStorage.setItem('ss_gyro', '1'); } catch { /* ignore */ }
    setTimeout(() => this.calibrate(), 300);
    return true;
  }

  disable() {
    this.enabled = false;
    try { localStorage.setItem('ss_gyro', '0'); } catch { /* ignore */ }
  }

  listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      this.beta = e.beta; this.gamma = e.gamma;
      if (!this.has) { this.has = true; this.calibrate(); }
    });
  }

  calibrate() { this.nb = this.beta; this.ng = this.gamma; }

  /** Вектор наклона в координатах экрана, длина 0..1+ (1 ≈ 22°). */
  read(): { x: number; y: number } {
    if (!this.enabled || !this.has) return { x: 0, y: 0 };
    let db = this.beta - this.nb, dg = this.gamma - this.ng;
    db = Math.max(-40, Math.min(40, db)); dg = Math.max(-40, Math.min(40, dg));
    const ang = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    let x = dg, y = db;
    if (ang === 90) { x = db; y = -dg; } else if (ang === -90 || ang === 270) { x = -db; y = dg; } else if (ang === 180) { x = -dg; y = -db; }
    const dz = 4, full = 22;
    const m = Math.hypot(x, y);
    if (m < dz) return { x: 0, y: 0 };
    const k = Math.min(1.3, (m - dz) / (full - dz)) / m;
    return { x: x * k, y: y * k };
  }
}

export const gyro = new Gyro();
if (gyro.enabled) gyro.listen();

export interface MoveInput { dx: number; dy: number; run: boolean; mag: number }

/**
 * Джойстик из двух кругов: внутренний — шаг, внешний — бег. Плюс клавиатура (Shift — бег) и гироскоп.
 */
export class Controls {
  joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  touchSeen = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    gyro.calibrate();
  }

  /** Зона джойстика: нижняя левая часть экрана (компактнее, чем раньше). */
  inZone(x: number, y: number) {
    const w = window.innerWidth, h = window.innerHeight;
    return w > h ? x < w * 0.32 && y > h * 0.35 : x < w * 0.5 && y > h * 0.62;
  }
  R() { return Phaser.Math.Clamp(Math.min(window.innerWidth, window.innerHeight) * 0.085, 36, 56); }
  outer() { return this.R() * 1.8; }

  /** @returns true, если касание забрал джойстик. sx/sy — CSS-пиксели. */
  down(id: number, sx: number, sy: number, touch: boolean) {
    if (touch) this.touchSeen = true;
    if (touch && !this.joy && this.inZone(sx, sy)) { this.joy = { id, bx: sx, by: sy, x: sx, y: sy }; return true; }
    return false;
  }
  move(id: number, sx: number, sy: number) {
    if (this.joy && id === this.joy.id) { this.joy.x = sx; this.joy.y = sy; return true; }
    return false;
  }
  up(id: number) {
    if (this.joy && id === this.joy.id) { this.joy = null; return true; }
    return false;
  }
  reset() { this.joy = null; }

  read(): MoveInput {
    let dx = 0, dy = 0, run = false;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;
    if (dx || dy) run = k.SHIFT.isDown;
    if (this.joy) {
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy), R = this.R();
      if (l > 5) { const m = Math.min(1, l / R); dx = (jx / l) * m; dy = (jy / l) * m; run = l > R * 1.08; }
    } else if (!dx && !dy && gyro.enabled) {
      const g = gyro.read();
      dx = g.x; dy = g.y;
      run = Math.hypot(dx, dy) > 1.05;
    }
    let mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; mag = 1; }
    return { dx, dy, run: run && mag > 0.3, mag };
  }

  render(hud: Hud, active: boolean) {
    const R = this.R(), O = this.outer();
    if (this.joy) {
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy), m = l > O ? O / l : 1;
      hud.setJoystick('active', this.joy.bx, this.joy.by, this.joy.bx + jx * m, this.joy.by + jy * m, R, O, l > R * 1.08);
    } else if (this.touchSeen && active) {
      const w = window.innerWidth, h = window.innerHeight;
      if (w > h) hud.setJoystick('hint', O + 30, h - O - 30, 0, 0, R, O);
      else hud.setJoystick('hint', w * 0.25, h - O - 40, 0, 0, R, O);
    } else hud.setJoystick(null);
  }
}
