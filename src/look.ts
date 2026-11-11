import type Phaser from 'phaser';

/** Раньше здесь был фильтр «мрачного стиля»; теперь стиль — это перерисовка (art.ts) и оверлей в CSS. */
export class Look {
  constructor(scene: Phaser.Scene) { scene.cameras.main.postFX?.clear(); }
  follow(_x: number, _y: number) { /* виньетка привязана к экрану: камера всегда центрирована на герое */ }
}
