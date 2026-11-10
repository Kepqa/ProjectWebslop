import Phaser from 'phaser';
import type { Hud } from './hud';

/**
 * Управление наклоном. Источники по приоритету:
 *  1) deviceorientation (гироскоп) — iOS и большинство телефонов;
 *  2) devicemotion, вектор гравитации (акселерометр) — есть почти везде, в т.ч. на Android без гироскопа.
 * Нейтраль калибруется при включении и старте забега. На iOS нужен запрос разрешения из нажатия.
 */
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class Gyro {
  enabled = false;
  private ori = { b: 0, g: 0, has: false, at: 0 };
  private grav = { x: 0, y: 0, has: false };
  private nb = 0; private ng = 0; private nx = 0; private ny = 0;
  private listening = false;

  constructor() {
    try { this.enabled = localStorage.getItem('ss_gyro') === '1'; } catch { /* ignore */ }
  }

  get supported() { return typeof window !== 'undefined' && ('DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window); }
  /** Есть ли живые данные с датчиков. */
  get working() { return this.ori.has || this.grav.has; }

  /** Вызывать из клика. Возвращает, удалось ли включить (и пришли ли данные). */
  async enable(): Promise<boolean> {
    const req = async (E: unknown) => {
      const r = (E as { requestPermission?: () => Promise<string> } | undefined)?.requestPermission;
      if (!r) return true;
      try { return (await r.call(E)) === 'granted'; } catch { return false; }
    };
    const okO = await req(window.DeviceOrientationEvent), okM = await req(window.DeviceMotionEvent);
    if (!okO && !okM) return false;
    this.listen();
    // ждём первые данные до 1.5 с
    const t0 = performance.now();
    while (!this.working && performance.now() - t0 < 1500) await new Promise((r) => setTimeout(r, 100));
    if (!this.working) return false;
    this.enabled = true;
    try { localStorage.setItem('ss_gyro', '1'); } catch { /* ignore */ }
    this.calibrate();
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
      this.ori.b = e.beta; this.ori.g = e.gamma; this.ori.at = performance.now();
      if (!this.ori.has) { this.ori.has = true; this.calibrate(); }
    });
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null) return;
      // на iOS знаки осей противоположны Android
      const k = IOS ? -1 : 1;
      this.grav.x = (a.x as number) * k; this.grav.y = (a.y as number) * k;
      if (!this.grav.has) { this.grav.has = true; this.calibrate(); }
    });
  }

  calibrate() { this.nb = this.ori.b; this.ng = this.ori.g; this.nx = this.grav.x; this.ny = this.grav.y; }

  /** Вектор наклона в координатах экрана, длина 0..1+ (1 ≈ 22°). */
  read(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    const freshOri = this.ori.has && performance.now() - this.ori.at < 1000;
    if (freshOri) {
      x = Math.max(-40, Math.min(40, this.ori.g - this.ng));
      y = Math.max(-40, Math.min(40, this.ori.b - this.nb));
    } else if (this.grav.has) {
      // гравитация (м/с²) → градусы наклона; знак x: Android даёт +x при наклоне влево
      const toDeg = (v: number) => (Math.asin(Math.max(-1, Math.min(1, v / 9.81))) * 180) / Math.PI;
      x = -(toDeg(this.grav.x) - toDeg(this.nx));
      y = toDeg(this.grav.y) - toDeg(this.ny);
    } else return { x: 0, y: 0 };
    const ang = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    const a = ((ang % 360) + 360) % 360;
    let sx = x, sy = y;
    if (a === 90) { sx = y; sy = -x; } else if (a === 270) { sx = -y; sy = x; } else if (a === 180) { sx = -x; sy = -y; }
    const dz = 3, full = 20;
    const m = Math.hypot(sx, sy);
    if (m < dz) return { x: 0, y: 0 };
    const k = Math.min(1, (m - dz) / (full - dz)) / m;
    return { x: sx * k, y: sy * k };
  }
}

export const gyro = new Gyro();
if (gyro.enabled) gyro.listen();

export interface MoveInput { dx: number; dy: number; run: boolean; mag: number }

/** Джойстик, клавиатура и наклон устройства. */
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
  R() { return Phaser.Math.Clamp(Math.min(window.innerWidth, window.innerHeight) * 0.1, 40, 64); }

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
    // бега нет: равномерное движение, чтобы не отвлекать от свайпов
    if (this.joy) {
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy), R = this.R();
      if (l > 5) { const m = Math.min(1, l / R); dx = (jx / l) * m; dy = (jy / l) * m; }
    } else if (!dx && !dy && gyro.enabled) {
      const g = gyro.read();
      dx = g.x; dy = g.y;
    }
    let mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; mag = 1; }
    return { dx, dy, run, mag };
  }

  render(hud: Hud, active: boolean) {
    const R = this.R();
    if (this.joy) {
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy), m = l > R ? R / l : 1;
      hud.setJoystick('active', this.joy.bx, this.joy.by, this.joy.bx + jx * m, this.joy.by + jy * m, R, 0);
    } else if (this.touchSeen && active) {
      const w = window.innerWidth, h = window.innerHeight;
      if (w > h) hud.setJoystick('hint', R + 36, h - R - 36, 0, 0, R, 0);
      else hud.setJoystick('hint', w * 0.25, h - R - 50, 0, 0, R, 0);
    } else hud.setJoystick(null);
  }
}
