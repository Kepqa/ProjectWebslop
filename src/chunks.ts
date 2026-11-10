import Phaser from 'phaser';
import { S } from './textures';
import { World, TILE, CH, CPX, K_CRATE, K_GRAVE, key2, drawChunk, type Palette } from './world';

/** Показывает чанки карты вокруг точки и картинки разрушаемых тайлов (ящики, могилы). */
export class ChunkView {
  private gfx = new Map<number, { g: Phaser.GameObjects.Graphics; objs: number[] }>();
  tileImgs = new Map<number, Phaser.GameObjects.Image>();

  constructor(private scene: Phaser.Scene, private world: World, private palette: Palette) {}

  static maxHp(kind: number) { return kind === K_GRAVE ? 5 : 3; }

  static tint(img: Phaser.GameObjects.Image, hp: number, maxHp: number) {
    if (hp < maxHp) img.setTint(hp <= maxHp / 3 ? 0x9a7f6a : 0xc9b3a0); else img.clearTint();
  }

  update(px: number, py: number) {
    const cam = this.scene.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const cx0 = Math.floor((px - vw / 2 - 120) / CPX), cx1 = Math.floor((px + vw / 2 + 120) / CPX);
    const cy0 = Math.floor((py - vh / 2 - 120) / CPX), cy1 = Math.floor((py + vh / 2 + 120) / CPX);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = key2(cx, cy);
      if (this.gfx.has(k)) continue;
      const g = this.scene.add.graphics().setDepth(0);
      drawChunk(g, this.world, cx, cy, this.palette);
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
      this.gfx.set(k, { g, objs });
    }
    for (const [k, c] of this.gfx) {
      const cx = k >> 16, cy = (k << 16) >> 16;
      if (cx >= cx0 - 1 && cx <= cx1 + 1 && cy >= cy0 - 1 && cy <= cy1 + 1) continue;
      c.g.destroy();
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
