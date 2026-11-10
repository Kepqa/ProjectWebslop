import Phaser from 'phaser';
import { settings } from './settings';

/** Мрачный стиль: приглушённые цвета, темнота и сильная виньетка вокруг героя. */
export function applyLook(cam: Phaser.Cameras.Scene2D.Camera) {
  cam.postFX?.clear();
  if (!settings.gloomy || !cam.postFX) return;
  const cm = cam.postFX.addColorMatrix();
  cm.saturate(-0.55);
  cm.brightness(0.78, true);
  cm.sepia(true);
  cm.alpha = 0.35;
  cam.postFX.addVignette(0.5, 0.5, 0.62, 0.65);
}
