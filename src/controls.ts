import Phaser from 'phaser';
import type { Hud } from './hud';
import { settings } from './settings';


export interface MoveInput { dx: number; dy: number; run: boolean; mag: number }

/** Джойстик, клавиатура и наклон устройства. */
export class Controls {
  joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  touchSeen = false;
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  /** Зона джойстика: нижняя левая часть экрана (компактнее, чем раньше). */
  inZone(x: number, y: number) {
    const w = window.innerWidth, h = window.innerHeight;
    if (settings.lefty) x = w - x; // левша: джойстик справа
    // компактная зона в нижнем углу — остальной экран свободен для свайпов
    return w > h ? x < w * 0.24 && y > h * 0.45 : x < w * 0.42 && y > h * 0.7;
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
      const hx = w > h ? R + 36 : w * 0.25, hy = w > h ? h - R - 36 : h - R - 50;
      hud.setJoystick('hint', settings.lefty ? w - hx : hx, hy, 0, 0, R, 0);
    } else hud.setJoystick(null);
  }
}
