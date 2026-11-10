import Phaser from 'phaser';
import { S } from './textures';
import { World, TILE, CH, CPX, K_CRATE, K_GRAVE, key2, drawChunk, type Palette } from './world';

/** Показывает чанки карты вокруг точки и картинки разрушаемых тайлов (ящики, могилы). */
export class ChunkView {
  private gfx = new Map<number, { rt: Phaser.GameObjects.RenderTexture; objs: number[] }>();
  private painter: Phaser.GameObjects.Graphics;
  tileImgs = new Map<number, Phaser.GameObjects.Image>();

  constructor(private scene: Phaser.Scene, private world: World, private palette: Palette) {
    this.painter = scene.make.graphics({}, false);
    scene.events.once('shutdown', () => this.painter.destroy());
  }

  /** Разрешение запечённой текстуры: до 1.5 пикселя текстуры на пиксель мира (баланс чёткости и памяти). */
  private res() { return Phaser.Math.Clamp(this.scene.cameras.main.zoom, 1, 1.5); }

  static maxHp(kind: number) { return kind === K_GRAVE ? 5 : 3; }

  static tint(img: Phaser.GameObjects.Image, hp: number, maxHp: number) {
    if (hp < maxHp) img.setTint(hp <= maxHp / 3 ? 0x9a7f6a : 0xc9b3a0); else img.clearTint();
  }

  update(px: number, py: number) {
    const cam = this.scene.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const cx0 = Math.floor((px - vw / 2 - 120) / CPX), cx1 = Math.floor((px + vw / 2 + 120) / CPX);
    const cy0 = Math.floor((py - vh / 2 - 120) / CPX), cy1 = Math.floor((py + vh / 2 + 120) / CPX);
    // ближние к игроку — первыми; не больше 2 новых за вызов (кроме самого первого), чтобы не дёргать кадр
    const todo: [number, number][] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!this.gfx.has(key2(cx, cy))) todo.push([cx, cy]);
    const ccx = px / CPX - 0.5, ccy = py / CPX - 0.5;
    todo.sort((a, b) => (a[0] - ccx) ** 2 + (a[1] - ccy) ** 2 - (b[0] - ccx) ** 2 - (b[1] - ccy) ** 2);
    const limit = this.gfx.size === 0 ? todo.length : 2;
    for (const [cx, cy] of todo.slice(0, limit)) {
      const k = key2(cx, cy);
      // Карта рисуется примитивами ОДИН раз и запекается в текстуру — дальше это просто картинка
      const k2 = this.res();
      const g = this.painter;
      g.clear();
      drawChunk(g, this.world, cx, cy, this.palette);
      g.setScale(k2);
      const rt = this.scene.add.renderTexture(cx * CPX, cy * CPX, Math.ceil(CPX * k2), Math.ceil(CPX * k2))
        .setOrigin(0).setScale(1 / k2).setDepth(0);
      rt.draw(g, 0, 0);
      g.clear();
      const objs: number[] = [];
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
        const tx = cx * CH + x, ty = cy * CH + y;
        const kind = this.world.kind(tx, ty);
        if (kind !== K_CRATE && kind !== K_GRAVE) continue;
        const ck = key2(tx, ty);
        const img = this.scene.add.image((tx + 0.5) * TILE, (ty + 0.5) * TILE, kind === K_GRAVE ? 'grave' : 'crate').setScale(1 / S).setDepth(3);
        ChunkView.tint(img, this.world.crateHp.get(ck) ?? ChunkView.maxHp(kind), ChunkView.maxHp(kind));
        this.tileImgs.set(ck, img);
        objs.push(ck);
      }
      this.gfx.set(k, { rt, objs });
    }
    for (const [k, c] of this.gfx) {
      const cx = k >> 16, cy = (k << 16) >> 16;
      if (cx >= cx0 - 1 && cx <= cx1 + 1 && cy >= cy0 - 1 && cy <= cy1 + 1) continue;
      c.rt.destroy();
      for (const ck of c.objs) { this.tileImgs.get(ck)?.destroy(); this.tileImgs.delete(ck); }
      this.gfx.delete(k);
    }
  }

  /** Тайл получил удар (hp>0) или сломан (hp<=0). */
  hitTile(tx: number, ty: number, hp: number, maxHp: number) {
    const k = key2(tx, ty);
    const img = this.tileImgs.get(k);
    if (!img) return;
    if (hp <= 0) { img.destroy(); this.tileImgs.delete(k); return; }
    const cx = (tx + 0.5) * TILE;
    ChunkView.tint(img, hp, maxHp);
    this.scene.tweens.add({ targets: img, x: cx + 4, duration: 40, yoyo: true, repeat: 1, onComplete: () => img.setX(cx) });
  }

  /** Могилы, у которых есть картинка (т.е. рядом с камерой). */
  *graves() {
    for (const img of this.tileImgs.values()) if (img.texture.key === 'grave') yield img;
  }
}
