import Phaser from 'phaser';
import { Hud } from './hud';
import { UPGRADES, computeStats, type Levels, type Stats, type UpgradeDef } from './upgrades';

type ZType = 'walker' | 'runner' | 'brute';

const ZDEF: Record<ZType, { hp: number; speed: number; r: number; dmg: number; xp: number; color: number; dark: number }> = {
  walker: { hp: 3, speed: 55, r: 14, dmg: 8, xp: 1, color: 0x74a84a, dark: 0x3d5e25 },
  runner: { hp: 2, speed: 118, r: 11, dmg: 6, xp: 1, color: 0xa8b84a, dark: 0x5c6620 },
  brute: { hp: 28, speed: 42, r: 26, dmg: 20, xp: 6, color: 0x4f7a5a, dark: 0x22392a },
};

const PLAYER_R = 15;
const PLAYER_SPEED = 190;
const SWIPE_MIN_SPEED = 0.45; // px/мс экрана — медленнее не режет
const SWIPE_COST = 0.035; // энергии на пиксель экрана
const RUNE_COST = 12;
const CELL = 64;

interface Zombie {
  type: ZType; x: number; y: number; hp: number; speed: number; r: number; dmg: number; xp: number;
  img: Phaser.GameObjects.Image; flash: number; slowUntil: number; slowMul: number; boneCd: number; dead: boolean;
}
interface Gem { x: number; y: number; value: number; chest: boolean; img: Phaser.GameObjects.Image; pulled: boolean }
interface Seg { x1: number; y1: number; x2: number; y2: number; born: number; kind: 'blade' | 'dull' | 'echo'; width: number }
interface BurnSeg { x1: number; y1: number; x2: number; y2: number; until: number; width: number }
interface Stroke {
  pts: { x: number; y: number }[]; hit: Set<Zombie>; kills: number; blasts: number;
  lastSX: number; lastSY: number; lastT: number; segs: Seg[]; loopStart: number;
}
type Fx =
  | { kind: 'ring'; x: number; y: number; r: number; color: number; born: number; life: number }
  | { kind: 'bolt'; pts: number[]; born: number; life: number }
  | { kind: 'poly'; pts: { x: number; y: number }[]; born: number; life: number; color: number };

export class GameScene extends Phaser.Scene {
  private hud!: Hud;
  private levels: Levels = {};
  private stats!: Stats;

  private px = 0; private py = 0; private hp = 100; private inv = 0;
  private energy = 100;
  private xp = 0; private level = 1; private pendingLevels = 0;
  private kills = 0; private killsForHeal = 0;
  private elapsed = 0; private spawnAcc = 0; private nextHorde = 60;
  private paused = false; private over = false;

  private zombies: Zombie[] = [];
  private gems: Gem[] = [];
  private segs: Seg[] = [];
  private burns: BurnSeg[] = [];
  private fx: Fx[] = [];
  private splats: Phaser.GameObjects.Image[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private grid = new Map<number, Zombie[]>();
  private strokes = new Map<number, Stroke>();
  private joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private touchSeen = false;
  private boneAngle = 0; private auraTick = 0; private burnTick = 0;

  private playerImg!: Phaser.GameObjects.Image;
  private ground!: Phaser.GameObjects.TileSprite;
  private trailG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private joyG!: Phaser.GameObjects.Graphics;
  private boneImgs: Phaser.GameObjects.Image[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() { super('game'); }

  create() {
    this.resetState();
    if (location.search.includes('debug')) (window as unknown as { scene: GameScene }).scene = this;
    this.makeTextures();
    this.hud = new Hud();
    this.hud.show();
    this.hud.setItems(this.levels);

    const { width, height } = this.scale;
    this.ground = this.add.tileSprite(0, 0, width, height, 'ground').setOrigin(0).setScrollFactor(0).setDepth(0);
    this.playerImg = this.add.image(0, 0, 'player').setDepth(4);
    this.trailG = this.add.graphics().setDepth(6);
    this.fxG = this.add.graphics().setDepth(7);
    this.joyG = this.add.graphics().setScrollFactor(0).setDepth(20);

    this.cameras.main.startFollow(this.playerImg, false, 1, 1);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.addPointer(3);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
  }

  private resetState() {
    this.levels = {};
    this.stats = computeStats(this.levels);
    this.px = 0; this.py = 0; this.hp = this.stats.maxHp; this.inv = 0;
    this.energy = this.stats.energyMax;
    this.xp = 0; this.level = 1; this.pendingLevels = 0;
    this.kills = 0; this.killsForHeal = 0;
    this.elapsed = 0; this.spawnAcc = 0; this.nextHorde = 60;
    this.paused = false; this.over = false;
    this.zombies = []; this.gems = []; this.segs = []; this.burns = []; this.fx = [];
    this.splats = []; this.timers = []; this.boneImgs = [];
    this.strokes.clear(); this.joy = null;
  }

  private onResize(size: Phaser.Structs.Size) {
    this.ground.setSize(size.width, size.height);
  }

  // ---------- Текстуры (рисуем примитивами, без ассетов) ----------
  private makeTextures() {
    if (this.textures.exists('ground')) return;
    const g = this.make.graphics({}, false);

    g.fillStyle(0x232a21).fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      g.fillStyle(Math.random() < 0.5 ? 0x2a3227 : 0x1e241c);
      g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 2 + Math.random() * 5);
    }
    g.lineStyle(1, 0x1a1f18, 0.6).strokeRect(0, 0, 128, 128);
    g.generateTexture('ground', 128, 128); g.clear();

    g.fillStyle(0x4dabf7).fillCircle(20, 20, PLAYER_R);
    g.lineStyle(3, 0xffffff).strokeCircle(20, 20, PLAYER_R);
    g.fillStyle(0xffffff).fillTriangle(32, 14, 32, 26, 39, 20);
    g.generateTexture('player', 40, 40); g.clear();

    for (const t of Object.keys(ZDEF) as ZType[]) {
      const d = ZDEF[t]; const r = d.r;
      const W = Math.ceil(r * 3.3), H = Math.ceil(r * 2.4), cx = r * 1.15, cy = H / 2;
      g.fillStyle(d.dark);
      g.fillRect(cx, cy - r * 0.8, r * 1.9, r * 0.32);
      g.fillRect(cx, cy + r * 0.48, r * 1.9, r * 0.32);
      g.fillStyle(d.color).fillCircle(cx, cy, r);
      g.lineStyle(2, d.dark).strokeCircle(cx, cy, r);
      g.fillStyle(0xffe066);
      g.fillCircle(cx + r * 0.45, cy - r * 0.33, Math.max(2, r * 0.16));
      g.fillCircle(cx + r * 0.45, cy + r * 0.33, Math.max(2, r * 0.16));
      g.generateTexture(t, W, H); g.clear();
      // Половинка для эффекта разреза
      g.fillStyle(d.color).slice(r + 2, r + 2, r, 0, Math.PI, false).fillPath();
      g.fillStyle(0x8c2f39).fillRect(2, r + 1, r * 2, 3);
      g.generateTexture(`${t}_half`, r * 2 + 4, r * 2 + 4); g.clear();
    }

    g.fillStyle(0x66d9e8).fillPoints([{ x: 6, y: 0 }, { x: 12, y: 8 }, { x: 6, y: 16 }, { x: 0, y: 8 }], true);
    g.lineStyle(1.5, 0xffffff, 0.8).strokePoints([{ x: 6, y: 0 }, { x: 12, y: 8 }, { x: 6, y: 16 }, { x: 0, y: 8 }], true);
    g.generateTexture('gem', 12, 16); g.clear();

    g.fillStyle(0xb5762b).fillRect(0, 4, 26, 18);
    g.fillStyle(0xffd43b).fillRect(0, 10, 26, 4).fillRect(11, 4, 4, 18);
    g.lineStyle(2, 0x000000).strokeRect(0, 4, 26, 18);
    g.generateTexture('chest', 26, 24); g.clear();

    g.fillStyle(0xf1f3f5).fillCircle(4, 5, 4).fillCircle(4, 13, 4).fillCircle(20, 5, 4).fillCircle(20, 13, 4).fillRect(4, 6, 16, 6);
    g.generateTexture('bone', 24, 18); g.clear();

    g.fillStyle(0x5c1a22, 0.8).fillCircle(16, 16, 11).fillCircle(8, 20, 6).fillCircle(24, 10, 5).fillCircle(26, 22, 3);
    g.generateTexture('splat', 32, 32);
    g.destroy();
  }

  // ---------- Ввод ----------
  private onDown(p: Phaser.Input.Pointer) {
    if (this.paused || this.over) return;
    if (p.wasTouch) this.touchSeen = true;
    if (p.wasTouch && p.x < this.scale.width * 0.4 && !this.joy) {
      this.joy = { id: p.id, bx: p.x, by: p.y, x: p.x, y: p.y };
      return;
    }
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    this.strokes.set(p.id, {
      pts: [{ x: w.x, y: w.y }], hit: new Set(), kills: 0, blasts: 0,
      lastSX: p.x, lastSY: p.y, lastT: performance.now(), segs: [], loopStart: 0,
    });
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (this.joy && p.id === this.joy.id) { this.joy.x = p.x; this.joy.y = p.y; return; }
    const s = this.strokes.get(p.id);
    if (!s || this.paused || this.over) return;
    const now = performance.now();
    const d = Math.hypot(p.x - s.lastSX, p.y - s.lastSY);
    if (d < 5) return;
    const speed = d / Math.max(1, now - s.lastT);
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const prev = s.pts[s.pts.length - 1];
    let kind: Seg['kind'] = 'dull';
    if (speed >= SWIPE_MIN_SPEED) {
      const cost = d * SWIPE_COST * this.stats.costMul;
      if (this.energy >= cost) { this.energy -= cost; kind = 'blade'; } else this.hud.energyEmpty();
    }
    const seg: Seg = { x1: prev.x, y1: prev.y, x2: w.x, y2: w.y, born: this.elapsed, kind, width: kind === 'blade' ? this.stats.bladeWidth : 4 };
    this.segs.push(seg);
    if (kind === 'blade') {
      s.segs.push(seg);
      this.bladeHit(seg, s.hit, this.stats.bladeDamage, s);
      if (this.stats.burnDur > 0 && this.burns.length < 500) {
        this.burns.push({ x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, until: this.elapsed + this.stats.burnDur, width: seg.width });
      }
    }
    s.pts.push({ x: w.x, y: w.y });
    s.lastSX = p.x; s.lastSY = p.y; s.lastT = now;
    this.checkRune(s);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.joy && p.id === this.joy.id) { this.joy = null; return; }
    const s = this.strokes.get(p.id);
    if (!s) return;
    this.strokes.delete(p.id);
    this.finishStroke(s);
  }

  private finishStroke(s: Stroke) {
    if (s.kills >= 3) {
      const last = s.pts[s.pts.length - 1];
      const bonus = Math.floor((s.kills * s.kills) / 4);
      this.dropGem(last.x, last.y, bonus, false);
      this.floatText(last.x, last.y - 20, `КОМБО x${s.kills}`, s.kills >= 8 ? '#ff922b' : '#ffd43b');
    }
    if (this.stats.echoMul > 0 && s.segs.length) {
      const segs = s.segs.slice();
      const dmg = this.stats.bladeDamage * this.stats.echoMul;
      this.timers.push({
        at: this.elapsed + 0.3,
        fn: () => {
          const hit = new Set<Zombie>();
          for (const sg of segs) {
            const e: Seg = { ...sg, born: this.elapsed, kind: 'echo' };
            this.segs.push(e);
            this.bladeHit(e, hit, dmg, null);
          }
        },
      });
    }
  }

  // ---------- Боёвка ----------
  private bladeHit(seg: Seg, hit: Set<Zombie>, dmg: number, stroke: Stroke | null) {
    const hw = seg.width / 2;
    const ang = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    const m = hw + 30;
    for (const z of this.queryRect(Math.min(seg.x1, seg.x2) - m, Math.min(seg.y1, seg.y2) - m, Math.max(seg.x1, seg.x2) + m, Math.max(seg.y1, seg.y2) + m)) {
      if (z.dead || hit.has(z)) continue;
      if (distToSeg(z.x, z.y, seg.x1, seg.y1, seg.x2, seg.y2) > hw + z.r) continue;
      hit.add(z);
      this.slow(z);
      if (this.damage(z, dmg, ang)) {
        if (!stroke) continue;
        stroke.kills++;
        if (Math.random() < this.stats.chainChance) this.chain(z);
        if (stroke.kills >= (stroke.blasts + 1) * this.stats.comboThreshold) {
          stroke.blasts++;
          this.explode(z.x, z.y);
        }
      }
    }
  }

  private slow(z: Zombie) {
    z.slowUntil = this.elapsed + this.stats.frostDur;
    z.slowMul = this.stats.frostSlow;
  }

  private chain(from: Zombie) {
    let cur = from;
    const visited = new Set<Zombie>([from]);
    for (let j = 0; j < this.stats.chainJumps; j++) {
      let best: Zombie | null = null; let bd = 170 * 170;
      for (const z of this.queryRect(cur.x - 170, cur.y - 170, cur.x + 170, cur.y + 170)) {
        if (z.dead || visited.has(z)) continue;
        const d = (z.x - cur.x) ** 2 + (z.y - cur.y) ** 2;
        if (d < bd) { bd = d; best = z; }
      }
      if (!best) break;
      this.fx.push({ kind: 'bolt', pts: jagged(cur.x, cur.y, best.x, best.y), born: this.elapsed, life: 0.2 });
      visited.add(best);
      this.damage(best, this.stats.chainDmg);
      cur = best;
    }
  }

  private explode(x: number, y: number) {
    const r = this.stats.comboRadius;
    this.fx.push({ kind: 'ring', x, y, r, color: 0xff922b, born: this.elapsed, life: 0.35 });
    this.cameras.main.shake(120, 0.004);
    for (const z of this.queryRect(x - r, y - r, x + r, y + r)) {
      if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (r + z.r) ** 2) this.damage(z, this.stats.comboDmg);
    }
  }

  private checkRune(s: Stroke) {
    const pts = s.pts;
    const n = pts.length;
    if (n > 400 || n - s.loopStart < 10) return;
    const P = pts[n - 1];
    for (let i = s.loopStart; i < n - 8; i++) {
      if ((pts[i].x - P.x) ** 2 + (pts[i].y - P.y) ** 2 > 40 * 40) continue;
      const poly = pts.slice(i);
      if (polyArea(poly) < 3500) continue;
      s.loopStart = n;
      const cost = RUNE_COST * this.stats.costMul;
      if (this.energy < cost) { this.hud.energyEmpty(); return; }
      this.energy -= cost;
      this.castRune(poly);
      return;
    }
  }

  private castRune(poly: { x: number; y: number }[]) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of poly) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    const dmg = this.stats.bladeDamage * this.stats.runeMult;
    let caught = 0;
    for (const z of this.queryRect(x1, y1, x2, y2)) {
      if (z.dead || !pointInPoly(z.x, z.y, poly)) continue;
      caught++;
      this.slow(z);
      this.damage(z, dmg);
    }
    this.fx.push({ kind: 'poly', pts: poly, born: this.elapsed, life: 0.45, color: 0xb197fc });
    if (caught >= 5) this.floatText((x1 + x2) / 2, (y1 + y2) / 2, `ПЕЧАТЬ x${caught}`, '#d0bfff');
  }

  /** @returns true если зомби убит */
  private damage(z: Zombie, amount: number, sliceAngle?: number): boolean {
    if (z.dead) return false;
    z.hp -= amount;
    z.flash = 0.08;
    if (z.hp > 0) return false;
    z.dead = true;
    this.kills++;
    z.img.destroy();
    if (z.type === 'brute') {
      this.dropGem(z.x, z.y, 0, true);
      this.dropGem(z.x + 14, z.y, z.xp, false);
    } else {
      this.dropGem(z.x, z.y, z.xp, false);
    }
    this.addSplat(z.x, z.y, z.r);
    if (sliceAngle !== undefined) this.sliceFx(z, sliceAngle);
    else this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: z.r + 8, color: ZDEF[z.type].color, born: this.elapsed, life: 0.2 });
    if (this.stats.healEvery && ++this.killsForHeal >= this.stats.healEvery) {
      this.killsForHeal = 0;
      this.hp = Math.min(this.stats.maxHp, this.hp + 4);
    }
    return true;
  }

  private sliceFx(z: Zombie, ang: number) {
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    for (const side of [1, -1]) {
      const h = this.add.image(z.x, z.y, `${z.type}_half`).setRotation(side === 1 ? ang : ang + Math.PI).setDepth(5);
      this.tweens.add({
        targets: h, x: z.x + nx * side * 28 + Math.cos(ang) * 14, y: z.y + ny * side * 28 + Math.sin(ang) * 14,
        rotation: h.rotation + side * 0.6, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => h.destroy(),
      });
    }
  }

  private addSplat(x: number, y: number, r: number) {
    const s = this.add.image(x, y, 'splat').setDepth(1).setRotation(Math.random() * 6.28).setScale(r / 14).setAlpha(0.7);
    this.splats.push(s);
    if (this.splats.length > 120) this.splats.shift()!.destroy();
  }

  private dropGem(x: number, y: number, value: number, chest: boolean) {
    if (!chest && value <= 0) return;
    const img = this.add.image(x, y, chest ? 'chest' : 'gem').setDepth(2);
    if (!chest && value >= 5) img.setScale(1.5).setTint(0xb197fc);
    this.gems.push({ x, y, value, chest, img, pulled: false });
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: '900', color, stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  // ---------- Спаун ----------
  private spawnZombie(type: ZType, angle?: number, distExtra = 0) {
    const d = ZDEF[type];
    const a = angle ?? Math.random() * Math.PI * 2;
    const dist = Math.hypot(this.scale.width, this.scale.height) / 2 + 40 + distExtra;
    const x = this.px + Math.cos(a) * dist, y = this.py + Math.sin(a) * dist;
    const k = d.r * 1.15 / Math.ceil(d.r * 3.3);
    const img = this.add.image(x, y, type).setOrigin(k, 0.5).setDepth(3);
    const hpScale = 1 + this.elapsed / 150;
    this.zombies.push({
      type, x, y, hp: d.hp * hpScale, speed: d.speed * (0.9 + Math.random() * 0.2), r: d.r, dmg: d.dmg, xp: d.xp,
      img, flash: 0, slowUntil: 0, slowMul: 1, boneCd: 0, dead: false,
    });
  }

  private pickType(): ZType {
    const t = this.elapsed;
    const runner = t > 40 ? Math.min(0.35, (t - 40) / 200) : 0;
    const brute = t > 75 ? Math.min(0.07, (t - 75) / 1500 + 0.015) : 0;
    const r = Math.random();
    if (r < brute) return 'brute';
    if (r < brute + runner) return 'runner';
    return 'walker';
  }

  private spawn(dt: number) {
    const t = this.elapsed;
    const rate = Math.min(22, 1.1 + t / 15 + (t / 60) ** 2 * 0.6);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc--;
      if (this.zombies.length < 380) this.spawnZombie(this.pickType());
    }
    if (t >= this.nextHorde) {
      this.nextHorde += 60;
      this.hud.toast('🧟 ОРДА! Обведи их печатью!');
      const n = 24 + Math.floor(t / 60) * 8;
      for (let i = 0; i < n; i++) this.spawnZombie(i % 12 === 0 && t > 100 ? 'brute' : 'walker', (i / n) * Math.PI * 2, 60);
    }
  }

  // ---------- Пространственная сетка ----------
  private buildGrid() {
    this.grid.clear();
    for (const z of this.zombies) {
      if (z.dead) continue;
      const k = cellKey(Math.floor(z.x / CELL), Math.floor(z.y / CELL));
      const b = this.grid.get(k);
      if (b) b.push(z); else this.grid.set(k, [z]);
    }
  }

  private queryRect(x1: number, y1: number, x2: number, y2: number): Zombie[] {
    const out: Zombie[] = [];
    const cx1 = Math.floor(x1 / CELL), cy1 = Math.floor(y1 / CELL), cx2 = Math.floor(x2 / CELL), cy2 = Math.floor(y2 / CELL);
    for (let cx = cx1; cx <= cx2; cx++) for (let cy = cy1; cy <= cy2; cy++) {
      const b = this.grid.get(cellKey(cx, cy));
      if (b) for (const z of b) out.push(z);
    }
    return out;
  }

  // ---------- Главный цикл ----------
  update(_time: number, deltaMs: number) {
    if (this.paused || this.over) { this.draw(); return; }
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.elapsed) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }

    this.movePlayer(dt);
    this.energy = Math.min(this.stats.energyMax, this.energy + this.stats.energyRegen * dt);
    this.spawn(dt);
    this.buildGrid();
    this.moveZombies(dt);
    this.trinkets(dt);
    this.burnTrails(dt);
    this.collectGems(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);

    if (this.hp <= 0) { this.gameOver(); return; }
    if (this.pendingLevels > 0) this.openLevelUp();
    this.draw();
  }

  private movePlayer(dt: number) {
    let dx = 0, dy = 0;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;
    if (this.joy) {
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy);
      if (l > 6) { const m = Math.min(1, l / 60); dx = (jx / l) * m; dy = (jy / l) * m; }
    }
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    const sp = PLAYER_SPEED * this.stats.speedMul;
    this.px += dx * sp * dt; this.py += dy * sp * dt;
    if (l > 0.05) this.playerImg.setRotation(Math.atan2(dy, dx));
    this.playerImg.setPosition(this.px, this.py);
    this.inv = Math.max(0, this.inv - dt);
    this.playerImg.setAlpha(this.inv > 0 && Math.floor(this.inv * 20) % 2 === 0 ? 0.4 : 1);
  }

  private moveZombies(dt: number) {
    for (const z of this.zombies) {
      if (z.dead) continue;
      const dx = this.px - z.x, dy = this.py - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const slow = z.slowUntil > this.elapsed ? z.slowMul : 1;
      z.x += (dx / d) * z.speed * slow * dt;
      z.y += (dy / d) * z.speed * slow * dt;

      // Расталкивание соседей
      const cx = Math.floor(z.x / CELL), cy = Math.floor(z.y / CELL);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const b = this.grid.get(cellKey(ix, iy));
        if (!b) continue;
        for (const o of b) {
          if (o === z || o.dead) continue;
          const ox = z.x - o.x, oy = z.y - o.y;
          const min = z.r + o.r - 2;
          const dd = ox * ox + oy * oy;
          if (dd >= min * min || dd < 0.01) continue;
          const dist = Math.sqrt(dd);
          const push = ((min - dist) / dist) * 0.25;
          const wz = o.r / (z.r + o.r);
          z.x += ox * push * wz * 2; z.y += oy * push * wz * 2;
        }
      }

      if (d < z.r + PLAYER_R && this.inv <= 0) {
        this.hp -= z.dmg;
        this.inv = 0.5;
        this.cameras.main.shake(100, 0.006);
        this.cameras.main.flash(80, 120, 0, 0);
      }

      z.img.setPosition(z.x, z.y).setRotation(Math.atan2(dy, dx));
      if (z.flash > 0) { z.flash -= dt; z.img.setTintFill(0xffffff); }
      else if (z.slowUntil > this.elapsed) z.img.setTint(0x9fd4ff);
      else z.img.clearTint();
    }
  }

  private trinkets(dt: number) {
    const s = this.stats;
    if (s.auraRadius > 0) {
      this.auraTick += dt;
      if (this.auraTick >= 0.5) {
        this.auraTick = 0;
        const r = s.auraRadius;
        for (const z of this.queryRect(this.px - r, this.py - r, this.px + r, this.py + r)) {
          if (!z.dead && (z.x - this.px) ** 2 + (z.y - this.py) ** 2 < (r + z.r) ** 2) this.damage(z, s.auraDps * 0.5);
        }
      }
    }
    while (this.boneImgs.length < s.bones) this.boneImgs.push(this.add.image(0, 0, 'bone').setDepth(5));
    if (s.bones > 0) {
      this.boneAngle += dt * 3.2;
      const R = 85;
      this.boneImgs.forEach((img, i) => {
        const a = this.boneAngle + (i / s.bones) * Math.PI * 2;
        const bx = this.px + Math.cos(a) * R, by = this.py + Math.sin(a) * R;
        img.setPosition(bx, by).setRotation(a * 2);
        for (const z of this.queryRect(bx - 40, by - 40, bx + 40, by + 40)) {
          if (z.dead || z.boneCd > this.elapsed) continue;
          if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (z.r + 12) ** 2) {
            z.boneCd = this.elapsed + 0.4;
            this.damage(z, s.boneDmg, a + Math.PI / 2);
          }
        }
      });
    }
  }

  private burnTrails(dt: number) {
    this.burns = this.burns.filter((b) => b.until > this.elapsed);
    this.burnTick += dt;
    if (this.burnTick < 0.25 || !this.burns.length) return;
    this.burnTick = 0;
    const dmg = this.stats.burnDps * 0.25;
    const hitThisTick = new Set<Zombie>();
    for (const b of this.burns) {
      const m = b.width / 2 + 30;
      for (const z of this.queryRect(Math.min(b.x1, b.x2) - m, Math.min(b.y1, b.y2) - m, Math.max(b.x1, b.x2) + m, Math.max(b.y1, b.y2) + m)) {
        if (z.dead || hitThisTick.has(z)) continue;
        if (distToSeg(z.x, z.y, b.x1, b.y1, b.x2, b.y2) <= b.width / 2 + z.r) { hitThisTick.add(z); this.damage(z, dmg); }
      }
    }
  }

  private collectGems(dt: number) {
    const R = this.stats.pickupRadius;
    for (const g of this.gems) {
      const dx = this.px - g.x, dy = this.py - g.y;
      const d = Math.hypot(dx, dy);
      if (d < R) g.pulled = true;
      if (g.pulled) {
        const sp = 480 * dt;
        g.x += (dx / (d || 1)) * Math.min(sp, d); g.y += (dy / (d || 1)) * Math.min(sp, d);
        g.img.setPosition(g.x, g.y);
      }
      if (d < PLAYER_R + 6) {
        g.img.destroy();
        if (g.chest) this.openChest();
        else this.gainXp(g.value);
        g.value = -1; // помечаем собранным
      }
    }
    this.gems = this.gems.filter((g) => g.value !== -1);
  }

  private gainXp(v: number) {
    this.xp += v * this.stats.xpMul;
    while (this.xp >= this.xpNext()) { this.xp -= this.xpNext(); this.level++; this.pendingLevels++; }
  }

  private xpNext() { return Math.floor(5 + this.level * 3.5 + Math.pow(this.level, 1.6)); }

  private openChest() {
    const pool = UPGRADES.filter((u) => u.kind === 'trinket' && (this.levels[u.id] ?? 0) < u.max);
    if (!pool.length) { this.hp = Math.min(this.stats.maxHp, this.hp + 30); this.hud.toast('📦 +30 HP'); return; }
    const u = pool[Math.floor(Math.random() * pool.length)];
    this.applyUpgrade(u.id);
    this.hud.toast(`📦 ${u.icon} ${u.name} (ур. ${this.levels[u.id]})`);
  }

  private applyUpgrade(id: string) {
    const oldMax = this.stats.maxHp;
    this.levels[id] = (this.levels[id] ?? 0) + 1;
    this.stats = computeStats(this.levels);
    this.hp += this.stats.maxHp - oldMax;
    this.energy = Math.min(this.energy, this.stats.energyMax);
    this.hud.setItems(this.levels);
  }

  private openLevelUp() {
    this.paused = true;
    for (const s of this.strokes.values()) this.finishStroke(s);
    this.strokes.clear();
    this.joy = null;
    const pool = UPGRADES.filter((u) => (this.levels[u.id] ?? 0) < u.max);
    const choices: UpgradeDef[] = [];
    while (choices.length < 3 && pool.length) {
      // Апгрейды свайпа выпадают чаще, тринкеты — реже (основной источник — сундуки)
      const weights = pool.map((u) => (u.kind === 'swipe' ? 3 : 1) * ((this.levels[u.id] ?? 0) > 0 ? 1.5 : 1));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let i = 0;
      while ((r -= weights[i]) > 0) i++;
      choices.push(pool.splice(i, 1)[0]);
    }
    if (!choices.length) {
      this.pendingLevels = 0; this.paused = false;
      this.hp = Math.min(this.stats.maxHp, this.hp + 20);
      return;
    }
    this.hud.showLevelUp(choices, this.levels, (id) => {
      this.applyUpgrade(id);
      this.pendingLevels--;
      this.paused = false;
    });
  }

  private gameOver() {
    this.over = true;
    this.strokes.clear(); this.joy = null;
    const t = Math.floor(this.elapsed);
    this.hud.showGameOver(
      `Продержались <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>Убито зомби: <b>${this.kills}</b> · Уровень: <b>${this.level}</b>`,
      () => this.scene.restart(),
    );
  }

  // ---------- Отрисовка ----------
  private draw() {
    const cam = this.cameras.main;
    this.ground.setTilePosition(cam.scrollX, cam.scrollY);

    const tg = this.trailG;
    tg.clear();
    if (this.stats.auraRadius > 0) {
      tg.fillStyle(0x9c36b5, 0.12).fillCircle(this.px, this.py, this.stats.auraRadius);
      tg.lineStyle(2, 0xcc5de8, 0.35).strokeCircle(this.px, this.py, this.stats.auraRadius);
    }
    for (const b of this.burns) {
      const a = Math.min(1, (b.until - this.elapsed) / 0.4) * (0.55 + Math.random() * 0.25);
      tg.lineStyle(b.width * 0.8, 0xff6b00, a * 0.5).lineBetween(b.x1, b.y1, b.x2, b.y2);
      tg.lineStyle(b.width * 0.3, 0xffd43b, a).lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
    this.segs = this.segs.filter((s) => {
      const life = s.kind === 'dull' ? 0.15 : s.kind === 'echo' ? 0.25 : 0.2;
      const age = this.elapsed - s.born;
      if (age > life && !this.paused) return false;
      const a = Math.max(0, 1 - age / life);
      if (s.kind === 'dull') {
        tg.lineStyle(3, 0x868e96, a * 0.6).lineBetween(s.x1, s.y1, s.x2, s.y2);
      } else {
        const glow = s.kind === 'echo' ? 0xb197fc : 0x66d9e8;
        tg.lineStyle(s.width * a, glow, a * 0.35).lineBetween(s.x1, s.y1, s.x2, s.y2);
        tg.lineStyle(Math.max(2, s.width * 0.3 * a), 0xffffff, a).lineBetween(s.x1, s.y1, s.x2, s.y2);
      }
      return true;
    });

    const fg = this.fxG;
    fg.clear();
    this.fx = this.fx.filter((f) => {
      const t = (this.elapsed - f.born) / f.life;
      if (t >= 1) return false;
      const a = 1 - t;
      if (f.kind === 'ring') {
        fg.fillStyle(f.color, a * 0.25).fillCircle(f.x, f.y, f.r * (0.5 + t * 0.5));
        fg.lineStyle(3, f.color, a).strokeCircle(f.x, f.y, f.r * (0.5 + t * 0.5));
      } else if (f.kind === 'bolt') {
        fg.lineStyle(3, 0xfff3bf, a);
        fg.beginPath(); fg.moveTo(f.pts[0], f.pts[1]);
        for (let i = 2; i < f.pts.length; i += 2) fg.lineTo(f.pts[i], f.pts[i + 1]);
        fg.strokePath();
      } else {
        fg.fillStyle(f.color, a * 0.35).fillPoints(f.pts, true);
        fg.lineStyle(4, 0xe5dbff, a).strokePoints(f.pts, true);
      }
      return true;
    });

    const jg = this.joyG;
    jg.clear();
    if (this.joy) {
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy), m = l > 60 ? 60 / l : 1;
      jg.fillStyle(0xffffff, 0.12).fillCircle(this.joy.bx, this.joy.by, 60);
      jg.lineStyle(2, 0xffffff, 0.3).strokeCircle(this.joy.bx, this.joy.by, 60);
      jg.fillStyle(0xffffff, 0.45).fillCircle(this.joy.bx + jx * m, this.joy.by + jy * m, 26);
    } else if (this.touchSeen && !this.paused && !this.over) {
      jg.lineStyle(2, 0xffffff, 0.15).strokeCircle(100, this.scale.height - 110, 60);
    }

    this.hud.update({
      hp: this.hp, maxHp: this.stats.maxHp, energy: this.energy, energyMax: this.stats.energyMax,
      xp: this.xp, xpNext: this.xpNext(), time: this.elapsed, kills: this.kills, level: this.level,
    });
  }
}

// ---------- Геометрия ----------
function cellKey(cx: number, cy: number) { return ((cx & 0xffff) << 16) | (cy & 0xffff); }

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const vx = x2 - x1, vy = y2 - y1;
  const l2 = vx * vx + vy * vy;
  let t = l2 ? ((px - x1) * vx + (py - y1) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

function polyArea(p: { x: number; y: number }[]) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
  return Math.abs(a / 2);
}

function pointInPoly(x: number, y: number, p: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i].y > y) !== (p[j].y > y) && x < ((p[j].x - p[i].x) * (y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) inside = !inside;
  }
  return inside;
}

function jagged(x1: number, y1: number, x2: number, y2: number) {
  const out = [x1, y1];
  const n = 5;
  for (let i = 1; i < n; i++) {
    out.push(x1 + ((x2 - x1) * i) / n + (Math.random() - 0.5) * 18, y1 + ((y2 - y1) * i) / n + (Math.random() - 0.5) * 18);
  }
  out.push(x2, y2);
  return out;
}
