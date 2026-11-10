import Phaser from 'phaser';
import { settings } from './settings';

/**
 * Мрачный стиль: приглушённые цвета + круг видимости вокруг героя.
 * Круг — радиальное затемнение в мире (всегда круглое, на любом соотношении сторон),
 * центр следует за героем, углы экрана гарантированно тёмные.
 */
export class Look {
  private fog: Phaser.GameObjects.Image | null = null;
  private key = '';

  constructor(private scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    cam.postFX?.clear();
    if (!settings.gloomy) return;
    if (cam.postFX) {
      const cm = cam.postFX.addColorMatrix();
      cm.saturate(-0.55);
      cm.brightness(0.82, true);
    }
    this.rebuild();
    scene.scale.on('resize', this.rebuild, this);
    scene.events.once('shutdown', () => scene.scale.off('resize', this.rebuild, this));
  }

  /** Перерисовывает текстуру тумана под текущий размер обзора. */
  private rebuild() {
    const cam = this.scene.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const half = Math.hypot(vw, vh) / 2 + 40;          // покрыть углы экрана
    const clear = Math.min(vw, vh) * 0.34 + 60;          // чистая зона вокруг героя
    const soft = clear * 0.45;                            // ширина мягкого края
    const size = 512;
    const key = `fog2_${Math.round(half)}_${Math.round(clear)}`;
    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, size, size)!;
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      const k = (v: number) => Math.min(1, v / half);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(k(clear), 'rgba(0,0,0,0)');
      g.addColorStop(k(clear + soft * 0.5), 'rgba(3,5,3,0.62)');
      g.addColorStop(k(clear + soft), 'rgba(3,5,3,0.9)');
      g.addColorStop(1, 'rgba(3,5,3,0.96)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
    this.key = key;
    if (!this.fog) this.fog = this.scene.add.image(0, 0, key).setDepth(12);
    this.fog.setTexture(key).setDisplaySize(half * 2, half * 2);
  }

  /** Вызывать каждый кадр с позицией героя. */
  follow(x: number, y: number) {
    if (this.fog) this.fog.setPosition(x, y);
  }
}
