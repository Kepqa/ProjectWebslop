import Phaser from 'phaser';
import { Hud } from './hud';
import { sfx } from './sfx';
import { STAGES, STAGE_TIME, loadProgress, saveProgress, type StageDef } from './stages';
import { UPGRADES, computeStats, type Levels, type Stats, type UpgradeDef } from './upgrades';
import { S, ZLOOK, makeTextures, zOrigin, type ZType } from './textures';
import { World, FlowField, TILE, CH, CPX, K_CRATE, K_GRAVE, K_FLOOR, K_PIT, K_TOXIC, key2, drawChunk, type Body } from './world';

interface ZDef { hp: number; speed: number; dmg: number; xp: number; heavy?: boolean; boss?: string }

const ZDEF: Record<ZType, ZDef> = {
  walker: { hp: 4, speed: 58, dmg: 9, xp: 1 },
  runner: { hp: 3, speed: 128, dmg: 7, xp: 1 },
  spitter: { hp: 6, speed: 52, dmg: 8, xp: 2 },
  charger: { hp: 14, speed: 66, dmg: 16, xp: 3 },
  brute: { hp: 40, speed: 46, dmg: 22, xp: 6, heavy: true },
  jumper: { hp: 7, speed: 72, dmg: 10, xp: 2 },
  bomber: { hp: 5, speed: 88, dmg: 0, xp: 2 },
  shield: { hp: 14, speed: 50, dmg: 12, xp: 3 },
  ghost: { hp: 5, speed: 62, dmg: 8, xp: 2 },
  colossus: { hp: 300, speed: 44, dmg: 30, xp: 0, heavy: true, boss: 'Гнилой Колосс' },
  brood: { hp: 230, speed: 38, dmg: 24, xp: 0, heavy: true, boss: 'Матка Роя' },
  leaper: { hp: 260, speed: 50, dmg: 26, xp: 0, heavy: true, boss: 'Скакун-Титан' },
  necro: { hp: 220, speed: 55, dmg: 20, xp: 0, heavy: true, boss: 'Некромант' },
};

const PLAYER_R = 15;
const PLAYER_SPEED = 195;
const SWIPE_MIN_SPEED = 0.45; // CSS px/мс — медленнее не режет
const SWIPE_COST = 0.035; // энергии на CSS-пиксель
const RUNE_COST = 12;
const CELL = 64;
const MAX_ZOMBIES = 550;
const SLAM_R = 180;
const BOMB_R = 105;
const BLADE_KNOCK = 260;

type ZState = 'walk' | 'windup' | 'dash' | 'stun' | 'slam' | 'charge' | 'jump' | 'fuse';

interface Zombie extends Body {
  type: ZType; hp: number; maxHp: number; speed: number; r: number; dmg: number; xp: number;
  img: Phaser.GameObjects.Image; flash: number; slowUntil: number; slowMul: number; boneCd: number; dead: boolean;
  phase: number; kx: number; ky: number; spawnT: number;
  state: ZState; stateT: number; dirX: number; dirY: number; cd1: number; cd2: number; cd3: number;
  heavy: boolean; boss: string | null; final: boolean;
  navX: number; navY: number; navT: number; navOk: boolean;
  chkT: number; chkX: number; chkY: number; unT: number; unX: number; unY: number; infT: number;
  shield: number; bleedUntil: number; bleedDps: number; boomCd: number;
  tgtX: number; tgtY: number; jx0: number; jy0: number; air: boolean;
}
interface Proj {
  x: number; y: number; vx: number; vy: number; life: number; dmg: number; img: Phaser.GameObjects.Image;
  dead: boolean; friendly: boolean;
}
interface Boom { x: number; y: number; vx: number; vy: number; t: number; img: Phaser.GameObjects.Image; dmg: number; dead: boolean }
interface Gem { x: number; y: number; value: number; chest: boolean; img: Phaser.GameObjects.Image; pulled: boolean; t: number }
interface Seg { x1: number; y1: number; x2: number; y2: number; born: number; kind: 'blade' | 'dull' | 'echo'; width: number; sid: number }
interface BurnSeg { x1: number; y1: number; x2: number; y2: number; until: number; width: number }
interface Stroke {
  id: number; pts: { x: number; y: number }[]; hit: Map<Zombie, number>; tiles: Set<number>; kills: number; blasts: number;
  lastSX: number; lastSY: number; lastT: number; segs: Seg[]; loopStart: number; cssLen: number; sounded: boolean;
}
type Fx =
  | { kind: 'ring'; x: number; y: number; r: number; color: number; born: number; life: number; width?: number }
  | { kind: 'bolt'; pts: number[]; born: number; life: number }
  | { kind: 'poly'; pts: { x: number; y: number }[]; born: number; life: number; color: number };
type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

export class GameScene extends Phaser.Scene {
  private hud!: Hud;
  private stageIdx = 0;
  private stage!: StageDef;
  private stageTime = STAGE_TIME;
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
  private bossTimes: number[] = []; private bossCount = 0; private hitstop = 0;
  private paused = false; private over = false;
  private fieldTx = 1e9; private fieldTy = 1e9; private fieldAt = -1; private fieldDirty = true; private chunkAt = -1;
  private strokeSeq = 0; private crossCd = 0; private boomCd = 0; private grenadeT = 0; private bellCd = 0;
  private phoenixUsed = false; private graveTick = 0; private fallTextAt = -9; private toxicTick = 0;

  private zombies: Zombie[] = [];
  private projs: Proj[] = [];
  private booms: Boom[] = [];
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
  private chunkGfx = new Map<number, { g: Phaser.GameObjects.Graphics; objs: number[] }>();
  private tileImgs = new Map<number, Phaser.GameObjects.Image>();

  private playerImg!: Phaser.GameObjects.Image;
  private trailG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private boneImgs: Phaser.GameObjects.Image[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pGore!: Emitter; private pSpark!: Emitter; private pDust!: Emitter;
  private pWood!: Emitter; private pAcid!: Emitter; private pMagic!: Emitter;

  constructor() { super('game'); }

  init(data: { stage?: number }) {
    this.stageIdx = Math.max(0, Math.min(STAGES.length - 1, data?.stage ?? 0));
  }

  create() {
    this.resetState();
    if (location.search.includes('debug')) (window as unknown as { scene: GameScene }).scene = this;
    const qt = Number(new URLSearchParams(location.search).get('time'));
    this.stageTime = qt > 0 ? qt : STAGE_TIME;
    this.stage = STAGES[this.stageIdx];
    this.bossTimes = [120, 240, 360].filter((t) => t < this.stageTime - 100);
    makeTextures(this);
    this.dpr = (this.registry.get('dpr') as number) || 1;
    this.world = new World((Math.random() * 1e9) | 0, this.stage.gen);
    this.cameras.main.setBackgroundColor(this.stage.bg);
    document.body.style.background = this.stage.bg;
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
    this.events.once('shutdown', () => { this.scale.off('resize', this.applyZoom, this); this.hud.setJoystick(null); this.hud.setBoss(null); });

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.addPointer(3);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    this.updateField(true);
    this.manageChunks();
    this.hud.toast(`Уровень ${this.stageIdx + 1}: ${this.stage.name}`, 2200);
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
    this.bossCount = 0; this.hitstop = 0;
    this.paused = false; this.over = false;
    this.fieldTx = 1e9; this.fieldTy = 1e9; this.fieldAt = -1; this.fieldDirty = true; this.chunkAt = -1;
    this.strokeSeq = 0; this.crossCd = 0; this.boomCd = 0; this.grenadeT = 0; this.bellCd = 0;
    this.phoenixUsed = false; this.graveTick = 0; this.fallTextAt = -9; this.toxicTick = 0;
    this.zombies = []; this.projs = []; this.booms = []; this.gems = []; this.segs = []; this.burns = []; this.fx = [];
    this.splats = []; this.timers = []; this.boneImgs = [];
    this.strokes.clear(); this.joy = null;
    this.chunkGfx.clear(); this.tileImgs.clear();
  }

  private applyZoom() {
    const w = window.innerWidth, h = window.innerHeight;
    this.worldZoom = Phaser.Math.Clamp(Math.min(w, h) / 760, 0.55, 1.15);
    this.cameras.main.setZoom(this.worldZoom * this.dpr);
    this.chunkAt = -1;
  }

  private get dmgScale() { return (1 + this.elapsed / 300) * this.stage.dmgMul; }
  private get hpScale() { return (1 + this.elapsed / 140) * this.stage.hpMul; }

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
      id: ++this.strokeSeq, pts: [{ x: w.x, y: w.y }], hit: new Map(), tiles: new Set(), kills: 0, blasts: 0,
      lastSX: sx, lastSY: sy, lastT: performance.now(), segs: [], loopStart: 0, cssLen: 0, sounded: false,
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
    const seg: Seg = { x1: prev.x, y1: prev.y, x2: w.x, y2: w.y, born: this.elapsed, kind, width: kind === 'blade' ? this.stats.bladeWidth : 4, sid: s.id };
    this.segs.push(seg);
    if (kind === 'blade') {
      if (!s.sounded) { s.sounded = true; sfx.play('swipe'); }
      s.cssLen += d;
      s.segs.push(seg);
      const mom = 1 + this.stats.momentum * Phaser.Math.Clamp((speed - SWIPE_MIN_SPEED) / 1.5, 0, 1);
      this.bladeHit(seg, s.hit, this.stats.bladeDamage * mom, s);
      if (Math.random() < 0.5) this.pSpark.explode(1, w.x, w.y);
      if (this.stats.burnDur > 0 && this.burns.length < 500) {
        this.burns.push({ x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, until: this.elapsed + this.stats.burnDur, width: seg.width });
      }
      if (this.stats.crossDmg > 0) this.checkCross(seg);
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
    // Бумеранг по направлению длинного свайпа
    if (this.stats.boomDmg > 0 && s.cssLen >= 220 && this.boomCd <= this.elapsed && s.segs.length) {
      const a = s.segs[0], b = s.segs[s.segs.length - 1];
      const ang = Math.atan2(b.y2 - a.y1, b.x2 - a.x1);
      this.boomCd = this.elapsed + this.stats.boomCd;
      const img = this.add.image(this.pl.x, this.pl.y, 'boomerang').setScale(1 / S).setDepth(6);
      this.booms.push({ x: this.pl.x, y: this.pl.y, vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620, t: 0, img, dmg: this.stats.boomDmg + this.stats.bladeDamage * 0.3, dead: false });
      sfx.play('throw');
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
      if (z.shield > 0) {
        // щит: первые удары только ломают его
        z.shield--; z.flash = 0.06;
        z.kx += Math.cos(ang) * 120; z.ky += Math.sin(ang) * 120;
        this.pSpark.explode(8, z.x, z.y); sfx.play('clank');
        if (z.shield === 0) { z.img.setTexture('shield_broken'); this.floatText(z.x, z.y - 20, 'ЩИТ СЛОМАН', '#dee2e6', 16); }
        continue;
      }
      this.slow(z);
      if (this.stats.bleedDps > 0) { z.bleedUntil = this.elapsed + 3; z.bleedDps = this.stats.bleedDps; }
      this.pGore.explode(z.heavy ? 5 : 3, z.x, z.y);
      sfx.play('hit', 0.8);
      if (this.damage(z, dmg, ang, BLADE_KNOCK * this.stats.knockMul)) {
        if (this.stats.bloodEnergy) this.energy = Math.min(this.stats.energyMax, this.energy + this.stats.bloodEnergy);
        if (!stroke) continue;
        stroke.kills++;
        if (Math.random() < this.stats.chainChance) this.chain(z);
        if (stroke.kills >= (stroke.blasts + 1) * this.stats.comboThreshold) {
          stroke.blasts++;
          this.blast(z.x, z.y, this.stats.comboRadius, this.stats.comboDmg, 0xff922b);
        }
      }
    }
    // Снаряды можно разрубить (и отразить)
    for (const p of this.projs) {
      if (p.dead || p.friendly || distToSeg(p.x, p.y, seg.x1, seg.y1, seg.x2, seg.y2) >= hw + 10) continue;
      this.pSpark.explode(8, p.x, p.y);
      sfx.play('slice');
      this.energy = Math.min(this.stats.energyMax, this.energy + 3);
      const target = this.nearestZombie(p.x, p.y, 450);
      if (this.stats.reflectDmg > 0 && target) {
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        p.vx = Math.cos(a) * 460; p.vy = Math.sin(a) * 460; p.friendly = true; p.dmg = this.stats.reflectDmg; p.life = 1.5;
        p.img.setTint(0x66d9e8);
      } else { p.dead = true; p.img.destroy(); this.pAcid.explode(6, p.x, p.y); }
    }
    if (!stroke) return;
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    const n = Math.max(1, Math.ceil(len / 12));
    for (let i = 0; i <= n; i++) {
      const x = seg.x1 + ((seg.x2 - seg.x1) * i) / n, y = seg.y1 + ((seg.y2 - seg.y1) * i) / n;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), k = key2(tx, ty);
      if (stroke.tiles.has(k)) continue;
      const kind = this.world.kind(tx, ty);
      if (kind !== K_CRATE && kind !== K_GRAVE) continue;
      stroke.tiles.add(k);
      this.hitBreakable(tx, ty, kind);
    }
  }

  private nearestZombie(x: number, y: number, R: number) {
    let best: Zombie | null = null, bd = R * R;
    for (const z of this.queryRect(x - R, y - R, x + R, y + R)) {
      if (z.dead) continue;
      const d = (z.x - x) ** 2 + (z.y - y) ** 2;
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  private checkCross(seg: Seg) {
    if (this.crossCd > this.elapsed) return;
    for (const o of this.segs) {
      if (o.kind !== 'blade' || o.sid === seg.sid || this.elapsed - o.born > 0.6) continue;
      const p = segIntersect(seg.x1, seg.y1, seg.x2, seg.y2, o.x1, o.y1, o.x2, o.y2);
      if (!p) continue;
      this.crossCd = this.elapsed + 0.25;
      this.blast(p.x, p.y, this.stats.crossR, this.stats.crossDmg + this.stats.bladeDamage, 0x66d9e8);
      this.floatText(p.x, p.y - 16, '✖', '#c5f6fa', 26);
      return;
    }
  }

  private hitBreakable(tx: number, ty: number, kind: number) {
    const k = key2(tx, ty);
    const maxHp = kind === K_GRAVE ? 5 : 3;
    const hp = (this.world.crateHp.get(k) ?? maxHp) - 1;
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    const img = this.tileImgs.get(k);
    sfx.play(kind === K_GRAVE ? 'clank' : 'crate', 0.7);
    if (hp > 0) {
      this.world.crateHp.set(k, hp);
      if (kind === K_GRAVE) this.pDust.explode(4, cx, cy); else this.pWood.explode(4, cx, cy);
      if (img) {
        img.setTint(hp <= maxHp / 3 ? 0x9a7f6a : 0xc9b3a0);
        this.tweens.add({ targets: img, x: cx + 4, duration: 40, yoyo: true, repeat: 1, onComplete: () => img.setX(cx) });
      }
      return;
    }
    this.world.crateHp.delete(k);
    this.world.setKind(tx, ty, K_FLOOR);
    img?.destroy(); this.tileImgs.delete(k);
    this.fieldDirty = true;
    sfx.play('crate');
    if (kind === K_GRAVE) {
      this.pDust.explode(14, cx, cy); this.pMagic.explode(12, cx, cy);
      if (Math.random() < 0.25) this.dropGem(cx, cy, 0, true); else this.dropGem(cx, cy, 5, false);
      return;
    }
    this.pWood.explode(16, cx, cy); this.pDust.explode(6, cx, cy);
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
    sfx.play('zap');
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

  /** Взрыв по зомби (без урона игроку). */
  private blast(x: number, y: number, r: number, dmg: number, color: number, knock = 300) {
    this.fx.push({ kind: 'ring', x, y, r, color, born: this.elapsed, life: 0.35 });
    this.pSpark.explode(16, x, y); this.pDust.explode(8, x, y);
    this.cameras.main.shake(110, 0.004);
    sfx.play('explode', 0.6);
    for (const z of this.queryRect(x - r, y - r, x + r, y + r)) {
      if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (r + z.r) ** 2) this.damage(z, dmg, Math.atan2(z.y - y, z.x - x), knock);
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
      if (z.shield > 0) { z.shield = 0; z.img.setTexture('shield_broken'); }
      this.damage(z, dmg);
    }
    sfx.play('rune');
    this.fx.push({ kind: 'poly', pts: poly, born: this.elapsed, life: 0.5, color: 0xb197fc });
    for (let i = 0; i < poly.length; i += 3) this.pMagic.explode(1, poly[i].x, poly[i].y);
    if (caught >= 5) this.floatText((x1 + x2) / 2, (y1 + y2) / 2, `ПЕЧАТЬ x${caught}`, '#d0bfff', 24);
  }

  /** @returns true если зомби убит */
  private damage(z: Zombie, amount: number, ang?: number, knock = 0): boolean {
    if (z.dead) return false;
    z.hp -= amount;
    z.flash = 0.08;
    if (ang !== undefined && knock && !z.heavy && !z.air) { z.kx += Math.cos(ang) * knock; z.ky += Math.sin(ang) * knock; }
    if (z.hp > 0) return false;
    this.kill(z, ang);
    return true;
  }

  private kill(z: Zombie, sliceAngle?: number) {
    if (z.dead) return;
    z.dead = true;
    this.kills++;
    z.img.destroy();
    const big = z.r >= 26;
    this.pGore.explode(big ? 24 : 9, z.x, z.y);
    this.addSplat(z.x, z.y, z.r);
    sfx.play('kill', big ? 1 : 0.7);
    if (z.boss) {
      this.hitstop = 0.18;
      this.cameras.main.shake(400, 0.015);
      this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: 220, color: 0xffd43b, born: this.elapsed, life: 0.6, width: 6 });
      this.pMagic.explode(40, z.x, z.y);
      sfx.play('explode');
      const chests = z.final ? 3 : 2;
      for (let i = 0; i < chests; i++) this.dropGem(z.x - 30 + i * 30, z.y, 0, true);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; this.dropGem(z.x + Math.cos(a) * 60, z.y + Math.sin(a) * 60, 3, false); }
      this.hud.toast(`🏆 ${z.boss} повержен!`, 2200);
    } else if (z.type === 'brute') {
      this.cameras.main.shake(140, 0.005);
      this.dropGem(z.x, z.y, 0, true);
      this.dropGem(z.x + 14, z.y, z.xp, false);
    } else {
      this.dropGem(z.x, z.y, z.xp, false);
    }
    if (z.type === 'bomber') {
      // цепная реакция с маленькой задержкой
      const { x, y } = z;
      this.timers.push({ at: this.elapsed + 0.08, fn: () => this.bomb(x, y) });
    }
    if (sliceAngle !== undefined && !z.boss) this.sliceFx(z, sliceAngle);
    else this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: z.r + 8, color: ZLOOK[z.type].color, born: this.elapsed, life: 0.2 });
    if (this.stats.healEvery && ++this.killsForHeal >= this.stats.healEvery) {
      this.killsForHeal = 0;
      this.hp = Math.min(this.stats.maxHp, this.hp + 4);
    }
  }

  /** Взрыв подрывника: ранит и зомби, и игрока. */
  private bomb(x: number, y: number) {
    this.fx.push({ kind: 'ring', x, y, r: BOMB_R, color: 0xff6b00, born: this.elapsed, life: 0.4, width: 6 });
    this.pSpark.explode(18, x, y); this.pDust.explode(14, x, y); this.pGore.explode(8, x, y);
    this.cameras.main.shake(160, 0.007);
    sfx.play('explode');
    for (const z of this.queryRect(x - BOMB_R, y - BOMB_R, x + BOMB_R, y + BOMB_R)) {
      if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (BOMB_R + z.r) ** 2) this.damage(z, 30, Math.atan2(z.y - y, z.x - x), 380);
    }
    if (Math.hypot(this.pl.x - x, this.pl.y - y) < BOMB_R + PLAYER_R) this.hurt(18 * this.dmgScale);
  }

  /** Падение в пропасть. */
  private fall(z: Zombie) {
    z.dead = true;
    this.kills++;
    this.gainXp(z.xp * 1.5);
    sfx.play('fall', 0.7);
    const img = z.img;
    this.tweens.add({ targets: img, scale: 0.05, angle: img.angle + 260, alpha: 0, duration: 650, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
    if (this.elapsed - this.fallTextAt > 1.2) { this.fallTextAt = this.elapsed; this.floatText(z.x, z.y - 20, 'В ПРОПАСТЬ!', '#ffa94d', 20); }
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
    if (this.world.kindAtPx(x, y) === K_PIT) return;
    const s = this.add.image(x, y, 'splat').setDepth(1).setRotation(Math.random() * 6.28).setScale(0).setAlpha(0.75);
    this.tweens.add({ targets: s, scale: r / 14 / S, duration: 160, ease: 'Back.easeOut' });
    this.splats.push(s);
    if (this.splats.length > 140) this.splats.shift()!.destroy();
  }

  private dropGem(x: number, y: number, value: number, chest: boolean) {
    if (!chest && value <= 0) return;
    // не роняем в пропасть/стену — сдвигаем к игроку
    for (let i = 0; i < 6 && (this.world.kindAtPx(x, y) === K_PIT || this.world.solidAtPx(x, y)); i++) {
      x += (this.pl.x - x) * 0.3; y += (this.pl.y - y) * 0.3;
    }
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
    if (this.inv > 0 || this.over) return;
    this.hp -= amount;
    this.inv = 0.6; this.hurtT = 0.25;
    this.cameras.main.shake(110, 0.007);
    this.cameras.main.flash(90, 140, 0, 0);
    this.pGore.explode(6, this.pl.x, this.pl.y);
    sfx.play('hurt');
    if (this.stats.bell && this.hp > 0 && this.hp < this.stats.maxHp * 0.35 && this.bellCd <= this.elapsed) {
      this.bellCd = this.elapsed + 25;
      sfx.play('bell');
      this.fx.push({ kind: 'ring', x: this.pl.x, y: this.pl.y, r: 230, color: 0xffd43b, born: this.elapsed, life: 0.5, width: 6 });
      this.fx.push({ kind: 'ring', x: this.pl.x, y: this.pl.y, r: 150, color: 0xfff3bf, born: this.elapsed, life: 0.35, width: 3 });
      for (const z of this.queryRect(this.pl.x - 230, this.pl.y - 230, this.pl.x + 230, this.pl.y + 230)) {
        if (!z.dead) this.damage(z, 10 * this.stats.bell, Math.atan2(z.y - this.pl.y, z.x - this.pl.x), 600);
      }
    }
  }

  // ---------- Враги: спаун ----------
  private findSpawn(extra = 0, at?: { x: number; y: number }, angle?: number, R0?: number) {
    const R = R0 ?? Math.hypot(window.innerWidth, window.innerHeight) / 2 / this.worldZoom + 60 + extra;
    for (let i = 0; i < 12; i++) {
      let x: number, y: number;
      if (at) { const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 50; x = at.x + Math.cos(a) * d; y = at.y + Math.sin(a) * d; }
      else { const a = (angle ?? Math.random() * Math.PI * 2) + (i ? (Math.random() - 0.5) * 0.8 : 0); x = this.pl.x + Math.cos(a) * R; y = this.pl.y + Math.sin(a) * R; }
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (!this.world.landable(tx, ty)) continue;
      if (this.field.distAt(x, y) === FlowField.INF) continue;
      return { x, y, lvl: this.world.levelOf(tx, ty) };
    }
    return null;
  }

  private spawnZombie(type: ZType, opts: { angle?: number; extra?: number; at?: { x: number; y: number }; final?: boolean } = {}): Zombie | null {
    const d = ZDEF[type];
    if (this.zombies.length >= MAX_ZOMBIES && !d.boss) return null;
    const pos = this.findSpawn(opts.extra, opts.at, opts.angle);
    if (!pos) return null;
    const img = this.add.image(pos.x, pos.y, type).setOrigin(zOrigin(type), 0.5).setDepth(d.boss ? 4.5 : 4).setScale(0);
    const hp = d.hp * this.hpScale * (d.boss ? (1 + 0.5 * this.bossCount) * (opts.final ? 2.5 : 1) : 1);
    const z: Zombie = {
      type, x: pos.x, y: pos.y, lvl: pos.lvl, hp, maxHp: hp, speed: d.speed * (0.9 + Math.random() * 0.2), r: ZLOOK[type].r,
      dmg: d.dmg, xp: d.xp, img, flash: 0, slowUntil: 0, slowMul: 1, boneCd: 0, dead: false,
      phase: Math.random() * 6, kx: 0, ky: 0, spawnT: 0.45, state: 'walk', stateT: 0, dirX: 0, dirY: 0,
      cd1: 1.5 + Math.random() * 2, cd2: 3 + Math.random() * 2, cd3: 2 + Math.random(), heavy: !!d.heavy,
      boss: d.boss ? (opts.final ? `Страж: ${d.boss}` : d.boss) : null, final: !!opts.final,
      navX: pos.x, navY: pos.y, navT: Math.random() * 0.3, navOk: false,
      chkT: 0.6, chkX: pos.x, chkY: pos.y, unT: 0, unX: 0, unY: 0, infT: 0,
      shield: type === 'shield' ? 2 : 0, bleedUntil: 0, bleedDps: 0, boomCd: 0,
      tgtX: 0, tgtY: 0, jx0: 0, jy0: 0, air: false,
    };
    if (opts.final) img.setScale(0);
    this.zombies.push(z);
    if (opts.at || d.boss) this.pDust.explode(d.boss ? 30 : 5, pos.x, pos.y);
    return z;
  }

  private pickType(): ZType {
    const w = this.stage.weights(this.elapsed);
    let r = Math.random() * w.reduce((a, b) => a + b[1], 0);
    for (const [k, v] of w) if ((r -= v) <= 0) return k;
    return 'walker';
  }

  private spawn(dt: number) {
    const t = this.elapsed;
    const rate = Math.min(45, 1.4 + t / 10 + (t / 60) ** 2 * 0.6) * this.stage.rateMul;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawnZombie(this.pickType()); }

    if (t >= this.nextHorde && t < this.stageTime - 20) {
      this.nextHorde += 45;
      this.hordeN++;
      this.hud.toast('🧟 ОРДА! Держи проход или обведи печатью!');
      const n = 26 + this.hordeN * 8;
      for (let i = 0; i < n; i++) {
        const type: ZType = i % 14 === 0 && this.hordeN > 1 ? 'brute' : i % 3 === 0 ? this.pickType() : i % 2 ? 'runner' : 'walker';
        this.spawnZombie(type, { angle: (i / n) * Math.PI * 2, extra: 60 });
      }
    }
    if (this.bossTimes.length && t >= this.bossTimes[0]) {
      this.bossTimes.shift();
      const type = this.stage.bosses[this.bossCount % this.stage.bosses.length];
      if (this.spawnZombie(type, { extra: 20 })) {
        this.bossCount++;
        this.hud.toast(`☠️ БОСС: ${ZDEF[type].boss}`, 2400);
        this.cameras.main.shake(500, 0.006);
        sfx.play('boss');
      }
    }
    // Финальный страж за 90 секунд до конца
    const fin = this.stageTime - 90;
    if (fin > 30 && t >= fin && t - dt < fin) {
      const type = this.stage.bosses[0];
      if (this.spawnZombie(type, { extra: 20, final: true })) {
        this.bossCount++;
        this.hud.toast(`⚔️ СТРАЖ УРОВНЯ: ${ZDEF[type].boss}! Продержись до конца!`, 3000);
        this.cameras.main.shake(700, 0.01);
        sfx.play('boss');
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
    if (!force && this.elapsed - this.fieldAt < 0.15) return;
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
      drawChunk(g, this.world, cx, cy, this.stage.palette);
      const objs: number[] = [];
      for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
        const tx = cx * CH + x, ty = cy * CH + y;
        const kind = this.world.kind(tx, ty);
        if (kind !== K_CRATE && kind !== K_GRAVE) continue;
        const ck = key2(tx, ty);
        const maxHp = kind === K_GRAVE ? 5 : 3;
        const hp = this.world.crateHp.get(ck) ?? maxHp;
        const img = this.add.image((tx + 0.5) * TILE, (ty + 0.5) * TILE, kind === K_GRAVE ? 'grave' : 'crate').setScale(1 / S).setDepth(3);
        if (hp < maxHp) img.setTint(hp <= maxHp / 3 ? 0x9a7f6a : 0xc9b3a0);
        this.tileImgs.set(ck, img);
        objs.push(ck);
      }
      this.chunkGfx.set(k, { g, objs });
    }
    for (const [k, c] of this.chunkGfx) {
      const cx = k >> 16, cy = (k << 16) >> 16;
      if (cx >= cx0 - 1 && cx <= cx1 + 1 && cy >= cy0 - 1 && cy <= cy1 + 1) continue;
      c.g.destroy();
      for (const ck of c.objs) { this.tileImgs.get(ck)?.destroy(); this.tileImgs.delete(ck); }
      this.chunkGfx.delete(k);
    }
  }

  /** Могилы рядом с игроком поднимают мертвецов. */
  private graves(dt: number) {
    this.graveTick -= dt;
    if (this.graveTick > 0) return;
    this.graveTick = 4.5;
    for (const [k, img] of this.tileImgs) {
      if (img.texture.key !== 'grave') continue;
      const d = Math.hypot(img.x - this.pl.x, img.y - this.pl.y);
      if (d > 800 || d < 120) continue;
      const z = this.spawnZombie(Math.random() < 0.3 ? 'ghost' : 'walker', { at: { x: img.x, y: img.y + 30 } });
      if (z) { this.pMagic.explode(6, img.x, img.y); this.tweens.add({ targets: img, scaleX: 0.55 / S * 2, duration: 80, yoyo: true }); }
      void k;
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
    if (this.stage.gen.graves[1] > 0) this.graves(dt);
    this.buildGrid();
    for (const z of this.zombies) if (!z.dead) this.updateZombie(z, dt);
    this.updateProjs(dt);
    this.updateBooms(dt);
    this.trinkets(dt);
    this.burnTrails(dt);
    this.collectGems(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);
    if (this.elapsed - this.chunkAt > 0.25) { this.chunkAt = this.elapsed; this.manageChunks(); }

    if (this.hp <= 0) {
      if (this.stats.phoenix && !this.phoenixUsed) this.revive();
      else { this.gameOver(); return; }
    }
    if (this.elapsed >= this.stageTime) { this.victory(); return; }
    if (this.pendingLevels > 0) this.openLevelUp();
    this.draw();
  }

  private revive() {
    this.phoenixUsed = true;
    this.hp = this.stats.maxHp * 0.5;
    this.inv = 2;
    this.hud.toast('🪶 Феникс! Второй шанс', 2000);
    this.pMagic.explode(50, this.pl.x, this.pl.y);
    sfx.play('level');
    this.blast(this.pl.x, this.pl.y, 260, 60, 0xff922b, 600);
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
    const onToxic = this.world.kindAtPx(this.pl.x, this.pl.y) === K_TOXIC;
    const sp = PLAYER_SPEED * this.stats.speedMul * (onToxic ? 0.7 : 1);
    this.pl.x += dx * sp * dt; this.pl.y += dy * sp * dt;
    this.world.resolve(this.pl, PLAYER_R);
    this.world.updateLevel(this.pl);
    if (onToxic) {
      this.hp -= 6 * this.stage.dmgMul * dt;
      this.toxicTick -= dt;
      if (this.toxicTick <= 0) { this.toxicTick = 0.15; this.pAcid.explode(1, this.pl.x, this.pl.y); }
    }
    this.moving = Math.min(1, l);
    if (l > 0.05) { this.playerImg.setRotation(Math.atan2(dy, dx)); this.bob += dt * 14 * this.moving; }
    const sc = ((1 + 0.07 * this.pl.lvl) * (1 + Math.sin(this.bob) * 0.05 * this.moving)) / S;
    this.playerImg.setPosition(this.pl.x, this.pl.y).setScale(sc);
    this.inv = Math.max(0, this.inv - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.playerImg.setAlpha(this.inv > 0 && Math.floor(this.inv * 20) % 2 === 0 ? 0.45 : 1);
    if (this.hurtT > 0) this.playerImg.setTint(0xff6b6b);
    else if (onToxic) this.playerImg.setTint(0xb2f2bb);
    else this.playerImg.clearTint();
  }

  /** Куда приземлиться прыгуну: точка у игрока, на которую можно встать. */
  private pickLanding(z: Zombie, maxD: number) {
    let tx = this.pl.x, ty = this.pl.y;
    const d = Math.hypot(tx - z.x, ty - z.y);
    if (d > maxD) { tx = z.x + ((tx - z.x) / d) * maxD; ty = z.y + ((ty - z.y) / d) * maxD; }
    for (let r = 0; r <= 2; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const x = tx + ox * TILE, y = ty + oy * TILE;
      if (this.world.landable(Math.floor(x / TILE), Math.floor(y / TILE))) return { x, y };
    }
    return null;
  }

  private startJump(z: Zombie, maxD: number, charge: number) {
    const t = this.pickLanding(z, maxD);
    if (!t) { z.cd1 = 1; return; }
    z.state = 'charge'; z.stateT = charge; z.tgtX = t.x; z.tgtY = t.y;
    z.dirX = t.x - z.x; z.dirY = t.y - z.y;
    const l = Math.hypot(z.dirX, z.dirY) || 1; z.dirX /= l; z.dirY /= l;
  }

  private updateZombie(z: Zombie, dt: number) {
    const lift = 1 + 0.07 * z.lvl;
    if (z.spawnT > 0) {
      z.spawnT -= dt;
      const k = Math.max(0, 1 - z.spawnT / 0.45);
      z.img.setPosition(z.x, z.y).setScale((lift * Phaser.Math.Easing.Back.Out(k)) / S).setAlpha(Math.min(1, k * 2) * (z.type === 'ghost' ? 0.6 : 1));
      return;
    }
    if (z.bleedUntil > this.elapsed) {
      z.hp -= z.bleedDps * dt;
      if (Math.random() < dt * 3) this.pGore.explode(1, z.x, z.y);
      if (z.hp <= 0) { this.kill(z); return; }
    }
    const pl = this.pl;
    const dx = pl.x - z.x, dy = pl.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const onToxic = this.world.kindAtPx(z.x, z.y) === K_TOXIC;
    const slow = (z.slowUntil > this.elapsed ? z.slowMul : 1) * (onToxic && z.type !== 'ghost' ? 0.8 : 1);
    let mx = 0, my = 0, sp = z.speed * slow;

    const steer = () => {
      // близко и видно — напрямую
      if (d < 110 && Math.abs(z.lvl - pl.lvl) < 0.1 && this.world.clearLine(z.x, z.y, pl.x, pl.y, z.lvl)) { mx = dx / d; my = dy / d; return; }
      if (z.navT <= this.elapsed || (z.navX - z.x) ** 2 + (z.navY - z.y) ** 2 < 144) {
        z.navT = this.elapsed + 0.25 + Math.random() * 0.15;
        const t = this.field.steer(this.world, z.x, z.y, z.r, z.lvl);
        if (t) { z.navX = t.x; z.navY = t.y; z.navOk = true; } else z.navOk = false;
      }
      if (z.navOk) {
        const ex = z.navX - z.x, ey = z.navY - z.y, el = Math.hypot(ex, ey) || 1;
        mx = ex / el; my = ey / el;
      } else { mx = dx / d; my = dy / d; }
    };

    // Далеко отставших и запертых переносим ближе, чтобы давление не пропадало
    const far = Math.hypot(window.innerWidth, window.innerHeight) / this.worldZoom * 1.1 + 200;
    const fd = this.field.distAt(z.x, z.y);
    z.infT = fd === FlowField.INF && z.type !== 'ghost' && !z.air ? z.infT + dt : 0;
    if ((d > far || z.infT > 2) && !z.air) {
      const p = this.findSpawn(40);
      if (p) { z.x = p.x; z.y = p.y; z.lvl = p.lvl; z.state = 'walk'; z.infT = 0; z.navT = 0; }
      return;
    }

    let ghost = false;
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
        if (z.cd1 <= 0 && d < 430) { z.cd1 = 2.3 + Math.random(); this.shoot(z, 0, 'acid', 240, 9); z.flash = 0.05; }
        break;
      case 'jumper':
      case 'leaper': {
        const boss = z.type === 'leaper';
        if (z.state === 'walk') {
          steer();
          z.cd1 -= dt;
          // прыгает, если цель на другом ярусе, за препятствием или просто пора
          const blockedPath = Math.abs(z.lvl - pl.lvl) > 0.1 || !this.world.clearLine(z.x, z.y, pl.x, pl.y, z.lvl);
          if (z.cd1 <= 0 && d < (boss ? 460 : 380) && (blockedPath || Math.random() < 0.6)) this.startJump(z, boss ? 460 : 380, boss ? 0.9 : 0.7);
          else if (z.cd1 <= 0) z.cd1 = 0.5;
          if (boss) { z.cd2 -= dt; if (z.cd2 <= 0) { z.cd2 = 8; this.summon(z, 'jumper', 3); } }
        } else if (z.state === 'charge') {
          sp = 0; z.stateT -= dt;
          if (z.stateT <= 0) {
            z.state = 'jump'; z.stateT = boss ? 0.8 : 0.6; z.jx0 = z.x; z.jy0 = z.y; z.air = true;
            z.img.setDepth(6.5);
            sfx.play('jump', boss ? 1 : 0.6);
          }
        } else if (z.state === 'jump') {
          sp = 0; z.stateT -= dt;
          const T = boss ? 0.8 : 0.6, k = Phaser.Math.Clamp(1 - z.stateT / T, 0, 1);
          const e = Phaser.Math.Easing.Sine.InOut(k);
          z.x = z.jx0 + (z.tgtX - z.jx0) * e; z.y = z.jy0 + (z.tgtY - z.jy0) * e;
          if (z.stateT <= 0) {
            z.x = z.tgtX; z.y = z.tgtY; z.air = false; z.state = 'walk'; z.cd1 = boss ? 2.2 : 2.5 + Math.random() * 1.5;
            z.lvl = this.world.levelOf(Math.floor(z.x / TILE), Math.floor(z.y / TILE));
            z.img.setDepth(boss ? 4.5 : 4); z.navT = 0;
            const R = boss ? 160 : 34;
            this.pDust.explode(boss ? 26 : 8, z.x, z.y);
            sfx.play('land', boss ? 1 : 0.6);
            if (boss) { this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: R, color: 0xb197fc, born: this.elapsed, life: 0.4, width: 6 }); this.cameras.main.shake(220, 0.01); }
            if (Math.hypot(pl.x - z.x, pl.y - z.y) < R + PLAYER_R) this.hurt((boss ? 26 : 12) * this.dmgScale);
          }
        }
        break;
      }
      case 'bomber':
        if (z.state === 'fuse') {
          sp = 0; z.stateT -= dt;
          if (Math.floor(z.stateT * 12) % 2 === 0) z.flash = 0.03;
          if (z.stateT <= 0) { this.kill(z); return; }
        } else {
          steer();
          if (d < z.r + PLAYER_R + 22 && Math.abs(z.lvl - pl.lvl) <= 0.5) { z.state = 'fuse'; z.stateT = 0.6; sfx.play('fuse'); }
        }
        break;
      case 'ghost':
        ghost = true;
        mx = dx / d; my = dy / d;
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
        if (z.cd1 <= 0 && d < 480) { z.cd1 = 3; for (let i = -2; i <= 2; i++) this.shoot(z, i * 0.22, 'acid', 240, 9); }
        break;
      case 'necro':
        steer();
        if (d < 250) { mx = -dx / d; my = -dy / d; } else if (d < 380) sp *= 0.25;
        z.cd1 -= dt; z.cd2 -= dt; z.cd3 -= dt;
        if (z.cd1 <= 0) {
          z.cd1 = 6;
          const p = this.findSpawn(0, undefined, undefined, 260 + Math.random() * 80);
          if (p) {
            this.pMagic.explode(20, z.x, z.y); sfx.play('zap');
            z.x = p.x; z.y = p.y; z.lvl = p.lvl; z.navT = 0;
            this.pMagic.explode(20, z.x, z.y);
          }
        }
        if (z.cd2 <= 0) { z.cd2 = 7; this.summon(z, Math.random() < 0.5 ? 'ghost' : 'walker', 5); }
        if (z.cd3 <= 0 && d < 520) { z.cd3 = 2.8; for (let i = -1; i <= 1; i++) this.shoot(z, i * 0.3, 'orb', 160, 12); }
        break;
      default:
        steer();
    }

    // Застрял? Пробуем отойти вбок и пересчитать путь
    if (z.state === 'walk' && !ghost) {
      z.chkT -= dt;
      if (z.chkT <= 0) {
        const moved = Math.hypot(z.x - z.chkX, z.y - z.chkY);
        if (sp > 5 && d > 120 && moved < z.speed * 0.6 * 0.2) {
          const a = Math.atan2(my, mx) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          z.unT = 0.5; z.unX = Math.cos(a); z.unY = Math.sin(a); z.navT = 0;
        }
        z.chkT = 0.6; z.chkX = z.x; z.chkY = z.y;
      }
      if (z.unT > 0) {
        z.unT -= dt;
        mx = mx * 0.35 + z.unX * 0.65; my = my * 0.35 + z.unY * 0.65;
        const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
      }
    }

    if (!z.air) {
      z.x += mx * sp * dt + z.kx * dt;
      z.y += my * sp * dt + z.ky * dt;
    }
    const knockSpd = Math.hypot(z.kx, z.ky);
    const kd = Math.exp(-10 * dt);
    z.kx *= kd; z.ky *= kd;

    if (!z.air) {
      // Расталкивание соседей (тяжёлые толкают лёгких)
      const cx = Math.floor(z.x / CELL), cy = Math.floor(z.y / CELL);
      const span = z.r > 30 ? 2 : 1;
      for (let ix = cx - span; ix <= cx + span; ix++) for (let iy = cy - span; iy <= cy + span; iy++) {
        const b = this.grid.get(key2(ix, iy));
        if (!b) continue;
        for (const o of b) {
          if (o === z || o.dead || o.air) continue;
          const ox = z.x - o.x, oy = z.y - o.y;
          const min = z.r + o.r - 2;
          const dd = ox * ox + oy * oy;
          if (dd >= min * min || dd < 0.01) continue;
          const dist = Math.sqrt(dd);
          const push = ((min - dist) / dist) * 0.5 * (o.r / (z.r + o.r));
          z.x += ox * push; z.y += oy * push;
        }
      }
      if (!ghost) {
        const flung = knockSpd > 140 && !z.heavy;
        const hitWall = this.world.resolve(z, z.r, flung);
        this.world.updateLevel(z);
        if (this.world.kindAtPx(z.x, z.y) === K_PIT) { this.fall(z); return; }
        if (z.state === 'dash' && hitWall) {
          z.state = 'stun'; z.stateT = 0.9;
          this.pDust.explode(12, z.x, z.y);
          this.cameras.main.shake(80, 0.003);
          sfx.play('land', 0.5);
        }
        if (hitWall && knockSpd > 150 && this.stats.wallSlam > 0) {
          z.kx = 0; z.ky = 0;
          this.pDust.explode(5, z.x, z.y);
          sfx.play('hit');
          if (this.damage(z, this.stats.wallSlam)) return;
        }
      } else {
        z.lvl = pl.lvl;
      }
      const reach = z.type === 'bomber' ? 0 : z.r + PLAYER_R;
      if (d < reach && (ghost || Math.abs(z.lvl - pl.lvl) <= 0.5) && this.inv <= 0) this.hurt(z.dmg * this.dmgScale);
    }

    // Анимация: покачивание, «дыхание», замах, прыжок
    const moving = sp > 1 && !z.air;
    if (moving) z.phase += dt * (5 + sp * 0.035);
    const wob = moving ? Math.sin(z.phase) * 0.14 : 0;
    const rot = ['dash', 'windup', 'charge', 'jump'].includes(z.state) ? Math.atan2(z.dirY, z.dirX)
      : moving ? Math.atan2(my, mx) : Math.atan2(dy, dx);
    let sc = lift * (1 + Math.sin(z.phase * 2) * 0.035);
    if (z.state === 'windup') sc *= 1 + Math.sin(this.elapsed * 45) * 0.07;
    if (z.state === 'slam') sc *= 1 + (0.9 - z.stateT) * 0.3;
    if (z.state === 'stun') sc *= 0.95;
    if (z.state === 'fuse') sc *= 1 + (0.6 - z.stateT) * 0.5;
    let sx = sc, sy = sc;
    if (z.state === 'charge') { const k = 1 - Math.min(1, z.stateT / 0.7); sx = sc * (1 + k * 0.25); sy = sc * (1 - k * 0.2); }
    if (z.state === 'jump') { const T = z.type === 'leaper' ? 0.8 : 0.6; const k = 1 - z.stateT / T; const hgt = Math.sin(Math.PI * Phaser.Math.Clamp(k, 0, 1)); sx = sy = sc * (1 + hgt * 0.55); }
    z.img.setPosition(z.x, z.y).setRotation(rot + wob).setScale(sx / S, sy / S);
    z.img.setAlpha(ghost ? 0.45 + Math.sin(this.elapsed * 5 + z.phase) * 0.15 : 1);
    if (z.flash > 0) { z.flash -= dt; z.img.setTintFill(0xffffff); }
    else if (['windup', 'slam', 'charge', 'fuse'].includes(z.state)) z.img.setTint(0xff8787);
    else if (z.slowUntil > this.elapsed) z.img.setTint(0x9fd4ff);
    else z.img.clearTint();
  }

  private shoot(z: Zombie, offset: number, tex: 'acid' | 'orb', speed: number, dmg: number) {
    const a = Math.atan2(this.pl.y - z.y, this.pl.x - z.x) + offset;
    const img = this.add.image(z.x, z.y, tex).setScale(1 / S).setDepth(6);
    this.projs.push({ x: z.x, y: z.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2.8, dmg: dmg * this.dmgScale, img, dead: false, friendly: false });
    sfx.play('spit', 0.6);
  }

  private slam(z: Zombie) {
    this.fx.push({ kind: 'ring', x: z.x, y: z.y, r: SLAM_R, color: 0xff6b6b, born: this.elapsed, life: 0.4, width: 8 });
    this.cameras.main.shake(260, 0.012);
    sfx.play('land');
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
      if (p.friendly) {
        for (const z of this.queryRect(p.x - 40, p.y - 40, p.x + 40, p.y + 40)) {
          if (z.dead || (z.x - p.x) ** 2 + (z.y - p.y) ** 2 > (z.r + 9) ** 2) continue;
          this.damage(z, p.dmg, Math.atan2(p.vy, p.vx), 200);
          p.dead = true; p.img.destroy(); this.pSpark.explode(8, p.x, p.y); sfx.play('hit');
          break;
        }
        continue;
      }
      if (Math.hypot(this.pl.x - p.x, this.pl.y - p.y) < PLAYER_R + 8) {
        p.dead = true; p.img.destroy(); this.pAcid.explode(10, p.x, p.y);
        this.hurt(p.dmg);
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }

  private updateBooms(dt: number) {
    for (const b of this.booms) {
      b.t += dt;
      if (b.t < 0.45) { b.x += b.vx * dt; b.y += b.vy * dt; }
      else {
        const dx = this.pl.x - b.x, dy = this.pl.y - b.y, d = Math.hypot(dx, dy) || 1;
        const sp = 700 * dt;
        b.x += (dx / d) * Math.min(sp, d); b.y += (dy / d) * Math.min(sp, d);
        if (d < 22 || b.t > 2.5) { b.dead = true; b.img.destroy(); continue; }
      }
      b.img.setPosition(b.x, b.y).setRotation(b.t * 22);
      for (const z of this.queryRect(b.x - 60, b.y - 60, b.x + 60, b.y + 60)) {
        if (z.dead || z.boomCd > this.elapsed || (z.x - b.x) ** 2 + (z.y - b.y) ** 2 > (z.r + 16) ** 2) continue;
        z.boomCd = this.elapsed + 0.25;
        this.pSpark.explode(3, z.x, z.y);
        if (z.shield > 0) { z.shield--; sfx.play('clank'); if (!z.shield) z.img.setTexture('shield_broken'); continue; }
        this.damage(z, b.dmg, Math.atan2(b.vy, b.vx), 160);
      }
    }
    this.booms = this.booms.filter((b) => !b.dead);
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
    if (s.grenadeCd > 0) {
      this.grenadeT -= dt;
      if (this.grenadeT <= 0) {
        this.grenadeT = s.grenadeCd;
        const near = this.queryRect(px - 320, py - 320, px + 320, py + 320).filter((z) => !z.dead);
        if (near.length) {
          const t = near[Math.floor(Math.random() * Math.min(near.length, 8))];
          const tx = t.x, ty = t.y;
          const img = this.add.image(px, py, 'grenade').setScale(1 / S).setDepth(6.5);
          sfx.play('throw');
          this.tweens.add({ targets: img, x: tx, y: ty, rotation: 8, duration: 500, ease: 'Sine.easeOut', onComplete: () => { img.destroy(); this.blast(tx, ty, s.grenadeR, s.grenadeDmg, 0xffa94d, 350); } });
          this.tweens.add({ targets: img, scale: 2 / S, duration: 250, yoyo: true, ease: 'Sine.easeOut' });
        }
      }
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
        if (z.dead || hitThisTick.has(z) || z.air) continue;
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
        if (g.chest) { this.pWood.explode(12, g.x, g.y); this.pMagic.explode(16, g.x, g.y); sfx.play('chest'); this.openChest(); }
        else { this.pSpark.explode(2, g.x, g.y); sfx.play('gem', 0.8); this.gainXp(g.value); }
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
    sfx.play('level');
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

  private endRun() {
    this.over = true;
    this.strokes.clear(); this.joy = null;
    this.hud.setBoss(null);
    this.hud.setJoystick(null);
    const prog = loadProgress();
    prog.best[this.stageIdx] = Math.max(prog.best[this.stageIdx] ?? 0, Math.floor(this.elapsed));
    return prog;
  }

  private summary() {
    const t = Math.floor(this.elapsed);
    return `Время <b>${fmt(t)}</b> · Убито: <b>${this.kills}</b> · Уровень героя: <b>${this.level}</b> · Боссов: <b>${this.bossCount}</b>`;
  }

  private gameOver() {
    const prog = this.endRun();
    saveProgress(prog);
    sfx.play('lose');
    this.pGore.explode(30, this.pl.x, this.pl.y);
    this.playerImg.setVisible(false);
    this.hud.showEnd({
      title: 'Вас съели', text: this.summary(),
      primary: { label: 'Ещё раз', fn: () => this.scene.restart({ stage: this.stageIdx }) },
      secondary: { label: 'Меню', fn: () => this.game.events.emit('menu') },
    });
  }

  private victory() {
    const prog = this.endRun();
    const next = this.stageIdx + 1;
    prog.cleared[this.stageIdx] = true;
    const unlockedNew = next < STAGES.length && prog.unlocked < next;
    if (next < STAGES.length) prog.unlocked = Math.max(prog.unlocked, next);
    saveProgress(prog);
    sfx.play('win');
    this.pMagic.explode(60, this.pl.x, this.pl.y);
    for (const z of this.zombies) if (!z.dead) { this.pGore.explode(2, z.x, z.y); z.img.setAlpha(0.3); }
    const hasNext = next < STAGES.length;
    this.hud.showEnd({
      title: hasNext ? 'Уровень пройден!' : 'Все уровни пройдены!',
      text: this.summary() + (unlockedNew ? `<br>🔓 Открыт уровень ${next + 1}: <b>${STAGES[next].name}</b>` : ''),
      primary: hasNext
        ? { label: `Дальше: ${STAGES[next].name}`, fn: () => this.scene.restart({ stage: next }) }
        : { label: 'Ещё раз', fn: () => this.scene.restart({ stage: this.stageIdx }) },
      secondary: { label: 'Меню', fn: () => this.game.events.emit('menu') },
      win: true,
    });
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
      const life = s.kind === 'dull' ? 0.15 : s.kind === 'echo' ? 0.25 : this.stats.crossDmg > 0 ? 0.6 : 0.22;
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
      if (z.boss && (!boss || z.final)) boss = z;
      if (z.state === 'windup') {
        const a = 0.35 + Math.sin(this.elapsed * 30) * 0.2;
        fg.lineStyle(z.r * 1.4, 0xff6b6b, a * 0.4).lineBetween(z.x, z.y, z.x + z.dirX * 300, z.y + z.dirY * 300);
        fg.lineStyle(2, 0xff8787, a).lineBetween(z.x, z.y, z.x + z.dirX * 300, z.y + z.dirY * 300);
      } else if (z.state === 'slam') {
        const k = 1 - z.stateT / 0.9;
        fg.fillStyle(0xff6b6b, 0.12 + k * 0.15).fillCircle(z.x, z.y, SLAM_R * k);
        fg.lineStyle(3, 0xff6b6b, 0.8).strokeCircle(z.x, z.y, SLAM_R);
      } else if (z.state === 'charge' || z.state === 'jump') {
        const R = z.type === 'leaper' ? 160 : 34;
        const a = 0.4 + Math.sin(this.elapsed * 25) * 0.2;
        fg.fillStyle(0xff6b6b, 0.12).fillCircle(z.tgtX, z.tgtY, R);
        fg.lineStyle(2, 0xff8787, a).strokeCircle(z.tgtX, z.tgtY, R);
      } else if (z.state === 'fuse') {
        fg.lineStyle(2, 0xff6b00, 0.5 + Math.sin(this.elapsed * 40) * 0.3).strokeCircle(z.x, z.y, BOMB_R);
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
        for (const [w, c, al] of [[5, 0x74c0fc, 0.4], [2, 0xfff3bf, 1]] as const) {
          fg.lineStyle(w, c, a * al);
          fg.beginPath(); fg.moveTo(f.pts[0], f.pts[1]);
          for (let i = 2; i < f.pts.length; i += 2) fg.lineTo(f.pts[i], f.pts[i + 1]);
          fg.strokePath();
        }
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
      xp: this.xp, xpNext: this.xpNext(), time: this.elapsed, total: this.stageTime, kills: this.kills, level: this.level,
    });
  }
}

// ---------- Геометрия ----------
function fmt(t: number) { t = Math.floor(t); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const vx = x2 - x1, vy = y2 - y1;
  const l2 = vx * vx + vy * vy;
  let t = l2 ? ((px - x1) * vx + (py - y1) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

function segIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + rx * t, y: ay + ry * t };
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
