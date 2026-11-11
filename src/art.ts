import type Phaser from 'phaser';
import { settings } from './settings';

/**
 * Мрачный стиль: вся графика рисуется теми же примитивами, но каждый цвет проходит через tone() —
 * выцветший, грязно-тёплый, тёмный; красный остаётся красным (кровь). Яркий стиль — цвета как есть.
 */
export const grim = () => settings.grim;

let toneOn = true;
/** Временно отключить перекраску (добыча и белые частицы должны остаться читаемыми). */
export function setTone(on: boolean) { toneOn = on; }

export function mix(a: number, b: number, k: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function tone(c: number) {
  if (!settings.grim || !toneOn) return c;
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const blood = r > 1.45 * g && r > 1.45 * b;
  const k = blood ? 0.25 : 0.64;
  r += (l - r) * k; g += (l - g) * k; b += (l - b) * k;
  if (blood) { r *= 0.72; g *= 0.5; b *= 0.5; } else { r *= 0.9; g *= 0.87; b *= 0.76; }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** Graphics, который красит всё через tone(). */
export function toned<T extends Phaser.GameObjects.Graphics>(g: T): T {
  const fs = g.fillStyle.bind(g), ls = g.lineStyle.bind(g);
  g.fillStyle = (c: number, a?: number) => fs(tone(c), a);
  g.lineStyle = (w: number, c: number, a?: number) => ls(w, tone(c), a);
  return g;
}

/** Ключ текущего набора текстур — сменился стиль, текстуры перерисовываются. */
export const artKey = () => (settings.grim ? 'grim' : 'classic');
