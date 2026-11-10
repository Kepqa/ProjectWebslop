import Phaser from 'phaser';
import { Hud } from './hud';
import { UPGRADES, computeStats, type Levels, type Stats, type UpgradeDef } from './upgrades';
import { S, ZLOOK, makeTextures, zOrigin, type ZType } from './textures';
import { World, FlowField, TILE, CH, CPX, K_CRATE, K_FLOOR, key2, drawChunk, type Body } from './world';

interface ZDef { hp: number; speed: number; dmg: number; xp: number; heavy?: boolean; boss?: string }

const ZDEF: Record<ZType, ZDef> = {
  walker: { hp: 4, speed: 58, dmg: 9, xp: 1 },
  runner: { hp: 3, speed: 128, dmg: 7, xp: 1 },
  spitter: { hp: 6, speed: 52, dmg: 8, xp: 2 },
  charger: { hp: 14, speed: 66, dmg: 16, xp: 3 },
  brute: { hp: 40, speed: 46, dmg: 22, xp: 6, heavy: true },
  colossus: { hp: 300, speed: 44, dmg: 30, xp: 0, heavy: true, boss: 'Гнилой Колосс' },
  brood: { hp: 230, speed: 38, dmg: 24, xp: 0, heavy: true, boss: 'Матка Роя' },
};

const PLAYER_R = 15;
const PLAYER_SPEED = 195;
const SWIPE_MIN_SPEED = 0.45; // CSS px/мс — медленнее не режет
const SWIPE_COST = 0.035; // энергии на CSS-пиксель
const RUNE_COST = 12;
const CELL = 64;
const MAX_ZOMBIES = 550;
const SLAM_R = 180;

interface Zombie extends Body {
  type: ZType; hp: number; maxHp: number; speed: number; r: number; dmg: number; xp: number;
  img: Phaser.GameObjects.Image; flash: number; slowUntil: number; slowMul: number; boneCd: number; dead: boolean;
  phase: number; kx: number; ky: number; spawnT: number;
  state: 'walk' | 'windup' | 'dash' | 'stun' | 'slam'; stateT: number; dirX: number; dirY: number; cd1: number; cd2: number;
  heavy: boolean; boss: string | null;
}
interface Proj { x: number; y: number; vx: number; vy: number; life: number; dmg: number; img: Phaser.GameObjects.Image; dead: boolean }
interface Gem { x: number; y: number; value: number; chest: boolean; img: Phaser.GameObjects.Image; pulled: boolean; t: number }
interface Seg { x1: number; y1: number; x2: number; y2: number; born: number; kind: 'blade' | 'dull' | 'echo'; width: number }
interface BurnSeg { x1: number; y1: number; x2: number; y2: number; until: number; width: number }
interface Stroke {
  pts: { x: number; y: number }[]; hit: Map<Zombie, number>; crates: Set<number>; kills: number; blasts: number;
  lastSX: number; lastSY: number; lastT: number; segs: Seg[]; loopStart: number;
}
type Fx =
  | { kind: 'ring'; x: number; y: number; r: number; color: number; born: number; life: number; width?: number }
  | { kind: 'bolt'; pts: number[]; born: number; life: number }
  | { kind: 'poly'; pts: { x: number; y: number }[]; born: number; life: number; color: number };
type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

export class GameScene extends Phaser.Scene {
  private hud!: Hud;
  private levels: Levels = {};
  private stats!: Stats;
  private world!: World;
  private field = new FlowField();
  private dpr = 1;
  private worldZoom = 1;

  private pl: Body = { x: 0, y: 0, lvl: 0 };
  private hp = 100; private inv = 0; private hurtT = 0; private moving = 0; private bob = 0;
  private energy = 100;
  private xp = 0; private level = 1; private pendingLevels = 0;
  private kills = 0; private killsForHeal = 0;
  private elapsed = 0; private spawnAcc = 0; private nextHorde = 45; private hordeN = 0;
  private nextBoss = 90; private bossCount = 0; private hitstop = 0;
  private paused = false; private over = false;
  private fieldTx = 1e9; private fieldTy = 1e9; private fieldAt = -1; private fieldDirty = true; private chunkAt = -1;

  private zombies: Zombie[] = [];
  private projs: Proj[] = [];
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
  private chunkGfx = new Map<number, { g: Phaser.GameObjects.Graphics; crates: number[] }>();
  private crateImgs = new Map<number, Phaser.GameObjects.Image>();

  private playerImg!: Phaser.GameObjects.Image;
  private trailG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private boneImgs: Phaser.GameObjects.Image[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pGore!: Emitter; private pSpark!: Emitter; private pDust!: Emitter;
  private pWood!: Emitter; private pAcid!: Emitter; private pMagic!: Emitter;

  constructor() { super('game'); }

  create() {
    this.resetState();
    if (location.search.includes('debug')) (window as unknown as { scene: GameScene }).scene = this;
    makeTextures(this);
    this.dpr = (this.registry.get('dpr') as number) || 1;
    this.world = new World((Math.random() * 1e9) | 0);
    this.hud = new Hud();
    this.hud.show();
    this.hud.setItems(this.levels);
    this.hud.setBoss(null);

    this.playerImg = this.add.image(0, 0, 'player').setScale(1 / S).setDepth(5).setOrigin(22 / 46, 0.5);
    this.trailG = this.add.graphics().setDepth(7);
    this.fxG = this.add.graphics().setDepth(8);

    const em = (cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, tex = 'dot') =>
      this.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(9);
    this.pGore = em({ speed: { min: 60, max: 280 }, lifespan: { min: 250, max: 600 }, scale: { start: 0.55, end: 0 }, tint: [0x8c2f39, 0x5c1a22, 0x6b8f3a, 0xa61e4d] });
    this.pSpark = em({ speed: { min: 120, max: 380 }, lifespan: { min: 120, max: 320 }, scale: { start: 0.35, end: 0 }, tint: [0xffffff, 0xc5f6fa, 0x66d9e8], blendMode: 'ADD' });
    this.pDust = em({ speed: { min: 30, max: 140 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.5, end: 0 }, tint: [0x868e96, 0x5c5f66, 0x495057] });
    this.pWood = em({ speed: { min: 90, max: 300 }, lifespan: { min: 350, max: 650 }, rotate: { min: 0, max: 360 }, scale: { start: 0.7, end: 0.3 }, tint: [0x9c6b3a, 0x7a4f28, 0xc08a50] }, 'chip');
    this.pAcid = em({ speed: { min: 40, max: 200 }, lifespan: { min: 250, max: 500 }, scale: { start: 0.5, end: 0 }, tint: [0xc0eb75, 0x94d82d, 0x5c940d] });
    this.pMagic = em({ speed: { min: 150, max: 420 }, lifespan: { min: 400, max: 800 }, scale: { start: 0.6, end: 0 }, tint: [0xb197fc, 0xffd43b, 0xffffff], blendMode: 'ADD' });

    this.cameras.main.startFollow(this.playerImg, false, 1, 1);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyZoom, this));

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.addPointer(3);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    this.updateField(true);
    this.manageChunks();
  }

  private resetState() {
    this.levels = {};
    this.stats = computeStats(this.levels);
    this.pl = { x: 0, y: 0, lvl: 0 };
    this.hp = this.stats.maxHp; this.inv = 0; this.hurtT = 0; this.moving = 0; this.bob = 0;
    this.energy = this.stats.energyMax;
    this.xp = 0; this.level = 1; this.pendingLevels = 0;
    this.kills = 0; this.killsForHeal = 0;
    this.elapsed = 0; this.spawnAcc = 0; this.nextHorde = 45; this.hordeN = 0;
    this.nextBoss = 90; this.bossCount = 0; this.hitstop = 0;
    this.paused = false; this.over = false;
    this.fieldTx = 1e9; this.fieldTy = 1e9; this.fieldAt = -1; this.fieldDirty = true; this.chunkAt = -1;
    this.zombies = []; this.projs = []; this.gems = []; this.segs = []; this.burns = []; this.fx = [];
    this.splats = []; this.timers = []; this.boneImgs = [];
    this.strokes.clear(); this.joy = null;
    this.chunkGfx.clear(); this.crateImgs.clear();
  }

  private applyZoom() {
    const w = window.innerWidth, h = window.innerHeight;
    this.worldZoom = Phaser.Math.Clamp(Math.min(w, h) / 760, 0.55, 1.15);
    this.cameras.main.setZoom(this.worldZoom * this.dpr);
    this.chunkAt = -1;
  }

  private get dmgScale() { return 1 + this.elapsed / 240; }
  private get hpScale() { return 1 + this.elapsed / 100; }

  // ---------- Ввод (координаты ввода переводим в CSS-пиксели) ----------
  private inJoyZone(x: number, y: number) {
    const w = window.innerWidth, h = window.innerHeight;
    return w > h ? x < w * 0.4 : x < w * 0.55 && y > h * 0.5;
  }
  private joyR() { return Phaser.Math.Clamp(Math.min(window.innerWidth, window.innerHeight) * 0.11, 44, 70); }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.paused || this.over) return;
    const sx = p.x / this.dpr, sy = p.y / this.dpr;
    if (p.wasTouch) this.touchSeen = true;
    if (p.wasTouch && !this.joy && this.inJoyZone(sx, sy)) {
      this.joy = { id: p.id, bx: sx, by: sy, x: sx, y: sy };
      return;
    }
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    this.strokes.set(p.id, {
      pts: [{ x: w.x, y: w.y }], hit: new Map(), crates: new Set(), kills: 0, blasts: 0,
      lastSX: sx, lastSY: sy, lastT: performance.now(), segs: [], loopStart: 0,
    });
  }

  private onMove(p: Phaser.Input.Pointer) {
    const sx = p.x / this.dpr, sy = p.y / this.dpr;
    if (this.joy && p.id === this.joy.id) { this.joy.x = sx; this.joy.y = sy; return; }
    const s = this.strokes.get(p.id);
    if (!s || this.paused || this.over) return;
    const now = performance.now();
    const d = Math.hypot(sx - s.lastSX, sy - s.lastSY);
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
      if (Math.random() < 0.5) this.pSpark.explode(1, w.x, w.y);
      if (this.stats.burnDur > 0 && this.burns.length < 500) {
        this.burns.push({ x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, until: this.elapsed + this.stats.burnDur, width: seg.width });
      }
    }
    s.pts.push({ x: w.x, y: w.y });
    s.lastSX = sx; s.lastSY = sy; s.lastT = now;
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
      this.dropGem(last.x, last.y, Math.floor((s.kills * s.kills) / 4), false);
      this.floatText(last.x, last.y - 20, `КОМБО x${s.kills}`, s.kills >= 8 ? '#ff922b' : '#ffd43b', s.kills >= 8 ? 30 : 22);
      if (s.kills >= 6) this.hitstop = 0.06;
    }
    if (this.stats.echoMul > 0 && s.segs.length) {
      const segs = s.segs.slice();
      const dmg = this.stats.bladeDamage * this.stats.echoMul;
      this.timers.push({
        at: this.elapsed + 0.3,
        fn: () => {
          const hit = new Map<Zombie, number>();
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
  private bladeHit(seg: Seg, hit: Map<Zombie, number>, dmg: number, stroke: Stroke | null) {
    const hw = seg.width / 2;
    const ang = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    const m = hw + 50;
    for (const z of this.queryRect(Math.min(seg.x1, seg.x2) - m, Math.min(seg.y1, seg.y2) - m, Math.max(seg.x1, seg.x2) + m, Math.max(seg.y1, seg.y2) + m)) {
      if (z.dead) continue;
      const last = hit.get(z);
      // крупных можно «пилить» одним свайпом, мелких — один удар за свайп
      if (last !== undefined && (!z.heavy || this.elapsed - last < 0.12)) continue;
      if (distToSeg(z.x, z.y, seg.x1, seg.y1, seg.x2, seg.y2) > hw + z.r) continue;
      hit.set(z, this.elapsed);
      this.slow(z);
      this.pGore.explode(z.heavy ? 5 : 3, z.x, z.y);
      if (this.damage(z, dmg, ang, 220)) {
        if (!stroke) continue;
        stroke.kills++;
        if (Math.random() < this.stats.chainChance) this.chain(z);
        if (stroke.kills >= (stroke.blasts + 1) * this.stats.comboThreshold) {
          stroke.blasts++;
          this.explode(z.x, z.y);
        }
      }
    }
    // Кислотные плевки можно разрубить
    for (const p of this.projs) {
      if (!p.dead && distToSeg(p.x, p.y, seg.x1, seg.y1, seg.x2, seg.y2) < hw + 10) {
        p.dead = true; p.img.destroy();
        this.pSpark.explode(8, p.x, p.y); this.pAcid.explode(6, p.x, p.y);
        this.energy = Math.min(this.stats.energyMax, this.energy + 3);
      }
    }
    if (!stroke) return;
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const n = Math.max(1, Math.ceil(len / 12));
    for (let i = 0; i <= n; i++) {
      const x = seg.x1 + ((seg.x2 - seg.x1) * i) / n, y = seg.y1 + ((seg.y2 - seg.y1) * i) / n;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), k = key2(tx, ty);
      if (stroke.crates.has(k) || this.world.kind(tx, ty) !== K_CRATE) continue;
      stroke.crates.add(k);
      this.hitCrate(tx, ty);
    }
  }

  private hitCrate(tx: number, ty: number) {
    const k = key2(tx, ty);
    const hp = (this.world.crateHp.get(k) ?? 3) - 1;
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    const img = this.crateImgs.get(k);
    if (hp > 0) {
      this.world.crateHp.set(k, hp);
      this.pWood.explode(4, cx, cy);
      if (img) {
        img.setTint(hp === 1 ? 0x9a7f6a : 0xc9b3a0);
        this.tweens.add({ targets: img, x: cx + 4, duration: 40, yoyo: true, repeat: 1, onComplete: () => img.setX(cx) });
      }
      return;
    }
    this.world.crateHp.delete(k);
    this.world.setKind(tx, ty, K_FLOOR);
    img?.destroy(); this.crateImgs.delete(k);
    this.pWood.explode(16, cx, cy); this.pDust.explode(6, cx, cy);
    this.fieldDirty = true;
    const r = Math.random();
    if (r < 0.06) this.dropGem(cx, cy, 0, true);
    else if (r < 0.45) this.dropGem(cx, cy, 2, false);
  }

  private slow(z: Zombie) {
    z.slowUntil = this.elapsed + this.stats.frostDur;
    z.slowMul = z.boss ? Math.max(0.6, this.stats.frostSlow) : this.stats.frostSlow;
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
      this.pSpark.explode(4, best.x, best.y);
      visited.add(best);
      this.damage(best, this.stats.chainDmg);
      cur = best;
    }
  }

  private explode(x: number, y: number) {
    const r = this.stats.comboRadius;
    this.fx.push({ kind: 'ring', x, y, r, color: 0xff922b, born: this.elapsed, life: 0.35 });
    this.pSpark.explode(20, x, y); this.pDust.explode(10, x, y);
    this.cameras.main.shake(120, 0.004);
    for (const z of this.queryRect(x - r, y - r, x + r, y + r)) {
      if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (r + z.r) ** 2) this.damage(z, this.stats.comboDmg, Math.atan2(z.y - y, z.x - x), 300);
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
    this.fx.push({ kind: 'poly', pts: poly, born: this.elapsed, life: 0.5, color: 0xb197fc });
    for (let i = 0; i < poly.length; i += 3) this.pMagic.explode(1, poly[i].x, poly[i].y);
    if (caught >= 5) this.floatText((x1 + x2) / 2, (y1 + y2) / 2, `ПЕЧАТЬ x${caught}`, '#d0bfff', 24);
  }

  /** @returns true если зомби убит */
  private damage(z: Zombie, amount: number, ang?: number, knock = 0): boolean {
    if (z.dead) return false;
    z.hp -= amount;
    z.flash = 0.08;
    if (ang !== undefined && knock && !z.heavy) { z.kx += Math.cos(ang) * knock; z.ky += Math.sin(ang) * knock; }
    if (z.hp > 0) return false;
    this.kill(z, ang);
    return true;
  }

  private kill(z: Zombie, sliceAngle?: number) {
    z.dead = true;
    this.kills++;
    z.img.destroy();
    const big = z.r >= 26;
    this.pGore.explode(big ? 24 : 9, z.x, z.y);
    this.addSplat(z.x, z.y, z.r);
    if (z.boss) {
      this.hitstop = 0.18;
      this.cameras.main.shake(400, 0.015);
      this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: 220, color: 0xffd43b, born: this.elapsed, life: 0.6, width: 6 });
      this.pMagic.explode(40, z.x, z.y);
      this.dropGem(z.x - 20, z.y, 0, true); this.dropGem(z.x + 20, z.y, 0, true);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; this.dropGem(z.x + Math.cos(a) * 60, z.y + Math.sin(a) * 60, 3, false); }
      this.hud.toast(`🏆 ${z.boss} повержен!`, 2200);
    } else if (z.type === 'brute') {
      this.cameras.main.shake(140, 0.005);
      this.dropGem(z.x, z.y, 0, true);
      this.dropGem(z.x + 14, z.y, z.xp, false);
    } else {
      this.dropGem(z.x, z.y, z.xp, false);
    }
    if (sliceAngle !== undefined && !z.boss) this.sliceFx(z, sliceAngle);
    else this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: z.r + 8, color: ZLOOK[z.type].color, born: this.elapsed, life: 0.2 });
    if (this.stats.healEvery && ++this.killsForHeal >= this.stats.healEvery) {
      this.killsForHeal = 0;
      this.hp = Math.min(this.stats.maxHp, this.hp + 4);
    }
  }

  private sliceFx(z: Zombie, ang: number) {
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const sc = (1 + 0.07 * z.lvl) / S;
    for (const side of [1, -1]) {
      const h = this.add.image(z.x, z.y, `${z.type}_half`).setRotation(side === 1 ? ang : ang + Math.PI).setDepth(4.6).setScale(sc);
      this.tweens.add({
        targets: h, x: z.x + nx * side * 34 + Math.cos(ang) * 22, y: z.y + ny * side * 34 + Math.sin(ang) * 22,
        rotation: h.rotation + side * 0.9, alpha: 0, scale: sc * 0.85, duration: 480, ease: 'Cubic.easeOut', onComplete: () => h.destroy(),
      });
    }
  }

  private addSplat(x: number, y: number, r: number) {
    const s = this.add.image(x, y, 'splat').setDepth(1).setRotation(Math.random() * 6.28).setScale(0).setAlpha(0.75);
    this.tweens.add({ targets: s, scale: r / 14 / S, duration: 160, ease: 'Back.easeOut' });
    this.splats.push(s);
    if (this.splats.length > 140) this.splats.shift()!.destroy();
  }

  private dropGem(x: number, y: number, value: number, chest: boolean) {
    if (!chest && value <= 0) return;
    const img = this.add.image(x, y, chest ? 'chest' : 'gem').setDepth(2).setScale(0);
    const sc = (chest ? 1 : value >= 5 ? 1.5 : 1) / S;
    if (!chest && value >= 5) img.setTint(0xb197fc);
    this.tweens.add({ targets: img, scale: sc, duration: 220, ease: 'Back.easeOut' });
    this.gems.push({ x, y, value, chest, img, pulled: false, t: Math.random() * 6 });
  }

  private floatText(x: number, y: number, text: string, color: string, size = 22) {
    const t = this.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, fontStyle: '900', color, stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5).setDepth(15).setResolution(2).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: y - 55, alpha: 0, delay: 250, duration: 750, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  private hurt(amount: number) {
    if (this.inv > 0) return;
    this.hp -= amount;
    this.inv = 0.6; this.hurtT = 0.25;
    this.cameras.main.shake(110, 0.007);
    this.cameras.main.flash(90, 140, 0, 0);
    this.pGore.explode(6, this.pl.x, this.pl.y);
  }

  // ---------- Враги: спаун ----------
  private findSpawn(extra = 0, at?: { x: number; y: number }, angle?: number) {
    const R = Math.hypot(window.innerWidth, window.innerHeight) / 2 / this.worldZoom + 60 + extra;
    for (let i = 0; i < 10; i++) {
      let x: number, y: number;
      if (at) { const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 50; x = at.x + Math.cos(a) * d; y = at.y + Math.sin(a) * d; }
      else { const a = (angle ?? Math.random() * Math.PI * 2) + (i ? (Math.random() - 0.5) * 0.6 : 0); x = this.pl.x + Math.cos(a) * R; y = this.pl.y + Math.sin(a) * R; }
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (this.world.solid(tx, ty)) continue;
      if (this.field.distAt(x, y) === FlowField.INF) continue;
      return { x, y, lvl: this.world.levelOf(tx, ty) };
    }
    return null;
  }

  private spawnZombie(type: ZType, opts: { angle?: number; extra?: number; at?: { x: number; y: number } } = {}): Zombie | null {
    if (this.zombies.length >= MAX_ZOMBIES && !ZDEF[type].boss) return null;
    const pos = this.findSpawn(opts.extra, opts.at, opts.angle);
    if (!pos) return null;
    const d = ZDEF[type];
    const img = this.add.image(pos.x, pos.y, type).setOrigin(zOrigin(type), 0.5).setDepth(d.boss ? 4.5 : 4).setScale(0);
    const hp = d.hp * this.hpScale * (d.boss ? 1 + 0.6 * this.bossCount : 1);
    const z: Zombie = {
      type, x: pos.x, y: pos.y, lvl: pos.lvl, hp, maxHp: hp, speed: d.speed * (0.9 + Math.random() * 0.2), r: ZLOOK[type].r,
      dmg: d.dmg, xp: d.xp, img, flash: 0, slowUntil: 0, slowMul: 1, boneCd: 0, dead: false,
      phase: Math.random() * 6, kx: 0, ky: 0, spawnT: 0.45, state: 'walk', stateT: 0, dirX: 0, dirY: 0,
      cd1: 1.5 + Math.random() * 2, cd2: 3 + Math.random() * 2, heavy: !!d.heavy, boss: d.boss ?? null,
    };
    this.zombies.push(z);
    if (opts.at || d.boss) this.pDust.explode(d.boss ? 30 : 5, pos.x, pos.y);
    return z;
  }

  private pickType(): ZType {
    const t = this.elapsed;
    const w: [ZType, number][] = [
      ['walker', 1],
      ['runner', t > 25 ? Math.min(0.35, (t - 25) / 120) : 0],
      ['spitter', t > 45 ? Math.min(0.16, (t - 45) / 250) : 0],
      ['charger', t > 70 ? Math.min(0.13, (t - 70) / 300) : 0],
      ['brute', t > 55 ? Math.min(0.09, 0.02 + (t - 55) / 1000) : 0],
    ];
    let r = Math.random() * w.reduce((a, b) => a + b[1], 0);
    for (const [k, v] of w) if ((r -= v) <= 0) return k;
    return 'walker';
  }

  private spawn(dt: number) {
    const t = this.elapsed;
    const rate = Math.min(45, 1.6 + t / 8 + (t / 60) ** 2 * 1.5);
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawnZombie(this.pickType()); }

    if (t >= this.nextHorde) {
      this.nextHorde += 45;
      this.hordeN++;
      this.hud.toast('🧟 ОРДА! Держи проход или обведи печатью!');
      const n = 28 + this.hordeN * 10;
      for (let i = 0; i < n; i++) {
        const type: ZType = i % 14 === 0 && this.hordeN > 1 ? 'brute' : i % 9 === 0 && this.hordeN > 2 ? 'charger' : i % 3 === 0 ? 'runner' : 'walker';
        this.spawnZombie(type, { angle: (i / n) * Math.PI * 2, extra: 60 });
      }
    }
    if (t >= this.nextBoss) {
      this.nextBoss += 90;
      const type: ZType = this.bossCount % 2 === 0 ? 'colossus' : 'brood';
      if (this.spawnZombie(type, { extra: 20 })) {
        this.bossCount++;
        this.hud.toast(`☠️ БОСС: ${ZDEF[type].boss}`, 2400);
        this.cameras.main.shake(500, 0.006);
      }
    }
  }

  // ---------- Пространственная сетка ----------
  private buildGrid() {
    this.grid.clear();
    for (const z of this.zombies) {
      if (z.dead) continue;
      const k = key2(Math.floor(z.x / CELL), Math.floor(z.y / CELL));
      const b = this.grid.get(k);
      if (b) b.push(z); else this.grid.set(k, [z]);
    }
  }

  private queryRect(x1: number, y1: number, x2: number, y2: number): Zombie[] {
    const out: Zombie[] = [];
    const cx1 = Math.floor(x1 / CELL), cy1 = Math.floor(y1 / CELL), cx2 = Math.floor(x2 / CELL), cy2 = Math.floor(y2 / CELL);
    for (let cx = cx1; cx <= cx2; cx++) for (let cy = cy1; cy <= cy2; cy++) {
      const b = this.grid.get(key2(cx, cy));
      if (b) for (const z of b) out.push(z);
    }
    return out;
  }

  // ---------- Карта ----------
  private updateField(force = false) {
    const tx = Math.floor(this.pl.x / TILE), ty = Math.floor(this.pl.y / TILE);
    if (!force && tx === this.fieldTx && ty === this.fieldTy && !this.fieldDirty) return;
    if (!force && this.elapsed - this.fieldAt < 0.12) return;
    this.field.compute(this.world, tx, ty);
    this.fieldTx = tx; this.fieldTy = ty; this.fieldAt = this.elapsed; this.fieldDirty = false;
  }

  private manageChunks() {
    const cam = this.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const x0 = this.pl.x - vw / 2 - 120, x1 = this.pl.x + vw / 2 + 120, y0 = this.pl.y - vh / 2 - 120, y1 = this.pl.y + vh / 2 + 120;
    const cx0 = Math.floor(x0 / CPX), cx1 = Math.floor(x1 / CPX), cy0 = Math.floor(y0 / CPX), cy1 = Math.floor(y1 / CPX);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = key2(cx, cy);
      if (this.chunkGfx.has(k)) continue;
      const g = this.add.graphics().setDepth(0);
      drawChunk(g, this.world, cx, cy);
      const crates: number[] = [];
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
        const tx = cx * CH + x, ty = cy * CH + y;
        if (this.world.kind(tx, ty) !== K_CRATE) continue;
        const ck = key2(tx, ty);
        const hp = this.world.crateHp.get(ck) ?? 3;
        const img = this.add.image((tx + 0.5) * TILE, (ty + 0.5) * TILE, 'crate').setScale(1 / S).setDepth(3);
        if (hp < 3) img.setTint(hp === 1 ? 0x9a7f6a : 0xc9b3a0);
        this.crateImgs.set(ck, img);
        crates.push(ck);
      }
      this.chunkGfx.set(k, { g, crates });
    }
    for (const [k, c] of this.chunkGfx) {
      const cx = (k << 0) >> 16, cy = (k << 16) >> 16;
      if (cx >= cx0 - 1 && cx <= cx1 + 1 && cy >= cy0 - 1 && cy <= cy1 + 1) continue;
      c.g.destroy();
      for (const ck of c.crates) { this.crateImgs.get(ck)?.destroy(); this.crateImgs.delete(ck); }
      this.chunkGfx.delete(k);
    }
  }

  // ---------- Главный цикл ----------
  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.paused || this.over) { this.draw(); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; this.draw(); return; }
    this.elapsed += dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.elapsed) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }

    this.movePlayer(dt);
    this.updateField();
    this.energy = Math.min(this.stats.energyMax, this.energy + this.stats.energyRegen * dt);
    this.spawn(dt);
    this.buildGrid();
    for (const z of this.zombies) if (!z.dead) this.updateZombie(z, dt);
    this.updateProjs(dt);
    this.trinkets(dt);
    this.burnTrails(dt);
    this.collectGems(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);
    if (this.elapsed - this.chunkAt > 0.25) { this.chunkAt = this.elapsed; this.manageChunks(); }

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
      const l = Math.hypot(jx, jy), R = this.joyR();
      if (l > 6) { const m = Math.min(1, l / R); dx = (jx / l) * m; dy = (jy / l) * m; }
    }
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    const sp = PLAYER_SPEED * this.stats.speedMul;
    this.pl.x += dx * sp * dt; this.pl.y += dy * sp * dt;
    this.world.resolve(this.pl, PLAYER_R);
    this.world.updateLevel(this.pl);
    this.moving = Math.min(1, l);
    if (l > 0.05) { this.playerImg.setRotation(Math.atan2(dy, dx)); this.bob += dt * 14 * this.moving; }
    const sc = ((1 + 0.07 * this.pl.lvl) * (1 + Math.sin(this.bob) * 0.05 * this.moving)) / S;
    this.playerImg.setPosition(this.pl.x, this.pl.y).setScale(sc);
    this.inv = Math.max(0, this.inv - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.playerImg.setAlpha(this.inv > 0 && Math.floor(this.inv * 20) % 2 === 0 ? 0.45 : 1);
    if (this.hurtT > 0) this.playerImg.setTint(0xff6b6b); else this.playerImg.clearTint();
  }

  private updateZombie(z: Zombie, dt: number) {
    const lift = 1 + 0.07 * z.lvl;
    if (z.spawnT > 0) {
      z.spawnT -= dt;
      const k = Math.max(0, 1 - z.spawnT / 0.45);
      z.img.setPosition(z.x, z.y).setScale((lift * Phaser.Math.Easing.Back.Out(k)) / S).setAlpha(Math.min(1, k * 2));
      return;
    }
    const pl = this.pl;
    const dx = pl.x - z.x, dy = pl.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const slow = z.slowUntil > this.elapsed ? z.slowMul : 1;
    let mx = 0, my = 0, sp = z.speed * slow;
    const steer = () => {
      const n = d > 70 ? this.field.next(z.x, z.y) : null;
      if (n) { const ex = n.x - z.x, ey = n.y - z.y, el = Math.hypot(ex, ey) || 1; mx = ex / el; my = ey / el; }
      else { mx = dx / d; my = dy / d; }
    };

    // Далеко отставших переносим вперёд, чтобы давление не пропадало
    const far = Math.hypot(window.innerWidth, window.innerHeight) / this.worldZoom * 1.1 + 200;
    if (d > far) {
      const p = this.findSpawn(40);
      if (p) { z.x = p.x; z.y = p.y; z.lvl = p.lvl; z.state = 'walk'; }
      return;
    }

    switch (z.type) {
      case 'charger':
        z.stateT -= dt;
        if (z.state === 'walk') {
          steer();
          z.cd1 -= dt;
          if (z.cd1 <= 0 && d < 330 && Math.abs(z.lvl - pl.lvl) < 0.1 && this.world.clearLine(z.x, z.y, pl.x, pl.y, z.lvl)) {
            z.state = 'windup'; z.stateT = 0.65; z.dirX = dx / d; z.dirY = dy / d;
          }
        } else if (z.state === 'windup') {
          sp = 0;
          if (z.stateT <= 0) { z.state = 'dash'; z.stateT = 0.5; }
        } else if (z.state === 'dash') {
          mx = z.dirX; my = z.dirY; sp = 560 * slow;
          if (Math.random() < 0.5) this.pDust.explode(1, z.x, z.y);
          if (z.stateT <= 0) { z.state = 'walk'; z.cd1 = 2.5 + Math.random(); }
        } else {
          sp = 0;
          if (z.stateT <= 0) { z.state = 'walk'; z.cd1 = 1.5; }
        }
        break;
      case 'spitter':
        steer();
        if (d < 200) { mx = -dx / d; my = -dy / d; sp *= 0.7; } else if (d < 300) sp = 0;
        z.cd1 -= dt;
        if (z.cd1 <= 0 && d < 430) { z.cd1 = 2.3 + Math.random(); this.shoot(z, 0); z.flash = 0.05; }
        break;
      case 'colossus':
        if (z.state === 'slam') {
          sp = 0; z.stateT -= dt;
          if (z.stateT <= 0) { this.slam(z); z.state = 'walk'; }
        } else {
          steer();
          z.cd1 -= dt; z.cd2 -= dt;
          if (z.cd1 <= 0 && d < SLAM_R + 60) { z.state = 'slam'; z.stateT = 0.9; z.cd1 = 3.6; }
          if (z.cd2 <= 0) { z.cd2 = 7; this.summon(z, 'walker', 6); }
        }
        break;
      case 'brood':
        steer();
        z.cd2 -= dt; z.cd1 -= dt;
        if (z.cd2 <= 0) { z.cd2 = 2.6; this.summon(z, 'runner', 3); }
        if (z.cd1 <= 0 && d < 480) { z.cd1 = 3; for (let i = -2; i <= 2; i++) this.shoot(z, i * 0.22); }
        break;
      default:
        steer();
    }

    z.x += mx * sp * dt + z.kx * dt;
    z.y += my * sp * dt + z.ky * dt;
    const kd = Math.exp(-10 * dt);
    z.kx *= kd; z.ky *= kd;

    // Расталкивание соседей (тяжёлые толкают лёгких)
    const cx = Math.floor(z.x / CELL), cy = Math.floor(z.y / CELL);
    const span = z.r > 30 ? 2 : 1;
    for (let ix = cx - span; ix <= cx + span; ix++) for (let iy = cy - span; iy <= cy + span; iy++) {
      const b = this.grid.get(key2(ix, iy));
      if (!b) continue;
      for (const o of b) {
        if (o === z || o.dead) continue;
        const ox = z.x - o.x, oy = z.y - o.y;
        const min = z.r + o.r - 2;
        const dd = ox * ox + oy * oy;
        if (dd >= min * min || dd < 0.01) continue;
        const dist = Math.sqrt(dd);
        const push = ((min - dist) / dist) * 0.5 * (o.r / (z.r + o.r));
        z.x += ox * push; z.y += oy * push;
      }
    }

    const hitWall = this.world.resolve(z, z.r);
    this.world.updateLevel(z);
    if (z.state === 'dash' && hitWall) {
      z.state = 'stun'; z.stateT = 0.9;
      this.pDust.explode(12, z.x, z.y);
      this.cameras.main.shake(80, 0.003);
    }

    if (d < z.r + PLAYER_R && Math.abs(z.lvl - pl.lvl) <= 0.5 && this.inv <= 0) this.hurt(z.dmg * this.dmgScale);

    // Анимация: покачивание при ходьбе, «дыхание», замах
    const moving = sp > 1;
    if (moving) z.phase += dt * (5 + sp * 0.035);
    const wob = moving ? Math.sin(z.phase) * 0.14 : 0;
    const rot = z.state === 'dash' || z.state === 'windup' ? Math.atan2(z.dirY, z.dirX)
      : moving ? Math.atan2(my, mx) : Math.atan2(dy, dx);
    let sc = lift * (1 + Math.sin(z.phase * 2) * 0.035);
    if (z.state === 'windup') sc *= 1 + Math.sin(this.elapsed * 45) * 0.07;
    if (z.state === 'slam') sc *= 1 + (0.9 - z.stateT) * 0.3;
    if (z.state === 'stun') sc *= 0.95;
    z.img.setPosition(z.x, z.y).setRotation(rot + wob).setScale(sc / S).setAlpha(1);
    if (z.flash > 0) { z.flash -= dt; z.img.setTintFill(0xffffff); }
    else if (z.state === 'windup' || z.state === 'slam') z.img.setTint(0xff8787);
    else if (z.slowUntil > this.elapsed) z.img.setTint(0x9fd4ff);
    else z.img.clearTint();
  }

  private shoot(z: Zombie, offset: number) {
    const a = Math.atan2(this.pl.y - z.y, this.pl.x - z.x) + offset;
    const sp = 240;
    const img = this.add.image(z.x, z.y, 'acid').setScale(1 / S).setDepth(6);
    this.projs.push({ x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 2.6, dmg: 9 * this.dmgScale, img, dead: false });
  }

  private slam(z: Zombie) {
    this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: SLAM_R, color: 0xff6b6b, born: this.elapsed, life: 0.4, width: 8 });
    this.cameras.main.shake(260, 0.012);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; this.pDust.explode(1, z.x + Math.cos(a) * SLAM_R * 0.8, z.y + Math.sin(a) * SLAM_R * 0.8); }
    if (Math.hypot(this.pl.x - z.x, this.pl.y - z.y) < SLAM_R + PLAYER_R) this.hurt(28 * this.dmgScale);
  }

  private summon(z: Zombie, type: ZType, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawnZombie(type, { at: { x: z.x + Math.cos(a) * (z.r + 26), y: z.y + Math.sin(a) * (z.r + 26) } });
    }
    this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: z.r + 40, color: 0xb197fc, born: this.elapsed, life: 0.4 });
  }

  private updateProjs(dt: number) {
    for (const p of this.projs) {
      if (p.dead) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.img.setPosition(p.x, p.y).setRotation(p.img.rotation + dt * 8).setScale((1 + Math.sin(p.life * 20) * 0.12) / S);
      if (p.life <= 0 || this.world.solidAtPx(p.x, p.y)) {
        p.dead = true; p.img.destroy(); this.pAcid.explode(8, p.x, p.y);
        continue;
      }
      if (Math.hypot(this.pl.x - p.x, this.pl.y - p.y) < PLAYER_R + 8) {
        p.dead = true; p.img.destroy(); this.pAcid.explode(10, p.x, p.y);
        this.hurt(p.dmg);
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }

  private trinkets(dt: number) {
    const s = this.stats;
    const { x: px, y: py } = this.pl;
    if (s.auraRadius > 0) {
      this.auraTick += dt;
      if (this.auraTick >= 0.5) {
        this.auraTick = 0;
        const r = s.auraRadius;
        for (const z of this.queryRect(px - r, py - r, px + r, py + r)) {
          if (!z.dead && (z.x - px) ** 2 + (z.y - py) ** 2 < (r + z.r) ** 2) this.damage(z, s.auraDps * 0.5);
        }
      }
    }
    while (this.boneImgs.length < s.bones) this.boneImgs.push(this.add.image(0, 0, 'bone').setDepth(6).setScale(1 / S));
    if (s.bones > 0) {
      this.boneAngle += dt * 3.2;
      const R = 85;
      this.boneImgs.forEach((img, i) => {
        const a = this.boneAngle + (i / s.bones) * Math.PI * 2;
        const bx = px + Math.cos(a) * R, by = py + Math.sin(a) * R;
        img.setPosition(bx, by).setRotation(a * 2);
        for (const z of this.queryRect(bx - 50, by - 50, bx + 50, by + 50)) {
          if (z.dead || z.boneCd > this.elapsed) continue;
          if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (z.r + 12) ** 2) {
            z.boneCd = this.elapsed + 0.4;
            this.pSpark.explode(3, bx, by);
            this.damage(z, s.boneDmg, a + Math.PI / 2, 150);
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
      const m = b.width / 2 + 50;
      for (const z of this.queryRect(Math.min(b.x1, b.x2) - m, Math.min(b.y1, b.y2) - m, Math.max(b.x1, b.x2) + m, Math.max(b.y1, b.y2) + m)) {
        if (z.dead || hitThisTick.has(z)) continue;
        if (distToSeg(z.x, z.y, b.x1, b.y1, b.x2, b.y2) <= b.width / 2 + z.r) { hitThisTick.add(z); this.damage(z, dmg); }
      }
    }
  }

  private collectGems(dt: number) {
    const R = this.stats.pickupRadius;
    for (const g of this.gems) {
      const dx = this.pl.x - g.x, dy = this.pl.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < R) g.pulled = true;
      g.t += dt;
      if (g.pulled) {
        const sp = (380 + g.t * 200) * dt;
        g.x += (dx / (d || 1)) * Math.min(sp, d); g.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      g.img.setPosition(g.x, g.y + (g.pulled ? 0 : Math.sin(g.t * 4) * 2.5));
      if (d < PLAYER_R + 6) {
        g.img.destroy();
        if (g.chest) { this.pWood.explode(12, g.x, g.y); this.pMagic.explode(16, g.x, g.y); this.openChest(); }
        else { this.pSpark.explode(2, g.x, g.y); this.gainXp(g.value); }
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
      this.pMagic.explode(30, this.pl.x, this.pl.y);
      this.fx.push({ kind: 'ring', x: this.pl.x, y: this.pl.y, r: 120, color: 0xb197fc, born: this.elapsed, life: 0.45, width: 5 });
    });
  }

  private gameOver() {
    this.over = true;
    this.strokes.clear(); this.joy = null;
    this.hud.setBoss(null);
    this.pGore.explode(30, this.pl.x, this.pl.y);
    this.playerImg.setVisible(false);
    const t = Math.floor(this.elapsed);
    this.hud.showGameOver(
      `Продержались <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>Убито зомби: <b>${this.kills}</b> · Уровень: <b>${this.level}</b> · Боссов: <b>${this.bossCount}</b>`,
      () => this.scene.restart(),
    );
  }

  // ---------- Отрисовка ----------
  private draw() {
    const tg = this.trailG;
    tg.clear();
    if (this.stats.auraRadius > 0) {
      const pulse = 1 + Math.sin(this.elapsed * 4) * 0.04;
      tg.fillStyle(0x9c36b5, 0.12).fillCircle(this.pl.x, this.pl.y, this.stats.auraRadius * pulse);
      tg.lineStyle(2, 0xcc5de8, 0.35).strokeCircle(this.pl.x, this.pl.y, this.stats.auraRadius * pulse);
    }
    for (const b of this.burns) {
      const a = Math.min(1, (b.until - this.elapsed) / 0.4) * (0.55 + Math.random() * 0.25);
      tg.lineStyle(b.width * 0.8, 0xff6b00, a * 0.5).lineBetween(b.x1, b.y1, b.x2, b.y2);
      tg.lineStyle(b.width * 0.3, 0xffd43b, a).lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
    this.segs = this.segs.filter((s) => {
      const life = s.kind === 'dull' ? 0.15 : s.kind === 'echo' ? 0.25 : 0.22;
      const age = this.elapsed - s.born;
      if (age > life && !this.paused) return false;
      const a = Math.max(0, 1 - age / life);
      if (s.kind === 'dull') {
        tg.lineStyle(3, 0x868e96, a * 0.6).lineBetween(s.x1, s.y1, s.x2, s.y2);
      } else {
        const glow = s.kind === 'echo' ? 0xb197fc : 0x66d9e8;
        tg.lineStyle(s.width * 1.3 * a, glow, a * 0.18).lineBetween(s.x1, s.y1, s.x2, s.y2);
        tg.lineStyle(s.width * a, glow, a * 0.4).lineBetween(s.x1, s.y1, s.x2, s.y2);
        tg.lineStyle(Math.max(2, s.width * 0.3 * a), 0xffffff, a).lineBetween(s.x1, s.y1, s.x2, s.y2);
      }
      return true;
    });

    const fg = this.fxG;
    fg.clear();
    // Предупреждения об атаках
    let boss: Zombie | null = null;
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (z.boss && !boss) boss = z;
      if (z.state === 'windup') {
        const a = 0.35 + Math.sin(this.elapsed * 30) * 0.2;
        fg.lineStyle(z.r * 1.4, 0xff6b6b, a * 0.4).lineBetween(z.x, z.y, z.x + z.dirX * 300, z.y + z.dirY * 300);
        fg.lineStyle(2, 0xff8787, a).lineBetween(z.x, z.y, z.x + z.dirX * 300, z.y + z.dirY * 300);
      } else if (z.state === 'slam') {
        const k = 1 - z.stateT / 0.9;
        fg.fillStyle(0xff6b6b, 0.12 + k * 0.15).fillCircle(z.x, z.y, SLAM_R * k);
        fg.lineStyle(3, 0xff6b6b, 0.8).strokeCircle(z.x, z.y, SLAM_R);
      }
    }
    this.hud.setBoss(boss ? boss.boss : null, boss ? boss.hp / boss.maxHp : 0);

    this.fx = this.fx.filter((f) => {
      const t = (this.elapsed - f.born) / f.life;
      if (t >= 1) return false;
      const a = 1 - t;
      if (f.kind === 'ring') {
        const rr = f.r * (0.4 + Phaser.Math.Easing.Cubic.Out(t) * 0.6);
        fg.fillStyle(f.color, a * 0.22).fillCircle(f.x, f.y, rr);
        fg.lineStyle(f.width ?? 3, f.color, a).strokeCircle(f.x, f.y, rr);
      } else if (f.kind === 'bolt') {
        fg.lineStyle(5, 0x74c0fc, a * 0.4);
        fg.beginPath(); fg.moveTo(f.pts[0], f.pts[1]);
        for (let i = 2; i < f.pts.length; i += 2) fg.lineTo(f.pts[i], f.pts[i + 1]);
        fg.strokePath();
        fg.lineStyle(2, 0xfff3bf, a);
        fg.beginPath(); fg.moveTo(f.pts[0], f.pts[1]);
        for (let i = 2; i < f.pts.length; i += 2) fg.lineTo(f.pts[i], f.pts[i + 1]);
        fg.strokePath();
      } else {
        fg.fillStyle(f.color, a * 0.35).fillPoints(f.pts, true);
        fg.lineStyle(4 + t * 6, 0xe5dbff, a).strokePoints(f.pts, true);
      }
      return true;
    });

    if (this.joy) {
      const R = this.joyR();
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy), m = l > R ? R / l : 1;
      this.hud.setJoystick('active', this.joy.bx, this.joy.by, this.joy.bx + jx * m, this.joy.by + jy * m, R);
    } else if (this.touchSeen && !this.paused && !this.over) {
      const R = this.joyR(), w = window.innerWidth, h = window.innerHeight;
      if (w > h) this.hud.setJoystick('hint', R + 40, h - R - 40, 0, 0, R);
      else this.hud.setJoystick('hint', w * 0.27, h - R - 60, 0, 0, R);
    } else this.hud.setJoystick(null);

    this.hud.update({
      hp: this.hp, maxHp: this.stats.maxHp, energy: this.energy, energyMax: this.stats.energyMax,
      xp: this.xp, xpNext: this.xpNext(), time: this.elapsed, kills: this.kills, level: this.level,
    });
  }
}

// ---------- Геометрия ----------
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
