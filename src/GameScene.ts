import Phaser from 'phaser';
import { Hud, type DevAction } from './hud';
import { fetchStats, isDev } from './stats';
import { sfx, type SfxName } from './sfx';
import { session } from './session';
import { SnapWriter, ZF, type Msg, type Net } from './net';
import { ChunkView } from './chunks';
import { Effects, EMITTERS, drawTele, drawTrail, drawWarnings, trailLife, type EmitterName, type Tele } from './effects';
import { STAGES, STAGE_TIME, loadProgress, saveProgress, type StageDef } from './stages';
import { UPGRADES, SYNERGIES, computeStats, offerPool, rollChoices, type Levels, type Stats, type UpgradeDef } from './upgrades';
import { S, WALK_FRAMES, ZLOOK, ZTYPES, makeTextures, zOrigin, type ZType } from './textures';
import { World, FlowField, TILE, K_CRATE, K_GRAVE, K_FLOOR, K_PIT, K_TOXIC, K_DOOR, K_DOOROPEN, K_EXIT, key2, type Body } from './world';
import { Controls } from './controls';
import { Look } from './look';
import { Ambient } from './ambient';
import { haptic } from './haptics';
import { BLADES, addBones, loadMeta, metaBonus, type MetaBonus } from './meta';
import { nearestGoals, recordLife, unlockedSet, type AchDef } from './achievements';
import { CHAPTERS, type StoryMap } from './story';

/** fodder — «мясо»: HP не растёт со временем, базовый клинок всегда режет с одного взмаха. */
interface ZDef { hp: number; speed: number; dmg: number; xp: number; heavy?: boolean; boss?: string; fodder?: boolean }

export const ZDEF: Record<ZType, ZDef> = {
  walker: { hp: 3, speed: 50, dmg: 7, xp: 1, fodder: true },
  runner: { hp: 2.5, speed: 84, dmg: 6, xp: 1, fodder: true },
  spitter: { hp: 6, speed: 42, dmg: 8, xp: 2 },
  charger: { hp: 14, speed: 52, dmg: 16, xp: 3 },
  brute: { hp: 45, speed: 38, dmg: 22, xp: 7, heavy: true },
  jumper: { hp: 7, speed: 50, dmg: 10, xp: 2 },
  bomber: { hp: 5, speed: 62, dmg: 0, xp: 2 },
  shield: { hp: 14, speed: 42, dmg: 12, xp: 3 },
  ghost: { hp: 5, speed: 52, dmg: 8, xp: 2 },
  colossus: { hp: 300, speed: 44, dmg: 30, xp: 0, heavy: true, boss: 'Гнилой Колосс' },
  brood: { hp: 230, speed: 38, dmg: 24, xp: 0, heavy: true, boss: 'Матка Роя' },
  leaper: { hp: 260, speed: 50, dmg: 26, xp: 0, heavy: true, boss: 'Скакун-Титан' },
  necro: { hp: 220, speed: 55, dmg: 20, xp: 0, heavy: true, boss: 'Некромант' },
  dog: { hp: 2.5, speed: 88, dmg: 6, xp: 1, fodder: true },
  boar: { hp: 18, speed: 50, dmg: 15, xp: 3 },
};

export const PLAYER_R = 15;
export const PLAYER_SPEED = 195;
export const SWIPE_MIN_SPEED = 0.32; // CSS px/мс — медленнее не режет
/** Запас попадания: клинок цепляет чуть шире нарисованного следа — на телефоне палец закрывает цель. */
const HIT_ASSIST = 6;
export const SLAM_R = 180;
export const BOMB_R = 105;
const CELL = 64;
const MAX_ZOMBIES = 480;
const BARREL_R = 14;
const BARREL_BLAST = 130;
const BLADE_KNOCK = 260;
const REVIVE_R = 70;
const SNAP_MS = 50;
export const RUN_MUL = 1.6;
export const WAVES = 10;
const DOOR_HP = 14;

type ZState = 'walk' | 'windup' | 'dash' | 'stun' | 'slam' | 'charge' | 'jump' | 'fuse';

export interface Player extends Body {
  idx: number; img: Phaser.GameObjects.Image; remote: boolean;
  hp: number; inv: number; hurtT: number; moving: number; bob: number; rot: number;
  levels: Levels; stats: Stats;
  alive: boolean; downT: number; phoenixUsed: boolean; bellCd: number; grenadeT: number; boomCd: number; crossCd: number;
  boneImgs: Phaser.GameObjects.Image[]; boneAngle: number; auraTick: number; killsForHeal: number; onToxic: boolean; toxicTick: number;
  noise: number; running: boolean; meta: MetaBonus; unlocked: Set<string> | null;
  rerolls: number; synSeen: Set<string>; vortexCd: number; spearCd: number; waveCd: number;
  field: FlowField; fTx: number; fTy: number; fAt: number;
  // необычные предметы
  beatAt: number; beatN: number; stillT: number; rooted: boolean; wardAt: number; totemT: number; barrelT: number;
  markT: number; reaperN: number; chronoAt: number; lassoAt: number; trapCd: number; ballCd: number; greedCd: number;
}

interface Zombie extends Body {
  id: number; type: ZType; hp: number; maxHp: number; speed: number; r: number; dmg: number; xp: number;
  img: Phaser.GameObjects.Image; flash: number; slowUntil: number; slowMul: number; boneCd: number; dead: boolean;
  phase: number; kx: number; ky: number; spawnT: number; tgt: Player; tgtT: number;
  state: ZState; stateT: number; dirX: number; dirY: number; cd1: number; cd2: number; cd3: number;
  heavy: boolean; boss: string | null; final: boolean;
  navX: number; navY: number; navT: number; navOk: boolean;
  chkT: number; chkX: number; chkY: number; unT: number; unX: number; unY: number; infT: number;
  shield: number; bleedUntil: number; bleedDps: number; bleedOwner: Player | null; boomCd: number;
  tgtX: number; tgtY: number; jx0: number; jy0: number; air: boolean;
  vsx: number; vsy: number; vrot: number; valpha: number; vflags: number;
  awake: boolean; wakeT: number;
  pack: number; cracks: number; stunT: number; marked: boolean; plague: boolean; repCd: number; bumpCd: number; hookT: number;
}
/** Физические предметы на земле: бочка (5), тотем (6), капкан (8). */
interface Prop {
  kind: 5 | 6 | 8; x: number; y: number; vx: number; vy: number; lvl: number; img: Phaser.GameObjects.Image;
  fuse: number; until: number; tick: number; owner: Player | null; rolling: boolean; caught: Zombie | null; hitBy: number; dead: boolean;
}
interface Proj {
  x: number; y: number; vx: number; vy: number; life: number; dmg: number; img: Phaser.GameObjects.Image;
  dead: boolean; friendly: boolean; kind: number; // 0 кислота, 1 сфера
}
interface Boom { x: number; y: number; vx: number; vy: number; t: number; img: Phaser.GameObjects.Image; dmg: number; dead: boolean; owner: Player }
interface Gem { x: number; y: number; value: number; chest: boolean; heal: boolean; img: Phaser.GameObjects.Image; pulled: boolean; t: number; to: Player | null }
interface Seg { x1: number; y1: number; x2: number; y2: number; born: number; kind: 'blade' | 'dull' | 'echo'; width: number; sid: number; remote: boolean; color?: number }
interface Bolt { x: number; y: number; vx: number; vy: number; life: number; dmg: number; pierce: boolean; hit: Set<Zombie>; kind: 3 | 4 | 7 | 9; img: Phaser.GameObjects.Image; owner: Player; dead: boolean; bounces: number; homing: boolean }
interface Mine { x: number; y: number; t: number; r: number; dmg: number; owner: Player; img: Phaser.GameObjects.Image }
interface Vortex { x: number; y: number; r: number; until: number; dur: number; dps: number; owner: Player; tick: number }
interface Wave { cx: number; cy: number; rel: number[]; t: number; dur: number; s1: number; dmg: number; hit: Set<Zombie>; owner: Player; fire: boolean; burned: boolean }
interface BurnSeg { x1: number; y1: number; x2: number; y2: number; until: number; width: number; owner: Player }
interface Stroke {
  id: number; owner: Player; pts: { x: number; y: number }[]; hit: Map<Zombie, number>; tiles: Set<number>; kills: number; blasts: number;
  lastSX: number; lastSY: number; lastT: number; segs: Seg[]; loopStart: number; cssLen: number; sounded: boolean;
  charged: boolean; minePx: number; lastDir: number | null; mhit: Map<Zombie, number>; pid: number;
  beatChecked: boolean; beat: boolean; trapped: boolean;
  /** сколько CSS-пикселей взмах ещё режет; dulled — уже затупился (звук один раз) */
  left: number; dulled: boolean;
}

type PauseMode = '' | 'levelup' | 'user' | 'cd' | 'chest';

export class GameScene extends Phaser.Scene {
  private hud!: Hud;
  private stageIdx = 0;
  private stage!: StageDef;
  private stageTime = STAGE_TIME;
  private seed = 0;
  private net: Net | null = null;
  private world!: World;
  private chunks!: ChunkView;
  private vfx!: Effects;
  private dpr = 1;
  private worldZoom = 1;

  private players: Player[] = [];
  private me!: Player;
  private xp = 0; private level = 1; private pendingLevels = 0; private kills = 0;
  private elapsed = 0; private spawnAcc = 0; private nextHorde = 45; private hordeN = 0;
  private bossTimes: number[] = []; private bossCount = 0; private hitstop = 0;
  private pauseMode: PauseMode = ''; private over = false;
  private fieldDirty = true; private chunkAt = -1;
  private strokeSeq = 0; private graveTick = 0; private fallTextAt = -9; private zid = 1;
  private picks = new Map<Player, UpgradeDef[]>();
  private pauseReqAt = -1e9; private pauseReqPending = false; private voteOpen = false;

  private zombies: Zombie[] = [];
  private projs: Proj[] = [];
  private booms: Boom[] = [];
  private bolts: Bolt[] = [];
  private mines: Mine[] = [];
  private vortices: Vortex[] = [];
  private waves: Wave[] = [];
  private gems: Gem[] = [];
  private segs: Seg[] = [];
  private burns: BurnSeg[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private grid = new Map<number, Zombie[]>();
  private props: Prop[] = [];
  private packSeq = 0; private packSpeed = new Map<number, number>(); private packC = new Map<number, { x: number; y: number; n: number }>();
  private chronoUntil = 0; private barrelSpawnT = 4; private markPulse = 0; private bonkAt = 0; private numAt = 0;
  private strokes = new Map<number, Stroke>();
  private remoteStrokes = new Map<number, Stroke>();
  private controls!: Controls;
  private look!: Look;
  private ambient!: Ambient;
  private punch = 0; private stepT = 0;
  private mode: 'survival' | 'story' = 'survival';
  private chapter = 0;
  private map: StoryMap | null = null;
  private get chap() { return CHAPTERS[this.chapter]; }
  private get objs() { return this.chap.objectives; }
  private wave = 0; private waveAnnounced = 0; private entryTick = 0; private exitSeen = false; private progress = 0;
  private objIdx = 0; private objProg = 0; private bossKills = 0; private holdTick = 0;
  // общая серия убийств (комбо) и счёт
  private falls = 0; private rec = { kills: 0, bosses: 0, falls: 0 }; private lifeAt = 0;
  private combo = 0; private comboT = 0; private bestCombo = 0; private score = 0; private frenzyT = 0; private milestone = 0;
  private burnTick = 0;
  private chase = 0; private chaseAt = 0; private chaseWarned = false;
  private fresh: AchDef[] = [];
  private ev: unknown[][] = [];
  private snapAt = 0; private seq = 0;
  private tele: Tele[] = [];
  private bossInfo: [string, number] | null = null;

  private trailG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private fxG2!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private god = false; private infEnergy = false; private showFps = false; private fpsAt = 0; private devBoss = 0;

  constructor() { super('game'); }

  init(data: { stage?: number; seed?: number; coop?: boolean; mode?: 'survival' | 'story'; chapter?: number }) {
    this.mode = data?.mode ?? 'survival';
    this.chapter = data?.chapter ?? 0;
    this.stageIdx = Math.max(0, Math.min(STAGES.length - 1, data?.stage ?? 0));
    this.seed = data?.seed ?? (Math.random() * 1e9) | 0;
    this.net = data?.coop && session.net?.connected ? session.net : null;
  }

  private get coop() { return !!this.net?.connected; }
  private get paused() { return this.pauseMode !== ''; }

  create() {
    this.resetState();
    if (location.search.includes('debug')) Object.assign(window, { scene: this, sfx });
    const qt = Number(new URLSearchParams(location.search).get('time'));
    this.stageTime = qt > 0 ? qt : STAGE_TIME;
    this.stage = this.mode === 'story' ? this.chap.stage : STAGES[this.stageIdx];
    this.map = this.mode === 'story' ? this.chap.gen(this.seed) : null;
    if (this.map) this.stageTime = Infinity;
    this.bossTimes = [120, 240, 360].filter((t) => t < this.stageTime - 100);
    makeTextures(this);
    this.dpr = (this.registry.get('dpr') as number) || 1;
    this.world = new World(this.seed, this.stage.gen, this.map);
    this.chunks = new ChunkView(this, this.world, this.stage.palette);
    this.vfx = new Effects(this);
    this.cameras.main.setBackgroundColor(this.stage.bg);
    document.body.style.background = this.stage.bg;
    this.hud = new Hud();
    this.hud.show(this.coop);
    this.hud.setBoss(null);
    this.hud.onPause = () => this.requestPause();
    this.god = false; this.infEnergy = false; this.showFps = false; this.devBoss = 0;
    this.hud.setFps(null);
    this.hud.setDev(isDev() ? this.devActions() : null);

    this.players = [this.makePlayer(0, false)];
    if (this.coop) this.players.push(this.makePlayer(1, true));
    this.me = this.players[0];
    if (this.map) {
      this.players.forEach((p, i) => { p.x = (this.map!.start.x + 0.5) * TILE + i * 30; p.y = (this.map!.start.y + 0.5) * TILE; p.img.setPosition(p.x, p.y); });
    }
    this.hud.setItems(this.me.levels);
    sfx.musicStart();

    this.trailG = this.add.graphics().setDepth(7);
    this.fxG = this.add.graphics().setDepth(8);
    this.fxG2 = this.add.graphics().setDepth(14);

    this.cameras.main.startFollow(this.me.img, false, 1, 1);
    this.applyZoom();
    this.look = new Look(this);
    this.ambient = new Ambient(this, this.stage.ambient);
    this.scale.on('resize', this.applyZoom, this);
    const onVis = () => { if (document.hidden && !this.coop && !this.paused && !this.over) this.requestPause(); };
    document.addEventListener('visibilitychange', onVis);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      document.removeEventListener('visibilitychange', onVis);
      this.hud.setJoystick(null); this.hud.setBoss(null); this.hud.closeModals();
      sfx.musicStop();
      if (session.onMsg === this.onNet) { session.onMsg = null; session.onClose = null; }
    });

    if (this.net) { session.onMsg = this.onNet; session.onClose = this.onNetClose; }

    this.controls = new Controls(this);
    this.keys = this.input.keyboard!.addKeys('ESC,P') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.ESC.on('down', () => this.requestPause());
    this.keys.P.on('down', () => this.requestPause());
    this.input.addPointer(3);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);

    for (const p of this.players) this.updateField(p, true);
    this.chunks.update(this.me.x, this.me.y);
    if (this.map) {
      this.placeDormant();
      this.toast(`Глава ${this.chapter + 1}: ${CHAPTERS[this.chapter].goal}`, 2600);
      const intro = CHAPTERS[this.chapter].intro;
      this.time.delayedCall(1200, () => { this.hud.radio(intro); this.E('R', intro); });
    } else this.toast(`${this.stage.name}${this.coop ? ' · кооп' : ''} — 10 волн`, 2200);
  }

  private makePlayer(idx: number, remote: boolean): Player {
    const levels: Levels = {};
    const saved = loadMeta();
    const meta = remote ? metaBonus({}) : metaBonus(saved.lv, saved.blade);
    const stats = computeStats(levels, meta);
    const x = idx * 40, y = 0;
    return {
      idx, remote, x, y, lvl: 0, img: this.add.image(x, y, idx === 0 ? 'player' : 'player2').setScale(1 / S).setDepth(5).setOrigin(22 / 46, 0.5),
      hp: stats.maxHp, inv: 0, hurtT: 0, moving: 0, bob: 0, rot: 0, levels, stats,
      alive: true, downT: 0, phoenixUsed: false, bellCd: 0, grenadeT: 0, boomCd: 0, crossCd: 0,
      boneImgs: [], boneAngle: 0, auraTick: 0, killsForHeal: 0, onToxic: false, toxicTick: 0,
      noise: 0, running: false, meta, unlocked: remote ? new Set() : unlockedSet(),
      rerolls: 2 + meta.rerolls, synSeen: new Set(), vortexCd: 0, spearCd: 0, waveCd: 0,
      field: new FlowField(), fTx: 1e9, fTy: 1e9, fAt: -1,
      beatAt: -9, beatN: 0, stillT: 0, rooted: false, wardAt: 0, totemT: 3, barrelT: 2, markT: 1, reaperN: 0, chronoAt: 0,
      lassoAt: -99, trapCd: 0, ballCd: 0, greedCd: 0,
    };
  }

  private resetState() {
    this.xp = 0; this.level = 1; this.pendingLevels = 0; this.kills = 0;
    this.elapsed = 0; this.spawnAcc = 14; this.nextHorde = 45; this.hordeN = 0;
    this.bossCount = 0; this.hitstop = 0;
    this.pauseMode = ''; this.over = false;
    this.fieldDirty = true; this.chunkAt = -1;
    this.strokeSeq = 0; this.graveTick = 0; this.fallTextAt = -9; this.zid = 1;
    this.picks.clear(); this.pauseReqAt = -1e9; this.pauseReqPending = false; this.voteOpen = false;
    this.zombies = []; this.projs = []; this.booms = []; this.bolts = []; this.mines = []; this.vortices = []; this.waves = []; this.gems = []; this.segs = []; this.burns = [];
    this.timers = []; this.ev = []; this.tele = []; this.bossInfo = null;
    this.strokes.clear(); this.remoteStrokes.clear(); this.snapAt = 0; this.seq = 0;
    this.wave = 0; this.waveAnnounced = 0; this.entryTick = 0; this.exitSeen = false; this.progress = 0;
    this.objIdx = 0; this.objProg = 0; this.bossKills = 0; this.holdTick = 0;
    this.falls = 0; this.rec = { kills: 0, bosses: 0, falls: 0 }; this.lifeAt = 0;
    this.combo = 0; this.comboT = 0; this.bestCombo = 0; this.score = 0; this.frenzyT = 0; this.milestone = 0;
    this.fresh = [];
    this.chase = 0; this.chaseAt = 0; this.chaseWarned = false;
    this.props = []; this.packSeq = 0; this.packSpeed.clear(); this.packC.clear();
    this.chronoUntil = 0; this.barrelSpawnT = 4; this.markPulse = 0;
  }

  private applyZoom() {
    const w = window.innerWidth, h = window.innerHeight;
    this.worldZoom = worldZoomFor(w, h);
    this.cameras.main.setZoom(this.worldZoom * this.dpr);
    this.chunkAt = -1;
  }

  private get dmgScale() { return (this.map ? 1 + this.progress * 0.5 : 1 + this.elapsed / 330) * this.stage.dmgMul; }
  private get hpScale() { return (this.map ? 1 + this.progress * 1.6 + this.elapsed / 600 : 1 + this.elapsed / 200) * this.stage.hpMul * (this.players.length > 1 ? 1.15 : 1); }
  private alivePlayers() { return this.players.filter((p) => p.alive); }

  // ---------- Реплицируемые эффекты (локально + событие гостю) ----------
  private E(...e: unknown[]) { if (this.coop) this.ev.push(e); }
  private ring(x: number, y: number, r: number, color: number, life: number, width?: number) {
    this.vfx.ring(this.elapsed, x, y, r, color, life, width);
    this.E('r', x | 0, y | 0, r | 0, color, life, width ?? 0);
  }
  private burst(name: EmitterName, n: number, x: number, y: number) {
    this.vfx.burst(name, n, x, y);
    this.E('p', EMITTERS.indexOf(name), n, x | 0, y | 0);
  }
  private text(x: number, y: number, t: string, color: string, size = 22) {
    this.vfx.text(x, y, t, color, size);
    this.E('x', x | 0, y | 0, t, color, size);
  }
  private snd(name: SfxName, vol = 1, x?: number, y?: number, pitch = 1) {
    sfx.play(name, vol * this.att(x, y), pitch);
    this.E('s', name, vol, x === undefined ? null : x | 0, y === undefined ? null : y | 0, pitch);
  }
  private att(x?: number, y?: number) {
    if (x === undefined || y === undefined) return 1;
    return Phaser.Math.Clamp(1.3 - Math.hypot(x - this.me.x, y - this.me.y) / 800, 0, 1);
  }
  /** Короткий «удар» камерой: приближение и возврат. */
  private zoomPunch(k: number) {
    if (this.punch > 0) return;
    this.punch = 1;
    const cam = this.cameras.main, z = this.worldZoom * this.dpr;
    this.tweens.add({ targets: cam, zoom: z * (1 + k), duration: 70, yoyo: true, ease: 'Quad.easeOut', onComplete: () => { cam.setZoom(this.worldZoom * this.dpr); this.punch = 0; } });
  }
  private shake(d: number, i: number) { this.cameras.main.shake(d, i); this.E('k', d, i); }
  private toast(msg: string, ms = 1600) { this.hud.toast(msg, ms); this.E('t', msg, ms); }

  // ---------- Ввод (координаты ввода переводим в CSS-пиксели) ----------
  private newStroke(owner: Player, x: number, y: number, sx: number, sy: number, pid = -1): Stroke {
    return {
      id: ++this.strokeSeq, owner, pts: [{ x, y }], hit: new Map(), tiles: new Set(), kills: 0, blasts: 0,
      lastSX: sx, lastSY: sy, lastT: performance.now(), segs: [], loopStart: 0, cssLen: 0, sounded: false,
      charged: false, minePx: 0, lastDir: null, mhit: new Map(), pid, beatChecked: false, beat: false, trapped: false,
      left: owner.stats.strokeLen, dulled: false,
    };
  }

  private endLocalStrokes() {
    for (const s of this.strokes.values()) sfx.swipeEnd(s.pid);
    this.strokes.clear();
  }

  /** Заряд: палец удержан на месте — следующий свайп сильнее. */
  private chargeStroke(s: Stroke) {
    if (s.charged || s.owner.stats.chargeMul <= 0) return;
    s.charged = true;
    const p = s.pts[0];
    this.ring(p.x, p.y, 40, 0xffd43b, 0.3, 4);
    this.burst('magic', 8, p.x, p.y);
    this.snd('charge', 1, p.x, p.y);
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.paused || this.over || !this.me.alive) return;
    const sx = p.x / this.dpr, sy = p.y / this.dpr;
    if (this.controls.down(p.id, sx, sy, p.wasTouch)) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    if (this.tryToggleDoor(this.me, w.x, w.y)) return;
    this.strokes.set(p.id, this.newStroke(this.me, w.x, w.y, sx, sy, p.id));
    sfx.swipeStart(p.id);
  }

  private onMove(p: Phaser.Input.Pointer) {
    const sx = p.x / this.dpr, sy = p.y / this.dpr;
    if (this.controls.move(p.id, sx, sy)) return;
    const s = this.strokes.get(p.id);
    if (!s || this.paused || this.over) return;
    const now = performance.now();
    const d = Math.hypot(sx - s.lastSX, sy - s.lastSY);
    if (d < 5) return;
    const speed = d / Math.max(1, now - s.lastT);
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    s.lastSX = sx; s.lastSY = sy; s.lastT = now;
    const kind = this.strokeMove(s, w.x, w.y, d, speed);
    sfx.swipeUpdate(p.id, speed, kind === 'blade');
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.controls.up(p.id)) return;
    const s = this.strokes.get(p.id);
    if (!s) return;
    this.strokes.delete(p.id);
    sfx.swipeEnd(p.id);
    this.finishStroke(s);
  }

  /** Общая логика свайпа (локального и пришедшего от гостя). d и speed — в CSS-пикселях. */
  private strokeMove(s: Stroke, wx: number, wy: number, d: number, speed: number): Seg['kind'] {
    const pl = s.owner;
    if (!pl.alive) return 'dull';
    const st = pl.stats;
    const prev = s.pts[s.pts.length - 1];
    let kind: Seg['kind'] = 'dull';
    if (speed >= SWIPE_MIN_SPEED) {
      // Клинок режет, пока у взмаха есть длина; оторвал палец — снова острый. «Безумие» снимает предел.
      if (s.left > 0 || this.frenzyT > 0 || this.infEnergy) { s.left -= d; kind = 'blade'; }
      // Кровавый пакт: затупившийся взмах режет за счёт здоровья
      else if (st.pactDmg > 0 && pl.hp > 8) { if (!this.god) pl.hp -= d * 0.012; kind = 'blade'; if (Math.random() < 0.3) this.vfx.burst('gore', 1, wx, wy); }
      else if (!s.dulled) { s.dulled = true; if (pl === this.me) { sfx.play('dull'); haptic('dull'); } }
    }
    if (kind === 'blade' && !s.beatChecked) {
      s.beatChecked = true;
      const gap = this.elapsed - pl.beatAt;
      pl.beatAt = this.elapsed;
      pl.beatN = gap >= 0.35 && gap <= 0.9 ? pl.beatN + 1 : 1;
      if (st.rhythmMul > 0 && (pl.beatN % 3 === 0 || (st.syn.timebreak && this.chronoUntil > this.elapsed))) {
        s.beat = true;
        this.ring(wx, wy, 46, 0xff8787, 0.3, 5);
        this.text(wx, wy - 26, 'В ТАКТ!', '#ff8787', 18);
        this.snd('level', 0.35, wx, wy, 1.6);
      }
    }
    // к концу взмаха след сужается — видно, что клинок вот-вот затупится
    const edge = this.frenzyT > 0 ? 1 : 0.6 + 0.4 * Phaser.Math.Clamp(s.left / (st.strokeLen * 0.3), 0, 1);
    const width = kind === 'blade' ? st.bladeWidth * edge * (s.charged ? 1.5 : 1) * (this.frenzyT > 0 ? 1.4 : 1) * (s.beat ? 1.35 : 1) : 4;
    const color = bladeColor(pl.meta.blade);
    const seg: Seg = { x1: prev.x, y1: prev.y, x2: wx, y2: wy, born: this.elapsed, kind, width, sid: s.id, remote: pl.remote, color };
    this.segs.push(seg);
    if (!pl.remote) this.E('g', seg.x1 | 0, seg.y1 | 0, seg.x2 | 0, seg.y2 | 0, kind === 'blade' ? 0 : 1, seg.width, color);
    if (kind === 'blade') {
      if (!s.sounded) {
        s.sounded = true;
        // свой непрерывный «вжух» у каждого локальный; напарнику — короткий звук
        if (pl.remote) sfx.play('swipe', 0.6 * this.att(wx, wy)); else this.E('s', 'swipe', 0.6, wx | 0, wy | 0, 1);
      }
      s.cssLen += d;
      s.segs.push(seg);
      pl.noise = Math.max(pl.noise, 12);
      let mul = (1 + st.momentum * Phaser.Math.Clamp((speed - SWIPE_MIN_SPEED) / 1.5, 0, 1)) * this.comboDmg(st);
      if (s.charged) mul *= st.chargeMul * (st.syn.breach ? 1.5 : 1);
      if (s.beat) mul *= st.rhythmMul;
      if (pl.rooted) mul *= 1 + st.anchorMul;
      if (st.pactDmg > 0 && pl.hp < pl.stats.maxHp * 0.5) mul *= 1 + st.pactDmg;
      // Капкан в начале длинного свайпа
      if (st.trapDmg > 0 && !s.trapped && s.cssLen >= 160 && pl.trapCd <= this.elapsed) {
        s.trapped = true; pl.trapCd = this.elapsed + 1.6;
        this.addProp(8, s.pts[0].x, s.pts[0].y, pl, 12);
      }
      const pierce = s.charged && !!st.syn.breach;
      this.bladeHit(seg, s.hit, st.bladeDamage * mul, s, pl, pierce);
      if (Math.random() < 0.5) this.vfx.burst('spark', 1, wx, wy);
      if (st.burnDur > 0 && this.burns.length < 500) this.addBurn(seg.x1, seg.y1, seg.x2, seg.y2, seg.width, pl);
      if (st.crossDmg > 0) this.checkCross(seg, pl);
      // Двойник: зеркальная копия свайпа через героя
      if (st.mirrorMul > 0) {
        const m: Seg = { x1: 2 * pl.x - seg.x1, y1: 2 * pl.y - seg.y1, x2: 2 * pl.x - seg.x2, y2: 2 * pl.y - seg.y2, born: this.elapsed, kind: 'echo', width: seg.width, sid: -s.id, remote: false };
        this.segs.push(m);
        this.E('g', m.x1 | 0, m.y1 | 0, m.x2 | 0, m.y2 | 0, 2, m.width);
        this.bladeHit(m, s.mhit, st.bladeDamage * mul * st.mirrorMul, s, pl, pierce);
        if (st.burnDur > 0 && this.burns.length < 500) this.addBurn(m.x1, m.y1, m.x2, m.y2, m.width, pl);
        if (st.crossDmg > 0) this.checkCross(m, pl, true);
      }
      const segLen = Math.hypot(wx - prev.x, wy - prev.y);
      // Звёздные мины вдоль следа
      if (st.mineDmg > 0) {
        s.minePx += segLen;
        while (s.minePx >= st.mineEvery) {
          s.minePx -= st.mineEvery; this.addMine(wx, wy, pl);
          if (st.syn.mirrormines) this.addMine(2 * pl.x - wx, 2 * pl.y - wy, pl);
        }
      }
      // Вихрь на резком развороте
      if (st.vortexR > 0 && segLen > 10) {
        const dir = Math.atan2(wy - prev.y, wx - prev.x);
        if (s.lastDir !== null) {
          const diff = Math.abs(Math.atan2(Math.sin(dir - s.lastDir), Math.cos(dir - s.lastDir)));
          if (diff > 2.0 && pl.vortexCd <= this.elapsed) { pl.vortexCd = this.elapsed + 0.5; this.addVortex(prev.x, prev.y, pl); }
        }
        s.lastDir = dir;
      }
    }
    s.pts.push({ x: wx, y: wy });
    this.checkLoop(s);
    return kind;
  }

  private addBurn(x1: number, y1: number, x2: number, y2: number, width: number, pl: Player, dur = pl.stats.burnDur) {
    const b = { x1, y1, x2, y2, until: this.elapsed + dur, width, owner: pl };
    this.burns.push(b);
    this.E('B', x1 | 0, y1 | 0, x2 | 0, y2 | 0, dur, width);
  }

  private addMine(x: number, y: number, pl: Player) {
    if (this.mines.length >= 16) return;
    const img = this.add.image(x, y, 'mine').setScale(0.4 / S).setDepth(2.5);
    this.tweens.add({ targets: img, scale: 1 / S, angle: 180, duration: 200, ease: 'Back.easeOut' });
    this.mines.push({ x, y, t: 0.6, r: pl.stats.mineR, dmg: pl.stats.mineDmg + pl.stats.bladeDamage * 0.4, owner: pl, img });
    this.E('M', x | 0, y | 0);
  }

  private addVortex(x: number, y: number, pl: Player) {
    const st = pl.stats;
    this.vortices.push({ x, y, r: st.vortexR, until: this.elapsed + st.vortexDur, dur: st.vortexDur, dps: st.vortexDps + st.bladeDamage * 0.3, owner: pl, tick: 0 });
    this.E('V', x | 0, y | 0, st.vortexR, st.vortexDur);
    this.snd('wave', 0.8, x, y);
  }

  private finishStroke(s: Stroke) {
    const pl = s.owner;
    if (s.kills >= 3) {
      const last = s.pts[s.pts.length - 1];
      this.dropGem(last.x, last.y, Math.floor((s.kills * s.kills) / 4), false);
      this.text(last.x, last.y - 20, `ВЗМАХ ×${s.kills}`, s.kills >= 8 ? '#ff922b' : '#ffd43b', s.kills >= 8 ? 30 : 22);
      if (s.kills >= 6) this.hitstop = 0.06;
    }
    if (pl.stats.echoMul > 0 && s.segs.length) {
      const segs = s.segs.slice();
      const dmg = pl.stats.bladeDamage * pl.stats.echoMul;
      this.timers.push({
        at: this.elapsed + 0.3,
        fn: () => {
          const hit = new Map<Zombie, number>();
          for (const sg of segs) {
            const e: Seg = { ...sg, born: this.elapsed, kind: 'echo', remote: false };
            this.segs.push(e);
            this.E('g', e.x1 | 0, e.y1 | 0, e.x2 | 0, e.y2 | 0, 2, e.width);
            this.bladeHit(e, hit, dmg, null, pl);
            if (pl.stats.syn.echofire) this.addBurn(e.x1, e.y1, e.x2, e.y2, e.width, pl);
            if (pl.stats.syn.echocross) this.checkCross(e, pl, true);
          }
        },
      });
    }
    if (!s.segs.length || !pl.alive) return;
    const st = pl.stats;
    const a = s.segs[0], b = s.segs[s.segs.length - 1];
    const ang = Math.atan2(b.y2 - a.y1, b.x2 - a.x1);
    // Крюк: задетые стягиваются к концу следа и сталкиваются
    if (st.hookPull > 0 && s.hit.size) {
      let n = 0;
      for (const z of s.hit.keys()) {
        if (z.dead || z.heavy || z.air || z.boss) continue;
        const dx = b.x2 - z.x, dy = b.y2 - z.y, d = Math.hypot(dx, dy) || 1;
        const v = st.hookPull * Math.min(1, d / 160);
        z.kx = (dx / d) * v; z.ky = (dy / d) * v; z.hookT = this.elapsed + 0.7;
        if (n++ < 6) this.vfx.burst('spark', 1, z.x, z.y);
      }
      if (n) { this.snd('throw', 0.8, b.x2, b.y2, 0.7); this.ring(b.x2, b.y2, 30, 0xced4da, 0.25, 3); }
    }
    // Рикошет-шар
    if (st.ballDmg > 0 && s.cssLen >= 80 && pl.ballCd <= this.elapsed) {
      pl.ballCd = this.elapsed + 0.7;
      this.addBolt(b.x2, b.y2, ang, 640, 3.2, st.ballDmg + st.bladeDamage * 0.4, true, 9, pl, st.ballBounces);
      this.snd('throw', 0.7, b.x2, b.y2, 1.5);
    }
    if (st.boomDmg > 0 && s.cssLen >= 220 && pl.boomCd <= this.elapsed) {
      pl.boomCd = this.elapsed + st.boomCd;
      for (const da of st.syn.twinboom ? [0, Math.PI] : [0]) {
        const img = this.add.image(pl.x, pl.y, 'boomerang').setScale(1 / S).setDepth(6);
        this.booms.push({ x: pl.x, y: pl.y, vx: Math.cos(ang + da) * 620, vy: Math.sin(ang + da) * 620, t: 0, img, dmg: st.boomDmg + st.bladeDamage * 0.3, dead: false, owner: pl });
      }
      this.snd('throw', 1, pl.x, pl.y);
    }
    // Копьё — по направлению свайпа
    if (st.spearDmg > 0 && s.cssLen >= 100 && pl.spearCd <= this.elapsed) {
      pl.spearCd = this.elapsed + 0.45;
      const n = st.spearCount;
      for (let i = 0; i < n; i++) this.addBolt(b.x2, b.y2, ang + (n > 1 ? (i - 0.5) * 0.22 : 0), 950, 0.8, st.spearDmg + st.bladeDamage * 0.6, true, 3, pl);
      this.snd('spear', 1, b.x2, b.y2);
    }
    // Веер осколков
    if (st.shardCount > 0 && s.cssLen >= 60) {
      const n = st.shardCount, spread = 0.9;
      for (let i = 0; i < n; i++) this.addBolt(b.x2, b.y2, ang - spread / 2 + (spread * i) / (n - 1), 700, 0.42, st.shardDmg + st.bladeDamage * 0.3, !!st.syn.iceshards, 4, pl);
      this.snd('slice', 0.8, b.x2, b.y2, 1.3);
    }
    // Волна формы свайпа
    if (st.waveDmg > 0 && s.pts.length >= 4 && pl.waveCd <= this.elapsed) {
      pl.waveCd = this.elapsed + 1.4;
      const step = Math.max(1, Math.floor(s.pts.length / 36));
      const pts = s.pts.filter((_, i) => i % step === 0);
      let cx = 0, cy = 0;
      for (const p of pts) { cx += p.x; cy += p.y; }
      cx /= pts.length; cy /= pts.length;
      const rel = pts.flatMap((p) => [Math.round(p.x - cx), Math.round(p.y - cy)]);
      const fire = !!st.syn.firewave;
      this.waves.push({ cx, cy, rel, t: 0, dur: 0.45, s1: st.waveScale, dmg: st.waveDmg + st.bladeDamage * 0.25, hit: new Set(), owner: pl, fire, burned: false });
      this.vfx.wave(this.elapsed, cx, cy, rel, st.waveScale, 0.45, fire);
      this.E('W', cx | 0, cy | 0, rel, st.waveScale, 0.45, fire ? 1 : 0);
      this.snd('wave', 1, cx, cy);
    }
  }

  private addBolt(x: number, y: number, ang: number, speed: number, life: number, dmg: number, pierce: boolean, kind: Bolt['kind'], owner: Player, bounces = 0) {
    const tex = kind === 3 ? 'spear' : kind === 4 ? 'shard' : kind === 7 ? 'soul' : 'ball';
    const img = this.add.image(x, y, tex).setScale(1 / S).setDepth(6).setRotation(ang);
    this.bolts.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life, dmg, pierce, hit: new Set(), kind, img, owner, dead: false, bounces, homing: kind === 7 });
  }

  // ---------- Сеть (хост) ----------
  private onNet = (m: Msg) => {
    const p2 = this.players[1];
    if (!p2) return;
    switch (m.t) {
      case 'mv':
        if (p2.alive && !this.paused) { p2.x = m.x; p2.y = m.y; p2.lvl = m.l; p2.rot = m.r; p2.moving = m.m; p2.running = !!m.run; }
        break;
      case 'door':
        if (m.bump) { if (this.world.kind(m.tx, m.ty) === K_DOOR && Math.hypot((m.tx + 0.5) * TILE - p2.x, (m.ty + 0.5) * TILE - p2.y) < TILE * 1.6) this.setDoor(m.tx, m.ty, 1); }
        else this.tryToggleDoor(p2, (m.tx + 0.5) * TILE, (m.ty + 0.5) * TILE);
        break;
      case 'sd':
        if (p2.alive && !this.paused && !this.over) this.remoteStrokes.set(m.s, this.newStroke(p2, m.x, m.y, 0, 0));
        break;
      case 'sm': {
        const s = this.remoteStrokes.get(m.s);
        if (s && !this.paused && !this.over) this.strokeMove(s, m.x, m.y, m.d, m.v);
        break;
      }
      case 'su': {
        const s = this.remoteStrokes.get(m.s);
        if (s) { this.remoteStrokes.delete(m.s); this.finishStroke(s); }
        break;
      }
      case 'pick': this.pick(p2, m.id); break;
      case 'meta': {
        // бонусы Мастерской гостя
        const was = p2.stats.maxHp;
        p2.meta = metaBonus(m.lv ?? {}, typeof m.blade === 'string' ? m.blade : 'cleaver');
        p2.stats = computeStats(p2.levels, p2.meta);
        p2.hp += p2.stats.maxHp - was;
        p2.rerolls = 2 + p2.meta.rerolls;
        p2.unlocked = m.unl === null ? null : new Set(m.unl ?? []);
        break;
      }
      case 'reroll': this.reroll(p2); break;
      case 'ch': { const st = this.remoteStrokes.get(m.s); if (st) this.chargeStroke(st); break; }
      case 'preq': this.incomingPauseRequest(); break;
      case 'pans': this.pauseAnswer(!!m.ok); break;
      case 'resume': if (this.pauseMode === 'user') this.startCountdown(); break;
      case 'bye': this.onNetClose('Напарник вышел'); break;
    }
  };

  private onNetClose = (reason: string) => {
    if (this.players.length < 2) return;
    const p2 = this.players.pop()!;
    p2.img.destroy(); p2.boneImgs.forEach((b) => b.destroy());
    this.net = null;
    this.hud.toast(`${reason} — играете соло`, 2500);
    this.hud.closeModals(); this.hud.showWait(null);
    this.hud.show(false);
    for (const z of this.zombies) if (z.tgt === p2) z.tgt = this.me;
    if (this.pauseMode === 'levelup') { this.picks.delete(p2); this.checkPicks(); }
    if (this.pauseMode === 'user' || this.pauseMode === 'cd') this.setPause('');
    if (!this.me.alive && !this.over) this.gameOver();
  };

  private sendSnapshot() {
    const net = this.net;
    if (!net?.connected || this.players.length < 2) return;
    const p2 = this.players[1];
    const w = new SnapWriter();
    const R = 1500;
    for (const z of this.zombies) {
      if (z.dead || Math.abs(z.x - p2.x) > R || Math.abs(z.y - p2.y) > R) continue;
      w.zombie(z.id, ZTYPES.indexOf(z.type), z.vflags, z.x, z.y, z.vrot, z.vsx, z.vsy, z.valpha);
    }
    for (const g of this.gems) if (Math.abs(g.x - p2.x) < R && Math.abs(g.y - p2.y) < R) w.gem(g.x, g.img.y, g.heal ? 3 : g.chest ? 2 : g.value >= 5 ? 1 : 0);
    for (const p of this.projs) if (!p.dead) w.proj(p.x, p.y, p.vx, p.vy, p.friendly ? 2 : p.kind);
    for (const b of this.bolts) if (!b.dead) w.proj(b.x, b.y, b.vx, b.vy, b.kind);
    for (const b of this.props) if (!b.dead && Math.abs(b.x - p2.x) < R && Math.abs(b.y - p2.y) < R) w.proj(b.x, b.y, b.vx, b.vy, b.kind === 5 && b.fuse >= 0 ? 10 : b.kind);
    for (const b of this.booms) if (!b.dead) w.boom(b.x, b.y, b.img.rotation);
    const pl = this.players.map((p) => [
      Math.round(p.x), Math.round(p.y), p.lvl, +p.rot.toFixed(2), Math.ceil(p.hp), p.stats.maxHp, 0, 1,
      p.alive ? 1 : 0, +p.downT.toFixed(2), p.inv > 0 ? +p.inv.toFixed(2) : 0, p.hurtT > 0 ? 1 : 0, p.onToxic ? 1 : 0,
      p.stats.auraRadius, p.stats.bones, +p.boneAngle.toFixed(2), +(p.img.scaleX * S).toFixed(3),
    ]);
    const tele = this.tele.filter((t) => Math.abs(t[1] - p2.x) < R && Math.abs(t[2] - p2.y) < R);
    const header = {
      s: ++this.seq, t: +this.elapsed.toFixed(2), T: this.stageTime, k: this.kills, xp: +this.xp.toFixed(1), xn: this.xpNext(), lv: this.level,
      boss: this.bossInfo, pl, lv2: p2.levels, tele, ev: this.ev, wv: this.wave, ob: this.map ? [this.objIdx, +this.objProg.toFixed(3)] : null,
      sc: [this.score, this.combo, this.comboMul, this.combo ? +(this.comboT / this.comboWindow()).toFixed(2) : 0, this.frenzyT > 0 ? 1 : 0], cross: this.players.some((p) => p.stats.crossDmg > 0) ? 1 : 0,
    };
    this.ev = [];
    net.sendSnap(w.finish(header));
  }

  // ---------- Пауза ----------
  private setPause(mode: PauseMode) {
    this.pauseMode = mode;
    if (mode === 'user') {
      this.endLocalStrokes(); this.remoteStrokes.clear(); this.controls?.reset();
      this.hud.showPause(() => this.resumeRequested(), () => this.leave(), this.coop ? 'Продолжить может любой из игроков' : '', this.me.levels);
      this.net?.send({ t: 'paused' });
    } else if (mode === '') {
      this.hud.hidePause(); this.hud.showCountdown(null);
    }
  }

  private requestPause() {
    if (this.over || this.pauseMode === 'levelup' || this.pauseMode === 'cd' || this.pauseMode === 'chest') return;
    if (this.pauseMode === 'user') { this.resumeRequested(); return; }
    if (!this.coop) { this.setPause('user'); return; }
    if (this.pauseReqPending) return;
    const wait = 20 - (performance.now() - this.pauseReqAt) / 1000;
    if (wait > 0) { this.hud.toast(`Запросить паузу снова можно через ${Math.ceil(wait)} с`); return; }
    this.pauseReqPending = true;
    this.net!.send({ t: 'preq' });
    this.hud.showWait('Запрос паузы отправлен напарнику…');
    setTimeout(() => { if (this.pauseReqPending) this.pauseAnswer(false); }, 12000);
  }

  private incomingPauseRequest() {
    if (this.over || this.paused || this.voteOpen) { this.net?.send({ t: 'pdecl' }); return; }
    this.voteOpen = true;
    this.hud.showVote('Напарник просит паузу', 10, (ok) => {
      this.voteOpen = false;
      if (ok && !this.over && !this.paused) this.setPause('user');
      else this.net?.send({ t: 'pdecl' });
    });
  }

  private pauseAnswer(ok: boolean) {
    if (!this.pauseReqPending) return;
    this.pauseReqPending = false;
    this.hud.showWait(null);
    if (ok) { if (!this.paused && !this.over) this.setPause('user'); }
    else { this.pauseReqAt = performance.now(); this.hud.toast('Напарник отклонил паузу'); }
  }

  private resumeRequested() {
    if (this.pauseMode !== 'user') return;
    if (!this.coop) { this.setPause(''); return; }
    this.startCountdown();
  }

  private startCountdown() {
    this.pauseMode = 'cd';
    this.hud.hidePause();
    let n = 3;
    const tick = () => {
      if (this.pauseMode !== 'cd') return;
      if (n === 0) { this.setPause(''); this.net?.send({ t: 'unpaused' }); return; }
      this.hud.showCountdown(n);
      this.net?.send({ t: 'cd', n });
      n--;
      setTimeout(tick, 1000);
    };
    tick();
  }

  private leave() { this.game.events.emit('menu'); }

  // ---------- Боёвка ----------
  private bladeHit(seg: Seg, hit: Map<Zombie, number>, dmg: number, stroke: Stroke | null, pl: Player, pierce = false) {
    const hw = seg.width / 2;
    const ang = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    const m = hw + 50;
    for (const z of this.queryRect(Math.min(seg.x1, seg.x2) - m, Math.min(seg.y1, seg.y2) - m, Math.max(seg.x1, seg.x2) + m, Math.max(seg.y1, seg.y2) + m)) {
      if (z.dead) continue;
      const last = hit.get(z);
      // крупных можно «пилить» одним свайпом, мелких — один удар за свайп
      if (last !== undefined && (!z.heavy || this.elapsed - last < 0.12)) continue;
      if (distToSeg(z.x, z.y, seg.x1, seg.y1, seg.x2, seg.y2) > hw + z.r + HIT_ASSIST) continue;
      hit.set(z, this.elapsed);
      if (z.shield > 0 && pierce) { z.shield = 0; z.img.setTexture('shield_broken'); }
      if (z.shield > 0) {
        z.shield--; z.flash = 0.06;
        z.kx += Math.cos(ang) * 120; z.ky += Math.sin(ang) * 120;
        this.burst('spark', 8, z.x, z.y); this.snd('clank', 1, z.x, z.y);
        if (z.shield === 0) { z.img.setTexture('shield_broken'); this.text(z.x, z.y - 20, 'ЩИТ СЛОМАН', '#dee2e6', 16); }
        continue;
      }
      this.slow(z, pl);
      const st = pl.stats;
      if (st.bleedDps > 0) { z.bleedUntil = this.elapsed + 3; z.bleedDps = st.bleedDps; z.bleedOwner = pl; if (st.syn.epidemic) z.plague = true; }
      this.burst('gore', z.heavy ? 5 : 3, z.x, z.y);
      this.vfx.spray(z.heavy ? 9 : 6, z.x, z.y, ang); this.E('y', z.heavy ? 9 : 6, z.x | 0, z.y | 0, +ang.toFixed(2));
      this.snd('hit', 0.8, z.x, z.y);
      const pitch = 1 + 0.07 * Math.min(14, stroke?.kills ?? 0);
      let d = dmg, crit = !!stroke && (stroke.charged || stroke.beat);
      // Контрудар: бьём в момент атаки
      if (st.parryMul > 0 && (['windup', 'dash', 'charge', 'fuse', 'slam'].includes(z.state))) {
        d *= st.parryMul; crit = true;
        if (!z.boss) { z.state = 'walk'; z.stunT = st.parryStun; z.cd1 = Math.max(z.cd1, 1.5); }
        this.text(z.x, z.y - 24, 'КОНТРУДАР', '#74c0fc', 18);
        this.ring(z.x, z.y, z.r + 22, 0x74c0fc, 0.3, 4);
        this.snd('clank', 1, z.x, z.y, 1.4);
      }
      // Казнь / Приговор
      if (!z.boss && ((st.execute > 0 && (z.hp - d) / z.maxHp <= st.execute) || (st.syn.deadeye && z.marked))) {
        if (z.hp > d) this.burst('gore', 10, z.x, z.y);
        d = Math.max(d, z.hp + 1);
      }
      // Трещина: каждый третий удар раскалывает
      if (st.crackDmg > 0 && ++z.cracks >= 3) {
        z.cracks = 0;
        const zx = z.x, zy = z.y, sd = z.maxHp * st.crackDmg + st.bladeDamage * 0.5;
        this.timers.push({ at: this.elapsed + 0.02, fn: () => this.blast(zx, zy, 70 + 8 * (pl.levels.crack ?? 0), sd, 0x99e9f2, 240, true) });
        this.burst('spark', 10, zx, zy);
      }
      const heavy = z.heavy, zx = z.x, zy = z.y;
      if (!this.damage(z, d, ang, BLADE_KNOCK * st.knockMul * st.knockBase * (st.pinsDmg > 0 ? 1.25 : 1), true, pitch)) this.dmgNum(zx, zy - z.r, d, crit);
      else {
        // отдача: короткий стоп-кадр на каждое убийство клинком, длиннее — на серию и на крупных
        this.hitstop = Math.max(this.hitstop, heavy ? 0.07 : stroke && stroke.kills >= 2 ? 0.032 : 0.018);
        if (pl === this.me) haptic(heavy ? 'heavy' : stroke && stroke.kills >= 2 ? 'multi' : 'cut');
        if (!stroke) continue;
        stroke.kills++;
        stroke.left += st.strokeRefund;
        if (stroke.kills === 3 || stroke.kills === 6 || stroke.kills === 10) this.shake(70, 0.0025 + stroke.kills * 0.0004);
        if (stroke.kills === 6 || stroke.kills === 12) this.zoomPunch(0.025);
        if (Math.random() < pl.stats.chainChance) this.chain(z, pl);
        if (stroke.kills >= (stroke.blasts + 1) * pl.stats.comboThreshold) {
          stroke.blasts++;
          this.blast(z.x, z.y, pl.stats.comboRadius, pl.stats.comboDmg, 0xff922b);
        }
      }
    }
    // бочки: пинок клинком
    for (const b of this.props) {
      if (b.dead || b.kind !== 5 || (stroke && b.hitBy === stroke.id)) continue;
      if (distToSeg(b.x, b.y, seg.x1, seg.y1, seg.x2, seg.y2) > hw + BARREL_R) continue;
      b.hitBy = stroke?.id ?? -1;
      this.kickBarrel(b, ang, pl);
    }
    for (const p of this.projs) {
      if (p.dead || p.friendly || distToSeg(p.x, p.y, seg.x1, seg.y1, seg.x2, seg.y2) >= hw + 10) continue;
      this.burst('spark', 8, p.x, p.y);
      this.snd('slice', 1, p.x, p.y);
      if (stroke) stroke.left += 40;
      const target = this.nearestZombie(p.x, p.y, 450);
      if (pl.stats.reflectDmg > 0 && target) {
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        p.vx = Math.cos(a) * 460; p.vy = Math.sin(a) * 460; p.friendly = true; p.dmg = pl.stats.reflectDmg; p.life = 1.5;
        p.img.setTint(0x66d9e8);
      } else { p.dead = true; p.img.destroy(); this.burst('acid', 6, p.x, p.y); }
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

  /** Пересечение со свежими следами (в т.ч. эхо и двойника — у кого есть синергии). */
  private checkCross(seg: Seg, pl: Player, dup = false) {
    if (pl.crossCd > this.elapsed || pl.stats.crossDmg <= 0) return;
    // следы двойника (sid < 0) участвуют всегда; эхо — с синергией «Эхо-перекрёсток»
    const echoOk = dup || pl.stats.syn.echocross || pl.stats.mirrorMul > 0;
    for (const o of this.segs) {
      if ((o.kind !== 'blade' && !(echoOk && o.kind === 'echo')) || o.sid === seg.sid || o.remote !== seg.remote || this.elapsed - o.born > 0.6) continue;
      if (o.sid === -seg.sid && Math.abs(o.born - seg.born) < 0.001) continue; // зеркальная пара одного шага
      const p = segIntersect(seg.x1, seg.y1, seg.x2, seg.y2, o.x1, o.y1, o.x2, o.y2);
      if (!p) continue;
      pl.crossCd = this.elapsed + 0.25;
      this.blast(p.x, p.y, pl.stats.crossR * (pl.stats.syn.kaleido ? 1.5 : 1), (pl.stats.crossDmg + pl.stats.bladeDamage) * (pl.stats.syn.kaleido ? 1.5 : 1), 0x66d9e8);
      this.text(p.x, p.y - 16, '✖', '#c5f6fa', 26);
      return;
    }
  }

  private hitBreakable(tx: number, ty: number, kind: number) {
    const k = key2(tx, ty);
    const maxHp = ChunkView.maxHp(kind);
    const hp = (this.world.crateHp.get(k) ?? maxHp) - 1;
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    this.snd(kind === K_GRAVE ? 'clank' : 'crate', 0.7, cx, cy);
    this.chunks.hitTile(tx, ty, hp, maxHp);
    this.E('T', tx, ty, hp, maxHp);
    if (hp > 0) {
      this.world.crateHp.set(k, hp);
      this.burst(kind === K_GRAVE ? 'dust' : 'wood', 4, cx, cy);
      return;
    }
    this.world.crateHp.delete(k);
    this.world.setKind(tx, ty, K_FLOOR);
    this.fieldDirty = true;
    this.snd('crate', 1, cx, cy);
    // шанс аптечки растёт от «Счастливой монеты» любого игрока
    const luck = Math.max(...this.players.map((p) => p.levels.coin ?? 0));
    if (kind === K_GRAVE) {
      this.burst('dust', 14, cx, cy); this.burst('magic', 12, cx, cy);
      const r = Math.random();
      if (r < 0.22) this.dropGem(cx, cy, 0, true);
      else if (r < 0.37 + luck * 0.04) this.dropGem(cx, cy, 0, false, true);
      else this.dropGem(cx, cy, 5, false);
      return;
    }
    this.burst('wood', 16, cx, cy); this.burst('dust', 6, cx, cy);
    const r = Math.random();
    if (r < 0.06) this.dropGem(cx, cy, 0, true);
    else if (r < 0.2 + luck * 0.04) this.dropGem(cx, cy, 0, false, true);
    else if (r < 0.55) this.dropGem(cx, cy, 2, false);
  }

  private slow(z: Zombie, pl: Player) {
    z.slowUntil = this.elapsed + pl.stats.frostDur;
    z.slowMul = z.boss ? Math.max(0.6, pl.stats.frostSlow) : pl.stats.frostSlow;
  }

  private chain(from: Zombie, pl: Player) {
    let cur = from;
    const visited = new Set<Zombie>([from]);
    this.snd('zap', 1, from.x, from.y);
    for (let j = 0; j < pl.stats.chainJumps; j++) {
      let best: Zombie | null = null; let bd = 170 * 170;
      for (const z of this.queryRect(cur.x - 170, cur.y - 170, cur.x + 170, cur.y + 170)) {
        if (z.dead || visited.has(z)) continue;
        const d = (z.x - cur.x) ** 2 + (z.y - cur.y) ** 2;
        if (d < bd) { bd = d; best = z; }
      }
      if (!best) break;
      const pts = jagged(cur.x, cur.y, best.x, best.y);
      this.vfx.bolt(this.elapsed, pts);
      this.E('b', pts.map((v) => v | 0));
      this.burst('spark', 4, best.x, best.y);
      visited.add(best);
      this.damage(best, pl.stats.chainDmg);
      cur = best;
    }
  }

  /** Взрыв по зомби (без урона игрокам). */
  private blast(x: number, y: number, r: number, dmg: number, color: number, knock = 300, quiet = false) {
    this.ring(x, y, r, color, 0.35);
    this.burst('spark', quiet ? 6 : 16, x, y);
    if (!quiet) { this.burst('dust', 8, x, y); this.shake(110, 0.004); this.snd('explode', 0.6, x, y); } else this.snd('hit', 0.7, x, y, 1.3);
    this.igniteNear(x, y, r);
    for (const z of this.queryRect(x - r, y - r, x + r, y + r)) {
      if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (r + z.r) ** 2) this.damage(z, dmg, Math.atan2(z.y - y, z.x - x), knock);
    }
  }

  /** Замкнутая петля: вся добыча внутри летит к герою. С «Арканом» петля ещё и стягивает зомби. */
  private checkLoop(s: Stroke) {
    const pts = s.pts;
    const n = pts.length;
    if (n > 400 || n - s.loopStart < 9) return;
    const P = pts[n - 1];
    for (let i = s.loopStart; i < n - 7; i++) {
      if ((pts[i].x - P.x) ** 2 + (pts[i].y - P.y) ** 2 > 46 * 46) continue;
      const poly = pts.slice(i);
      if (polyArea(poly) < 3000) continue;
      s.loopStart = n;
      const pl = s.owner;
      const got = this.harvest(poly, pl);
      const lasso = pl.stats.lassoDmg > 0 && this.elapsed - pl.lassoAt >= pl.stats.lassoCd;
      if (lasso) { pl.lassoAt = this.elapsed; this.castLasso(poly, pl); }
      else if (got) this.showPoly(poly, 0x74c0fc);
      return;
    }
  }

  /** Сбор добычи петлёй. Большой улов — бонус опыта. @returns сколько собрано */
  private harvest(poly: { x: number; y: number }[], pl: Player) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of poly) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    const got: Gem[] = [];
    for (const g of this.gems) {
      if (g.to || g.x < x1 || g.x > x2 || g.y < y1 || g.y > y2 || !pointInPoly(g.x, g.y, poly)) continue;
      got.push(g);
    }
    if (!got.length) return 0;
    const big = got.length >= 8;
    const boost = 1.2 + 0.5 * (pl.levels.magnet ?? 0);
    for (const g of got) { g.pulled = true; g.to = pl; g.t = Math.max(g.t, boost * 2); if (big && !g.chest && !g.heal) g.value *= 1.15; }
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    this.snd('loop', 1, cx, cy, 1 + Math.min(0.5, got.length * 0.02));
    if (pl === this.me) haptic('pick');
    for (const g of got.slice(0, 24)) this.vfx.burst('xp', 2, g.x, g.y);
    if (big) this.text(cx, cy, `ЖАТВА ×${got.length}`, '#a5d8ff', got.length >= 20 ? 28 : 22);
    return got.length;
  }

  private showPoly(poly: { x: number; y: number }[], color: number) {
    this.vfx.poly(this.elapsed, poly, color);
    const step = Math.max(1, Math.floor(poly.length / 40));
    this.E('P', poly.filter((_, i) => i % step === 0).flatMap((p) => [p.x | 0, p.y | 0]), color);
  }

  /** Цифра урона над выжившим врагом (не чаще, чем успевает читаться). */
  private dmgNum(x: number, y: number, d: number, crit: boolean) {
    if (this.elapsed - this.numAt < 0.045 && !crit) return;
    this.numAt = this.elapsed;
    const v = d >= 10 ? Math.round(d) : Math.round(d * 10) / 10;
    this.vfx.num(x + (Math.random() - 0.5) * 14, y - 6, String(v), crit);
    this.E('n', x | 0, y | 0, v, crit ? 1 : 0);
  }

  // ---------- Физика предметов: бочки, тотемы, капканы ----------
  private addProp(kind: Prop['kind'], x: number, y: number, owner: Player | null, life = Infinity): Prop {
    const tex = kind === 5 ? 'barrel' : kind === 6 ? 'totem' : 'trap';
    const img = this.add.image(x, y, tex).setScale(0).setDepth(3);
    this.tweens.add({ targets: img, scale: 1 / S, duration: 220, ease: 'Back.easeOut' });
    const b: Prop = {
      kind, x, y, vx: 0, vy: 0, lvl: this.world.levelOf(Math.floor(x / TILE), Math.floor(y / TILE)), img, fuse: -1,
      until: this.elapsed + life, tick: 0, owner, rolling: false, caught: null, hitBy: 0, dead: false,
    };
    this.props.push(b);
    if (kind !== 5) this.burst('dust', 6, x, y);
    return b;
  }

  private addBarrel(x: number, y: number, owner: Player | null) {
    if (this.props.filter((b) => b.kind === 5).length >= 24) return;
    if (this.world.solidAtPx(x, y) || this.world.kindAtPx(x, y) === K_PIT) return;
    this.addProp(5, x, y, owner);
  }

  /** Пинок клинком: бочка летит по свайпу и загорается (со «Страйком» — катится и взрывается у стены). */
  private kickBarrel(b: Prop, ang: number, pl: Player) {
    b.vx = Math.cos(ang) * 560; b.vy = Math.sin(ang) * 560; b.owner = pl;
    if (pl.stats.syn.bowling) { b.rolling = true; if (b.fuse < 0) b.fuse = 1.8; }
    else if (b.fuse < 0) b.fuse = 0.65;
    this.snd('crate', 0.8, b.x, b.y, 0.8);
    this.burst('spark', 6, b.x, b.y);
  }

  /** Взрыв рядом поджигает бочки — цепная реакция. */
  private igniteNear(x: number, y: number, r: number) {
    for (const b of this.props) {
      if (b.dead || b.kind !== 5) continue;
      if ((b.x - x) ** 2 + (b.y - y) ** 2 > (r + BARREL_R) ** 2) continue;
      if (b.fuse < 0 || b.fuse > 0.25) b.fuse = 0.12 + Math.random() * 0.12;
    }
  }

  private explodeBarrel(b: Prop) {
    b.dead = true; b.img.destroy();
    let mul = 1;
    for (const p of this.players) mul = Math.max(mul, p.stats.barrelMul);
    if (b.rolling) mul *= 2;
    const dmg = 16 * Math.sqrt(this.hpScale) * mul, R = BARREL_BLAST * (b.rolling ? 1.2 : 1);
    this.burst('gore', 4, b.x, b.y); this.burst('dust', 14, b.x, b.y);
    this.ring(b.x, b.y, R * 0.6, 0xffe066, 0.25, 8);
    this.shake(180, 0.008); if (Math.hypot(b.x - this.me.x, b.y - this.me.y) < 420) { haptic('heavy'); this.zoomPunch(0.03); }
    this.snd('explode', 1, b.x, b.y);
    this.blast(b.x, b.y, R, dmg, 0xff6b00, 460);
    // своя же бочка опасна: стой подальше
    for (const p of this.alivePlayers()) if (Math.hypot(p.x - b.x, p.y - b.y) < R * 0.6 + PLAYER_R) this.hurt(p, 9 * this.dmgScale);
  }

  private updateProps(dt: number) {
    // выживание: бочки появляются в округе сами
    if (!this.map) {
      this.barrelSpawnT -= dt;
      if (this.barrelSpawnT <= 0) {
        this.barrelSpawnT = 6;
        const pl = this.randomAlive();
        const near = this.props.filter((b) => b.kind === 5 && Math.hypot(b.x - pl.x, b.y - pl.y) < 900).length;
        if (near < 5) {
          const pos = this.findSpawn(pl, 0, undefined, undefined, 240 + Math.random() * 320);
          if (pos) this.addBarrel(pos.x, pos.y, null);
        }
      }
    }
    for (const b of this.props) {
      if (b.dead) continue;
      if (b.kind === 5) this.updateBarrel(b, dt);
      else if (b.kind === 6) {
        b.tick -= dt;
        if (b.tick <= 0 && b.owner) {
          b.tick = 0.6;
          let best: Zombie | null = null, bd = 280 * 280;
          for (const z of this.queryRect(b.x - 280, b.y - 280, b.x + 280, b.y + 280)) {
            const dd = (z.x - b.x) ** 2 + (z.y - b.y) ** 2;
            if (!z.dead && dd < bd) { bd = dd; best = z; }
          }
          if (best) {
            const pts = jagged(b.x, b.y - 16, best.x, best.y);
            this.vfx.bolt(this.elapsed, pts);
            this.E('b', pts.map((v) => v | 0));
            this.snd('zap', 0.45, b.x, b.y, 1.3);
            this.damage(best, b.owner.stats.totemDmg + b.owner.stats.bladeDamage * 0.2);
          }
        }
        if (b.until <= this.elapsed) { b.dead = true; b.img.destroy(); this.burst('dust', 10, b.x, b.y); }
      } else {
        const st = b.owner?.stats;
        if (!b.caught && st) {
          for (const z of this.queryRect(b.x - 30, b.y - 30, b.x + 30, b.y + 30)) {
            if (z.dead || z.boss || z.air || (z.x - b.x) ** 2 + (z.y - b.y) ** 2 > (z.r + 8) ** 2) continue;
            b.caught = z; z.stunT = st.trapHold; b.until = this.elapsed + st.trapHold;
            this.snd('clank', 1, b.x, b.y, 0.7);
            this.ring(b.x, b.y, 150, 0xadb5bd, 0.35, 3);
            this.damage(z, st.trapDmg + st.bladeDamage * 0.3);
            // соседей тянет к пойманному
            for (const o of this.queryRect(b.x - 150, b.y - 150, b.x + 150, b.y + 150)) {
              if (o === z || o.dead || o.heavy || o.air) continue;
              const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1;
              if (d < 150) { o.kx += (dx / d) * 320; o.ky += (dy / d) * 320; }
            }
            break;
          }
        }
        if (b.caught && !b.caught.dead) { b.caught.x = b.x; b.caught.y = b.y; b.caught.kx = 0; b.caught.ky = 0; }
        if (b.until <= this.elapsed) { b.dead = true; b.img.destroy(); this.burst('dust', 6, b.x, b.y); }
      }
    }
    // далеко оставленные бочки убираем (выживание)
    if (!this.map) for (const b of this.props) {
      if (!b.dead && b.kind === 5 && this.players.every((p) => Math.hypot(p.x - b.x, p.y - b.y) > 2200)) { b.dead = true; b.img.destroy(); }
    }
    this.props = this.props.filter((b) => !b.dead);
  }

  private updateBarrel(b: Prop, dt: number) {
    const spd = Math.hypot(b.vx, b.vy);
    if (spd > 4) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const fr = Math.exp(-(b.rolling ? 0.6 : 3.5) * dt);
      b.vx *= fr; b.vy *= fr;
      const ox = b.x, oy = b.y;
      const hit = this.world.resolve(b, BARREL_R);
      if (hit) {
        if (b.rolling) { this.explodeBarrel(b); return; }
        if (Math.abs(b.x - ox) > 0.1) b.vx = -b.vx * 0.4;
        if (Math.abs(b.y - oy) > 0.1) b.vy = -b.vy * 0.4;
      }
      this.world.updateLevel(b);
      if (this.world.kindAtPx(b.x, b.y) === K_PIT) {
        b.dead = true; this.snd('fall', 0.6, b.x, b.y);
        this.tweens.add({ targets: b.img, scale: 0, duration: 400, onComplete: () => b.img.destroy() });
        return;
      }
      if (b.rolling) b.img.setRotation(b.img.rotation + (spd * dt) / BARREL_R);
    } else { b.vx = 0; b.vy = 0; }
    // зомби: сбивает на скорости, иначе обходят; летящий зомби поджигает
    for (const z of this.queryRect(b.x - 50, b.y - 50, b.x + 50, b.y + 50)) {
      if (z.dead || z.air) continue;
      const ox = z.x - b.x, oy = z.y - b.y, min = z.r + BARREL_R, dd = ox * ox + oy * oy;
      if (dd >= min * min || dd < 0.01) continue;
      const dist = Math.sqrt(dd);
      if (spd > 160 && z.bumpCd <= this.elapsed) {
        z.bumpCd = this.elapsed + 0.3;
        this.burst('spark', 3, z.x, z.y);
        this.damage(z, (5 + spd / 70) * (b.rolling ? 2 : 1), Math.atan2(b.vy, b.vx), spd * 0.8);
        if (!b.rolling) { b.vx *= 0.7; b.vy *= 0.7; }
      } else if (!z.heavy) { z.x = b.x + (ox / dist) * min; z.y = b.y + (oy / dist) * min; }
      if (Math.hypot(z.kx, z.ky) > 220 && b.fuse < 0) b.fuse = 0.35;
    }
    // герой толкает бочку
    for (const p of this.alivePlayers()) {
      const ox = b.x - p.x, oy = b.y - p.y, min = PLAYER_R + BARREL_R, dd = ox * ox + oy * oy;
      if (dd >= min * min || dd < 0.01) continue;
      const dist = Math.sqrt(dd);
      b.x = p.x + (ox / dist) * min; b.y = p.y + (oy / dist) * min;
      b.vx = (ox / dist) * 170; b.vy = (oy / dist) * 170;
    }
    if (b.fuse >= 0) {
      b.fuse -= dt;
      const blink = Math.floor(b.fuse * 14) % 2 === 0;
      b.img.setTint(blink ? 0xffffff : 0xffa8a8).setScale((1 + (blink ? 0.12 : 0)) / S);
      if (Math.random() < dt * 30) this.vfx.burst('spark', 1, b.x, b.y - 8);
      if (b.fuse <= 0) { this.explodeBarrel(b); return; }
    }
    b.img.setPosition(b.x, b.y);
  }

  /** Летящий зомби сбивает соседа (кегли). */
  private bonk(z: Zombie, o: Zombie, spd: number) {
    o.bumpCd = this.elapsed + 0.3;
    o.kx += z.kx * 0.6; o.ky += z.ky * 0.6;
    z.kx *= 0.55; z.ky *= 0.55;
    let dmg = 0, crackBy: Player | null = null;
    for (const p of this.players) {
      dmg = Math.max(dmg, p.stats.pinsDmg * Math.min(1.5, spd / 300));
      if (z.hookT > this.elapsed && p.stats.hookPull > 0) dmg = Math.max(dmg, 2 + (p.levels.hook ?? 0) * 1.5);
      if (z.hookT > this.elapsed && p.stats.syn.brittlehook) crackBy = p;
    }
    if (this.elapsed - this.bonkAt > 0.07) { this.bonkAt = this.elapsed; this.snd('hit', 0.55, o.x, o.y, 0.75); this.vfx.burst('spark', 2, o.x, o.y); }
    if (crackBy && ++o.cracks >= 3) {
      o.cracks = 0;
      const x = o.x, y = o.y, sd = o.maxHp * crackBy.stats.crackDmg + crackBy.stats.bladeDamage * 0.5;
      this.timers.push({ at: this.elapsed + 0.02, fn: () => this.blast(x, y, 70, sd, 0x99e9f2, 240, true) });
    }
    if (dmg > 0) { this.damage(o, dmg); this.damage(z, dmg * 0.5); }
  }

  /** Эффекты предметов при любой смерти зомби: метка, жнец, чума. */
  private onKillItems(z: Zombie) {
    let gems = 0, plague = 0, spread = 0, epi = false;
    for (const p of this.players) {
      gems = Math.max(gems, p.stats.markGems * (p.stats.markCd > 0 ? 1 : 0));
      if (p.stats.plagueDps > plague) { plague = p.stats.plagueDps; spread = p.stats.plagueSpread; }
      if (p.stats.syn.epidemic) epi = true;
      if (p.alive && p.stats.reaperEvery > 0 && ++p.reaperN >= p.stats.reaperEvery) {
        p.reaperN = 0;
        this.addBolt(z.x, z.y, Math.random() * Math.PI * 2, 430, 2.6, p.stats.reaperDmg + p.stats.bladeDamage * 0.3, true, 7, p);
      }
    }
    if (z.marked) {
      const x = z.x, y = z.y, d = 8 + z.maxHp * 0.4;
      this.timers.push({ at: this.elapsed + 0.03, fn: () => this.blast(x, y, 120, d, 0xff6b6b, 380) });
      const n = Math.max(3, gems);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.dropGem(x + Math.cos(a) * 40, y + Math.sin(a) * 40, 2, false); }
    }
    if (plague > 0) {
      if (z.plague && epi) {
        const x = z.x, y = z.y, d = z.maxHp * 0.3;
        this.timers.push({ at: this.elapsed + 0.03, fn: () => this.blast(x, y, 75, d, 0xa9e34b, 120, true) });
      }
      let n = spread + (z.plague ? 1 : 0);
      for (const o of this.queryRect(z.x - 130, z.y - 130, z.x + 130, z.y + 130)) {
        if (n <= 0) break;
        if (o.dead || o === z || o.plague) continue;
        o.plague = true; o.bleedUntil = this.elapsed + 4; o.bleedDps = Math.max(o.bleedDps, plague); o.bleedOwner = null;
        this.burst('acid', 3, o.x, o.y);
        n--;
      }
    }
  }

  /** Пульсация меток охотника. */
  private markPulses(dt: number) {
    this.markPulse -= dt;
    if (this.markPulse > 0) return;
    this.markPulse = 0.45;
    for (const z of this.zombies) if (z.marked && !z.dead) this.ring(z.x, z.y, z.r + 14, 0xff6b6b, 0.4, 3);
  }

  /** Аркан: всё внутри петли стягивается в узел и оглушается. */
  private castLasso(poly: { x: number; y: number }[], pl: Player) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, cx = 0, cy = 0;
    for (const p of poly) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); cx += p.x; cy += p.y; }
    cx /= poly.length; cy /= poly.length;
    const st = pl.stats;
    let caught = 0;
    for (const z of this.queryRect(x1, y1, x2, y2)) {
      if (z.dead || !pointInPoly(z.x, z.y, poly)) continue;
      caught++;
      if (!z.boss && !z.air) {
        const dx = cx - z.x, dy = cy - z.y, d = Math.hypot(dx, dy) || 1;
        z.kx = (dx / d) * Math.min(750, d * 6); z.ky = (dy / d) * Math.min(750, d * 6);
        z.stunT = Math.max(z.stunT, st.lassoStun); z.hookT = this.elapsed + 0.6;
      }
      this.damage(z, st.lassoDmg + st.bladeDamage * 0.3);
    }
    this.showPoly(poly, 0x8ce99a);
    this.ring(cx, cy, 40, 0x8ce99a, 0.4, 5);
    this.snd('throw', 1, cx, cy, 0.6);
    if (st.syn.funnel) this.addVortex(cx, cy, pl);
    if (caught >= 4) this.text(cx, cy, `АРКАН ×${caught}`, '#8ce99a', 22);
  }

  /** @returns true если зомби убит */
  /** cut — удар клинком (разрез пополам), иначе тело лопается. pitch — высота «чпока» (растёт в комбо). */
  private damage(z: Zombie, amount: number, ang?: number, knock = 0, cut = false, pitch = 1): boolean {
    if (z.dead) return false;
    z.hp -= amount;
    z.flash = 0.08;
    if (!z.awake) this.wake(z);
    if (ang !== undefined && knock && !z.heavy && !z.air) { z.kx += Math.cos(ang) * knock; z.ky += Math.sin(ang) * knock; }
    if (z.hp > 0) return false;
    this.kill(z, cut ? ang : undefined, pitch);
    return true;
  }

  private kill(z: Zombie, sliceAngle?: number, pitch = 1) {
    if (z.dead) return;
    z.dead = true;
    this.kills++;
    this.addCombo(z);
    z.img.destroy();
    const big = z.r >= 26;
    this.burst('gore', big ? 24 : 9, z.x, z.y);
    if (this.world.kindAtPx(z.x, z.y) !== K_PIT) { this.vfx.splat(z.x, z.y, z.r); this.E('sp', z.x | 0, z.y | 0, z.r); }
    this.snd(sliceAngle !== undefined ? 'kill' : 'pop', big ? 1 : 0.75, z.x, z.y, big ? 0.6 : pitch);
    if (z.boss) {
      this.hitstop = 0.18;
      this.shake(400, 0.015); this.zoomPunch(0.06); haptic('boss');
      this.ring(z.x, z.y, 220, 0xffd43b, 0.6, 6);
      this.burst('magic', 40, z.x, z.y);
      this.snd('explode');
      const chests = (z.final ? 3 : 2) + (this.players.length - 1);
      for (let i = 0; i < chests; i++) this.dropGem(z.x - 30 + i * 30, z.y, 0, true);
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; this.dropGem(z.x + Math.cos(a) * 60, z.y + Math.sin(a) * 60, 3, false); }
      this.toast(`🏆 ${z.boss} повержен!`, 2200);
    } else if (z.type === 'brute') {
      this.shake(140, 0.005);
      this.dropGem(z.x, z.y, 0, true);
      this.dropGem(z.x + 14, z.y, z.xp, false);
    } else {
      this.dropGem(z.x, z.y, z.xp, false);
    }
    if (z.type === 'bomber') {
      const { x, y } = z;
      this.timers.push({ at: this.elapsed + 0.08, fn: () => this.bomb(x, y) });
    }
    if (sliceAngle !== undefined && !z.boss) {
      this.vfx.slice(z.type, z.x, z.y, sliceAngle, z.lvl);
      this.E('c', ZTYPES.indexOf(z.type), z.x | 0, z.y | 0, +sliceAngle.toFixed(2), z.lvl);
    } else if (!z.boss) {
      this.vfx.pop(z.type, z.x, z.y, z.lvl, this.elapsed);
      this.E('o', ZTYPES.indexOf(z.type), z.x | 0, z.y | 0, z.lvl);
    } else this.ring(z.x, z.y, z.r + 8, ZLOOK[z.type].color, 0.2);
    if (z.boss) { this.bossKills++; for (const p of this.players) p.rerolls++; }
    this.onKillItems(z);
    for (const p of this.alivePlayers()) {
      if (p.stats.healEvery && ++p.killsForHeal >= p.stats.healEvery) { p.killsForHeal = 0; p.hp = Math.min(p.stats.maxHp, p.hp + 4); }
    }
  }

  /** Взрыв подрывника: ранит и зомби, и игроков. */
  private bomb(x: number, y: number) {
    this.ring(x, y, BOMB_R, 0xff6b00, 0.4, 6);
    this.burst('spark', 18, x, y); this.burst('dust', 14, x, y); this.burst('gore', 8, x, y);
    this.shake(160, 0.007);
    this.snd('explode', 1, x, y);
    for (const z of this.queryRect(x - BOMB_R, y - BOMB_R, x + BOMB_R, y + BOMB_R)) {
      if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 < (BOMB_R + z.r) ** 2) this.damage(z, 30, Math.atan2(z.y - y, z.x - x), 380);
    }
    for (const p of this.alivePlayers()) if (Math.hypot(p.x - x, p.y - y) < BOMB_R + PLAYER_R) this.hurt(p, 18 * this.dmgScale);
    this.igniteNear(x, y, BOMB_R);
  }

  /** Падение в пропасть. */
  private fall(z: Zombie) {
    z.dead = true;
    this.kills++;
    this.falls++;
    this.addCombo(z);
    this.gainXp(z.xp * 1.5);
    this.snd('fall', 0.7, z.x, z.y);
    this.E('f', ZTYPES.indexOf(z.type), z.x | 0, z.y | 0, +z.img.rotation.toFixed(2), +(z.img.scaleX * S).toFixed(3));
    this.vfx.fall(z.img);
    if (this.elapsed - this.fallTextAt > 1.2) { this.fallTextAt = this.elapsed; this.text(z.x, z.y - 20, 'В ПРОПАСТЬ!', '#ffa94d', 20); }
  }

  private dropGem(x: number, y: number, value: number, chest: boolean, heal = false) {
    if (!chest && !heal && value <= 0) return;
    const ref = this.nearestPlayer(x, y);
    for (let i = 0; i < 6 && (this.world.kindAtPx(x, y) === K_PIT || this.world.solidAtPx(x, y)); i++) {
      x += (ref.x - x) * 0.3; y += (ref.y - y) * 0.3;
    }
    const img = this.add.image(x, y, heal ? 'medkit' : chest ? 'chest' : 'gem').setDepth(2).setScale(0);
    const sc = (chest || heal ? 1 : value >= 5 ? 1.5 : 1) / S;
    if (!chest && !heal && value >= 5) img.setTint(0xb197fc);
    this.tweens.add({ targets: img, scale: sc, duration: 220, ease: 'Back.easeOut' });
    this.gems.push({ x, y, value, chest, heal, img, pulled: false, t: Math.random(), to: null });
  }

  private nearestPlayer(x: number, y: number, aliveOnly = false) {
    let best = this.me, bd = Infinity;
    for (const p of this.players) {
      if (aliveOnly && !p.alive) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private hurt(p: Player, amount: number) {
    if (p.inv > 0 || this.over || !p.alive || this.god) return;
    if (p.stats.wardCd > 0 && p.wardAt <= this.elapsed) {
      p.wardAt = this.elapsed + p.stats.wardCd; p.inv = 0.8;
      this.text(p.x, p.y - 30, 'ОБЕРЕГ', '#ffe066', 18);
      this.ring(p.x, p.y, 170, 0xffe066, 0.45, 5);
      this.snd('bell', 0.7, p.x, p.y, 1.4);
      for (const z of this.queryRect(p.x - 170, p.y - 170, p.x + 170, p.y + 170)) if (!z.dead) this.damage(z, 4, Math.atan2(z.y - p.y, z.x - p.x), 700);
      return;
    }
    p.hp -= amount;
    // удар по герою срезает серию вдвое
    if (this.combo >= 4) { this.combo = Math.floor(this.combo / 2); this.toast(`Комбо сбито: ${this.combo}`, 900); }
    p.inv = 0.6; p.hurtT = 0.25;
    this.burst('gore', 6, p.x, p.y);
    if (p === this.me) {
      this.cameras.main.shake(110, 0.007);
      this.cameras.main.flash(90, 140, 0, 0);
      sfx.play('hurt'); haptic('hurt'); this.hud.hurtFlash();
    } else this.E('h', p.idx);
    if (p.stats.bell && p.hp > 0 && p.hp < p.stats.maxHp * 0.35 && p.bellCd <= this.elapsed) {
      p.bellCd = this.elapsed + 25;
      this.snd('bell', 1, p.x, p.y);
      this.ring(p.x, p.y, 230, 0xffd43b, 0.5, 6);
      this.ring(p.x, p.y, 150, 0xfff3bf, 0.35, 3);
      for (const z of this.queryRect(p.x - 230, p.y - 230, p.x + 230, p.y + 230)) {
        if (!z.dead) this.damage(z, 10 * p.stats.bell, Math.atan2(z.y - p.y, z.x - p.x), 600);
      }
    }
  }

  // ---------- Враги: спаун ----------
  private findSpawn(around: Player, extra = 0, at?: { x: number; y: number }, angle?: number, R0?: number, exact = false) {
    const R = R0 ?? Math.hypot(window.innerWidth, window.innerHeight) / 2 / this.worldZoom + 60 + extra;
    for (let i = 0; i < 12; i++) {
      let x: number, y: number;
      if (at) { const a = Math.random() * Math.PI * 2, d = i === 0 && exact ? 0 : 20 + Math.random() * 50; x = at.x + Math.cos(a) * d; y = at.y + Math.sin(a) * d; }
      else { const a = (angle ?? Math.random() * Math.PI * 2) + (i ? (Math.random() - 0.5) * 0.8 : 0); x = around.x + Math.cos(a) * R; y = around.y + Math.sin(a) * R; }
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (!this.world.landable(tx, ty)) continue;
      if (!this.map && around.field.distAt(x, y) === FlowField.INF) continue;
      // не спавним прямо на виду у второго игрока
      if (!at && R0 === undefined && !this.map && this.players.some((p) => p !== around && Math.hypot(p.x - x, p.y - y) < R * 0.8)) continue;
      return { x, y, lvl: this.world.levelOf(tx, ty) };
    }
    return null;
  }

  private randomAlive() {
    const a = this.alivePlayers();
    return a.length ? a[Math.floor(Math.random() * a.length)] : this.me;
  }

  private spawnZombie(type: ZType, opts: { angle?: number; extra?: number; at?: { x: number; y: number }; final?: boolean; around?: Player; dormant?: boolean; exact?: boolean; pack?: number } = {}): Zombie | null {
    const d = ZDEF[type];
    if (this.zombies.length >= MAX_ZOMBIES && !d.boss) return null;
    const around = opts.around ?? (opts.at ? this.nearestPlayer(opts.at.x, opts.at.y, true) : this.randomAlive());
    const pos = this.findSpawn(around, opts.extra, opts.at, opts.angle, undefined, opts.exact);
    if (!pos) return null;
    const img = this.add.image(pos.x, pos.y, type).setOrigin(zOrigin(type), 0.5).setDepth(d.boss ? 4.5 : 4).setScale(0);
    const hp = d.hp * (d.fodder ? 1 : this.hpScale) * (d.boss ? (1 + 0.5 * this.bossCount) * (opts.final ? 2.5 : 1) * (this.players.length > 1 ? 1.4 : 1) : 1);
    const z: Zombie = {
      id: this.zid++ & 0xffff, type, x: pos.x, y: pos.y, lvl: pos.lvl, hp, maxHp: hp, speed: d.speed * (0.9 + Math.random() * 0.2), r: ZLOOK[type].r,
      dmg: d.dmg, xp: d.xp, img, flash: 0, slowUntil: 0, slowMul: 1, boneCd: 0, dead: false,
      phase: Math.random() * 6, kx: 0, ky: 0, spawnT: 0.45, tgt: around, tgtT: 0, state: 'walk', stateT: 0, dirX: 0, dirY: 0,
      cd1: 1.5 + Math.random() * 2, cd2: 3 + Math.random() * 2, cd3: 2 + Math.random(), heavy: !!d.heavy,
      boss: d.boss ? (opts.final ? `Страж: ${d.boss}` : d.boss) : null, final: !!opts.final,
      navX: pos.x, navY: pos.y, navT: Math.random() * 0.3, navOk: false,
      chkT: 0.6, chkX: pos.x, chkY: pos.y, unT: 0, unX: 0, unY: 0, infT: 0,
      shield: type === 'shield' ? 2 : 0, bleedUntil: 0, bleedDps: 0, bleedOwner: null, boomCd: 0,
      tgtX: 0, tgtY: 0, jx0: 0, jy0: 0, air: false, vsx: 0, vsy: 0, vrot: 0, valpha: 0, vflags: 0,
      awake: opts.dormant ? false : true, wakeT: Math.random() * 0.3,
      pack: opts.pack ?? 0, cracks: 0, stunT: 0, marked: false, plague: false, repCd: 0, bumpCd: 0, hookT: 0,
    };
    // стая идёт одним темпом — так толпа держится кучкой
    if (opts.pack) {
      const ps = this.packSpeed.get(opts.pack);
      if (ps === undefined) this.packSpeed.set(opts.pack, z.speed / d.speed); else z.speed = d.speed * ps;
    }
    this.zombies.push(z);
    if (opts.at || d.boss) this.burst('dust', d.boss ? 30 : 5, pos.x, pos.y);
    return z;
  }

  private pickType(): ZType {
    // волна → «время» для таблицы врагов уровня (волна 10 ≈ 9-я минута)
    const w = this.stage.weights(this.map ? this.progress : this.wave * 54);
    let r = Math.random() * w.reduce((a, b) => a + b[1], 0);
    for (const [k, v] of w) if ((r -= v) <= 0) return k;
    return 'walker';
  }

  /** Выживание: 10 волн. Последние 8 с волны — передышка. Волна 5 — босс, 10 — Страж уровня. */
  private spawn(dt: number) {
    if (this.map) { this.storySpawn(dt); return; }
    const t = this.elapsed;
    const waveLen = this.stageTime / WAVES;
    this.wave = Math.min(WAVES, Math.floor(t / waveLen) + 1);
    const inWave = t - (this.wave - 1) * waveLen;
    if (this.wave !== this.waveAnnounced) {
      this.waveAnnounced = this.wave;
      this.onWaveStart(this.wave);
    }
    if (inWave > waveLen - 8 && this.wave < WAVES) return; // передышка
    const coopMul = this.players.length > 1 ? 1.4 : 1;
    const w = this.wave;
    // с первой секунды на экране есть кого резать; дальше сложность растёт числом, а не «жиром»
    const rate = Math.min(52 * coopMul, (1.8 + w * 2.6 + (w * w) * 0.26) * this.stage.rateMul * coopMul);
    this.spawnAcc += rate * dt;
    // стаями по 5–10: идут кучкой одним темпом
    while (this.spawnAcc >= 10) {
      const n = 7 + Math.floor(Math.random() * 8);
      this.spawnAcc -= n;
      const type = this.pickType();
      const around = this.randomAlive();
      const pos = this.findSpawn(around);
      if (!pos) continue;
      const pack = ++this.packSeq;
      for (let i = 0; i < n; i++) this.spawnZombie(i === 0 || Math.random() < 0.7 ? type : this.pickType(), { at: pos, around, pack });
    }
  }

  private onWaveStart(w: number) {
    const boss = w === 5 || w === WAVES;
    this.toast(boss ? `☠️ Волна ${w}/${WAVES} — БОСС` : `🧟 Волна ${w}/${WAVES}`, 2000);
    this.snd(boss ? 'boss' : 'level', 0.7);
    if (w === 5) {
      const type = this.stage.bosses[0];
      if (this.spawnZombie(type, { extra: 20 })) this.bossCount++;
    }
    if (w === WAVES) {
      const type = this.stage.bosses[1 % this.stage.bosses.length];
      if (this.spawnZombie(type, { extra: 20, final: true })) { this.bossCount++; this.shake(700, 0.01); }
    }
    // орда-кольцо на волнах 3 и 7, отряд толстяков на 4 и 8
    if (w === 3 || w === 7) {
      for (const pl of this.alivePlayers()) {
        // орда — 4 стаи с разных сторон
        for (let k = 0; k < 4; k++) {
          const pack = ++this.packSeq, n = 8 + Math.floor(w * 1.4), a0 = (k / 4) * Math.PI * 2;
          for (let i = 0; i < n; i++) this.spawnZombie(i % 3 === 0 ? this.pickType() : i % 2 ? 'runner' : 'walker', { angle: a0 + (i / n - 0.5) * 0.5, extra: 60, around: pl, pack });
        }
      }
    }
    if (w === 4 || w === 8) {
      const pl = this.randomAlive(), pos = this.findSpawn(pl);
      const pack = ++this.packSeq;
      if (pos) for (let i = 0; i < (w === 4 ? 2 : 4); i++) this.spawnZombie('brute', { at: pos, around: pl, pack });
    }
  }

  // ---------- Пространственная сетка ----------
  private buildGrid() {
    this.grid.clear();
    this.packC.clear();
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (z.pack && z.awake) {
        const c = this.packC.get(z.pack);
        if (c) { c.x += z.x; c.y += z.y; c.n++; } else this.packC.set(z.pack, { x: z.x, y: z.y, n: 1 });
      }
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
  private updateField(p: Player, force = false) {
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (!force && tx === p.fTx && ty === p.fTy && !this.fieldDirty) return;
    if (!force && this.elapsed - p.fAt < 0.15) return;
    p.field.compute(this.world, tx, ty);
    p.fTx = tx; p.fTy = ty; p.fAt = this.elapsed;
  }

  private graves(dt: number) {
    this.graveTick -= dt;
    if (this.graveTick > 0) return;
    this.graveTick = 4.5;
    for (const img of this.chunks.graves()) {
      const p = this.nearestPlayer(img.x, img.y, true);
      const d = Math.hypot(img.x - p.x, img.y - p.y);
      if (d > 800 || d < 120) continue;
      const z = this.spawnZombie(Math.random() < 0.3 ? 'ghost' : 'walker', { at: { x: img.x, y: img.y + 30 }, around: p });
      if (z) this.burst('magic', 6, img.x, img.y);
    }
  }

  // ---------- Главный цикл ----------
  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    const now = performance.now();
    if (this.showFps && now - this.fpsAt > 500) {
      this.fpsAt = now;
      this.hud.setFps(`${Math.round(this.game.loop.actualFps)} fps · ${this.zombies.length} z`);
    }
    if (this.coop && now - this.snapAt >= SNAP_MS) { this.snapAt = now; this.sendSnapshot(); }
    else if (this.coop && this.ev.length) { this.net!.sendFast({ t: 'ev', ev: this.ev }); this.ev = []; }
    if (this.paused || this.over) { this.draw(); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; this.draw(); return; }
    this.elapsed += dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.elapsed) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }

    this.moveLocal(dt);
    for (const p of this.players) this.tickPlayer(p, dt);
    for (const p of this.players) this.updateField(p);
    this.fieldDirty = false;
    this.spawn(dt);
    if (this.stage.gen.graves[1] > 0) this.graves(dt);
    this.buildGrid();
    // Хронос: время для зомби почти стоит
    const zdt = this.chronoUntil > this.elapsed ? dt * 0.12 : dt;
    for (const z of this.zombies) if (!z.dead) this.updateZombie(z, zdt);
    this.updateProps(dt);
    this.updateProjs(zdt);
    this.updateBooms(dt);
    this.updateShapes(dt);
    this.tickCombo(dt);
    if (this.elapsed - this.lifeAt > 10) { this.lifeAt = this.elapsed; this.flushLife(false, false); }
    const nowMs = performance.now();
    for (const st of this.strokes.values()) if (st.pts.length === 1 && nowMs - st.lastT > 500) this.chargeStroke(st);
    for (const p of this.alivePlayers()) this.trinkets(p, dt);
    this.markPulses(dt);
    this.burnTrails(dt);
    this.collectGems(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);
    if (this.elapsed - this.chunkAt > 0.12) { this.chunkAt = this.elapsed; this.chunks.update(this.me.x, this.me.y); }

    this.checkDeaths(dt);
    if (this.over) return;
    if (this.elapsed >= this.stageTime) { this.victory(); return; }
    if (this.map) { this.updateObjectives(dt); if (this.over) return; }
    if (this.pendingLevels > 0) this.openLevelUp();
    this.draw();
  }

  private checkDeaths(dt: number) {
    for (const p of this.players) {
      if (p.alive && p.hp <= 0) {
        if (p.stats.phoenix && !p.phoenixUsed) { this.revive(p, true); continue; }
        p.alive = false; p.hp = 0; p.downT = 0;
        if (p === this.me) { this.endLocalStrokes(); this.controls?.reset(); }
        if (this.players.length > 1 && this.alivePlayers().length) this.toast(`${p.idx === 0 ? 'Игрок 1' : 'Игрок 2'} повержен! Постой рядом, чтобы поднять`, 2500);
      }
    }
    if (!this.alivePlayers().length) { this.gameOver(); return; }
    for (const p of this.players) {
      if (p.alive) continue;
      const helper = this.players.find((h) => h.alive && Math.hypot(h.x - p.x, h.y - p.y) < REVIVE_R);
      p.downT = helper ? p.downT + dt / 3 : Math.max(0, p.downT - dt / 6);
      if (p.downT >= 1) this.revive(p, false);
    }
  }

  private revive(p: Player, phoenix: boolean) {
    if (phoenix) p.phoenixUsed = true;
    p.alive = true; p.downT = 0;
    p.hp = p.stats.maxHp * (phoenix ? 0.5 : 0.4);
    p.inv = 2;
    this.toast(phoenix ? '🪶 Феникс! Второй шанс' : `💚 ${p.idx === 0 ? 'Игрок 1' : 'Игрок 2'} снова в строю!`, 2000);
    this.burst('magic', 50, p.x, p.y);
    this.snd('level', 1, p.x, p.y);
    this.blast(p.x, p.y, 260, phoenix ? 60 : 20, 0xff922b, 600);
  }

  private moveLocal(dt: number) {
    const p = this.me;
    if (!p.alive) { p.moving = 0; p.running = false; return; }
    const { dx, dy, run, mag } = this.controls.read();
    const onToxic = this.world.kindAtPx(p.x, p.y) === K_TOXIC;
    const sp = PLAYER_SPEED * p.stats.speedMul * (onToxic ? 0.7 : 1) * (run ? RUN_MUL : 1);
    if (mag > 0.05) this.bumpDoor(p, dx, dy);
    p.x += dx * sp * dt; p.y += dy * sp * dt;
    this.world.resolve(p, PLAYER_R);
    this.world.updateLevel(p);
    p.moving = mag; p.running = run;
    if (mag > 0.05) p.rot = Math.atan2(dy, dx);
  }

  // ---------- Двери ----------
  /** Игрок упёрся в закрытую дверь — открывает её. */
  private bumpDoor(p: Player, dx: number, dy: number) {
    const tx = Math.floor((p.x + dx * (PLAYER_R + 8)) / TILE), ty = Math.floor((p.y + dy * (PLAYER_R + 8)) / TILE);
    if (this.world.kind(tx, ty) === K_DOOR) this.setDoor(tx, ty, 1);
  }

  /** Тап по двери рядом с игроком: открыть/закрыть. */
  private tryToggleDoor(p: Player, wx: number, wy: number) {
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    const k = this.world.kind(tx, ty);
    if (k !== K_DOOR && k !== K_DOOROPEN) return false;
    if (Math.hypot((tx + 0.5) * TILE - p.x, (ty + 0.5) * TILE - p.y) > TILE * 2.6) return false;
    if (k === K_DOOROPEN) {
      // нельзя закрыть, если в проёме кто-то стоит
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      if (this.players.some((q) => Math.abs(q.x - cx) < TILE * 0.8 && Math.abs(q.y - cy) < TILE * 0.8)) return true;
      if (this.zombies.some((z) => !z.dead && Math.abs(z.x - cx) < TILE * 0.7 && Math.abs(z.y - cy) < TILE * 0.7)) return true;
      this.setDoor(tx, ty, 0);
    } else this.setDoor(tx, ty, 1);
    return true;
  }

  /** 0 закрыта, 1 открыта, 2 выломана. */
  private setDoor(tx: number, ty: number, state: number) {
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    this.world.setKind(tx, ty, state === 0 ? K_DOOR : state === 1 ? K_DOOROPEN : K_FLOOR);
    if (state !== 0) this.world.crateHp.delete(key2(tx, ty));
    this.chunks.setDoor(tx, ty, state);
    this.E('D', tx, ty, state);
    this.fieldDirty = true;
    if (state === 2) { this.burst('wood', 18, cx, cy); this.snd('crate', 1, cx, cy); this.shake(90, 0.003); }
    else this.snd('clank', 0.6, cx, cy, state === 0 ? 0.6 : 0.8);
  }

  /** Зомби ломится в закрытую дверь: дверь — цель его пути и он стоит вплотную. @returns ломится ли */
  private bashDoor(z: Zombie, dt: number) {
    if (!z.navOk) return false;
    const tx = Math.floor(z.navX / TILE), ty = Math.floor(z.navY / TILE);
    if (this.world.kind(tx, ty) !== K_DOOR) return false;
    const ax = tx * TILE, ay = ty * TILE;
    const nx = Math.max(ax, Math.min(z.x, ax + TILE)), ny = Math.max(ay, Math.min(z.y, ay + TILE));
    if (Math.hypot(z.x - nx, z.y - ny) > Math.min(z.r, 21) + 8) return false;
    z.chkX = z.x; z.chkY = z.y; z.unT = 0; // ломится, а не застрял
    const k = key2(tx, ty);
    const hp = (this.world.crateHp.get(k) ?? DOOR_HP) - dt * (z.heavy ? 5 : 1.5);
    if (Math.random() < dt * 2) { this.chunks.hitTile(tx, ty, 1, 1); this.snd('crate', 0.5, z.x, z.y, 0.7); this.burst('wood', 2, (tx + 0.5) * TILE, (ty + 0.5) * TILE); }
    if (hp <= 0) this.setDoor(tx, ty, 2); else this.world.crateHp.set(k, hp);
    return true;
  }

  /** Общие для всех игроков таймеры, яд, внешний вид. */
  private tickPlayer(p: Player, dt: number) {
    // шум в клетках: бег 40, шаг 10, стоя 3 (резкий свайп добавляет)
    p.noise = !p.alive ? 0 : p.running ? 40 : p.moving > 0.1 ? 10 : 3;
    p.onToxic = p.alive && this.world.kindAtPx(p.x, p.y) === K_TOXIC;
    if (p.onToxic) {
      if (!this.god) p.hp -= 6 * this.stage.dmgMul * dt;
      p.toxicTick -= dt;
      if (p.toxicTick <= 0) { p.toxicTick = 0.15; this.burst('acid', 1, p.x, p.y); }
    }
    p.bob += dt * 14 * p.moving;
    if (p.alive && p.moving > 0.3 && p === this.me) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.16; this.vfx.burst('step', 1, p.x - Math.cos(p.rot) * 10, p.y - Math.sin(p.rot) * 10 + 6); } }
    const sc = ((1 + 0.07 * p.lvl) * (1 + Math.sin(p.bob) * 0.05 * p.moving)) / S;
    p.img.setPosition(p.x, p.y).setScale(sc).setRotation(p.rot);
    const key = p.idx === 0 ? 'player' : 'player2';
    const fr = p.moving > 0.1 && p.alive ? `${key}_w${Math.floor(p.bob / (Math.PI / 2)) % WALK_FRAMES}` : key;
    if (p.img.texture.key !== fr) p.img.setTexture(fr);
    p.inv = Math.max(0, p.inv - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    styleDowned(p.img, p.alive, p.inv, p.hurtT > 0, p.onToxic);
  }

  /** Куда приземлиться прыгуну: точка у цели, на которую можно встать. */
  private pickLanding(z: Zombie, maxD: number) {
    let tx = z.tgt.x, ty = z.tgt.y;
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
    z.tgtT -= dt;
    if (z.tgtT <= 0 || !z.tgt.alive) {
      z.tgtT = 0.5;
      const t = this.nearestPlayer(z.x, z.y, true);
      if (t !== z.tgt) { z.tgt = t; z.navT = 0; }
    }
    if (z.spawnT > 0) {
      z.spawnT -= dt;
      const k = Math.max(0, 1 - z.spawnT / 0.45);
      const sc = lift * Phaser.Math.Easing.Back.Out(k);
      const al = Math.min(1, k * 2) * (z.type === 'ghost' ? 0.6 : 1);
      z.img.setPosition(z.x, z.y).setScale(sc / S).setAlpha(al);
      z.vsx = z.vsy = sc; z.valpha = al; z.vrot = z.img.rotation; z.vflags = 0;
      return;
    }
    if (!z.awake) {
      this.checkWake(z, dt);
      if (!z.awake) {
        z.phase += dt * 1.5;
        const sc = lift * (1 + Math.sin(z.phase) * 0.03);
        z.img.setPosition(z.x, z.y).setScale(sc / S).setRotation(z.phase * 0.2 + z.id).setAlpha(1);
        if (z.flash > 0) { z.flash -= dt; z.img.setTintFill(0xffffff); } else z.img.setTint(0xbfc5ca);
        z.vsx = z.vsy = sc; z.valpha = 1; z.vrot = z.img.rotation; z.vflags = z.flash > 0 ? ZF.FLASH : 0;
        return;
      }
    }
    if (z.bleedUntil > this.elapsed) {
      z.hp -= z.bleedDps * dt;
      if (Math.random() < dt * 3) this.vfx.burst(z.plague ? 'acid' : 'gore', 1, z.x, z.y);
      if (z.hp <= 0) {
        const o = z.bleedOwner;
        if (o?.alive && o.stats.syn.thirst) o.hp = Math.min(o.stats.maxHp, o.hp + 1);
        this.kill(z); return;
      }
    }
    const pl = z.tgt;
    const dx = pl.x - z.x, dy = pl.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const onToxic = this.world.kindAtPx(z.x, z.y) === K_TOXIC;
    const slow = (z.slowUntil > this.elapsed ? z.slowMul : 1) * (onToxic && z.type !== 'ghost' ? 0.8 : 1);
    let mx = 0, my = 0, sp = z.speed * slow;

    const steer = () => {
      if (d < 110 && Math.abs(z.lvl - pl.lvl) < 0.1 && this.world.clearLine(z.x, z.y, pl.x, pl.y, z.lvl)) { mx = dx / d; my = dy / d; return; }
      if (z.navT <= this.elapsed || (z.navX - z.x) ** 2 + (z.navY - z.y) ** 2 < 144) {
        z.navT = this.elapsed + 0.25 + Math.random() * 0.15;
        const t = pl.field.steer(this.world, z.x, z.y, z.r, z.lvl);
        if (t) { z.navX = t.x; z.navY = t.y; z.navOk = true; } else z.navOk = false;
      }
      if (z.navOk) {
        const ex = z.navX - z.x, ey = z.navY - z.y, el = Math.hypot(ex, ey) || 1;
        mx = ex / el; my = ey / el;
      } else { mx = dx / d; my = dy / d; }
    };

    const far = Math.hypot(window.innerWidth, window.innerHeight) / this.worldZoom * 1.1 + 200;
    const fd = pl.field.distAt(z.x, z.y);
    z.infT = fd === FlowField.INF && z.type !== 'ghost' && !z.air ? z.infT + dt : 0;
    if (!this.map && (d > far || z.infT > 2) && !z.air) {
      const p = this.findSpawn(pl, 40);
      if (p) { z.x = p.x; z.y = p.y; z.lvl = p.lvl; z.state = 'walk'; z.infT = 0; z.navT = 0; }
      return;
    }

    let ghost = false;
    if (z.stunT > 0) {
      z.stunT -= dt; sp = 0;
      if (z.type === 'ghost') ghost = true;
      if (Math.random() < dt * 5) this.vfx.burst('spark', 1, z.x, z.y - z.r);
    } else switch (z.type) {
      case 'charger':
      case 'boar':
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
          mx = z.dirX; my = z.dirY; sp = 470 * slow;
          if (Math.random() < 0.5) this.vfx.burst('dust', 1, z.x, z.y);
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
        if (z.cd1 <= 0 && d < 430) { z.cd1 = 2.3 + Math.random(); this.shoot(z, 0, 0, 240, 9); z.flash = 0.05; }
        break;
      case 'jumper':
      case 'leaper': {
        const boss = z.type === 'leaper';
        if (z.state === 'walk') {
          steer();
          z.cd1 -= dt;
          const blockedPath = Math.abs(z.lvl - pl.lvl) > 0.1 || !this.world.clearLine(z.x, z.y, pl.x, pl.y, z.lvl);
          if (z.cd1 <= 0 && d < (boss ? 460 : 380) && (blockedPath || Math.random() < 0.6)) this.startJump(z, boss ? 460 : 380, boss ? 0.9 : 0.7);
          else if (z.cd1 <= 0) z.cd1 = 0.5;
          if (boss) { z.cd2 -= dt; if (z.cd2 <= 0) { z.cd2 = 8; this.summon(z, 'jumper', 3); } }
        } else if (z.state === 'charge') {
          sp = 0; z.stateT -= dt;
          if (z.stateT <= 0) {
            z.state = 'jump'; z.stateT = boss ? 0.8 : 0.6; z.jx0 = z.x; z.jy0 = z.y; z.air = true;
            z.img.setDepth(6.5);
            this.snd('jump', boss ? 1 : 0.6, z.x, z.y);
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
            this.burst('dust', boss ? 26 : 8, z.x, z.y);
            this.snd('land', boss ? 1 : 0.6, z.x, z.y);
            if (boss) { this.ring(z.x, z.y, R, 0xb197fc, 0.4, 6); this.shake(220, 0.01); }
            for (const p of this.alivePlayers()) if (Math.hypot(p.x - z.x, p.y - z.y) < R + PLAYER_R) this.hurt(p, (boss ? 26 : 12) * this.dmgScale);
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
          if (d < z.r + PLAYER_R + 22 && Math.abs(z.lvl - pl.lvl) <= 0.5) { z.state = 'fuse'; z.stateT = 0.6; this.snd('fuse', 1, z.x, z.y); }
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
        if (z.cd1 <= 0 && d < 480) { z.cd1 = 3; for (let i = -2; i <= 2; i++) this.shoot(z, i * 0.22, 0, 240, 9); }
        break;
      case 'necro':
        steer();
        if (d < 250) { mx = -dx / d; my = -dy / d; } else if (d < 380) sp *= 0.25;
        z.cd1 -= dt; z.cd2 -= dt; z.cd3 -= dt;
        if (z.cd1 <= 0) {
          z.cd1 = 6;
          const p = this.findSpawn(pl, 0, undefined, undefined, 260 + Math.random() * 80);
          if (p) {
            this.burst('magic', 20, z.x, z.y); this.snd('zap', 1, z.x, z.y);
            z.x = p.x; z.y = p.y; z.lvl = p.lvl; z.navT = 0;
            this.burst('magic', 20, z.x, z.y);
          }
        }
        if (z.cd2 <= 0) { z.cd2 = 7; this.summon(z, Math.random() < 0.5 ? 'ghost' : 'walker', 5); }
        if (z.cd3 <= 0 && d < 520) { z.cd3 = 2.8; for (let i = -1; i <= 1; i++) this.shoot(z, i * 0.3, 1, 160, 12); }
        break;
      default:
        steer();
    }

    // стая: держимся ближе к своим, пока цель далеко
    if (z.pack && z.state === 'walk' && !ghost && z.stunT <= 0 && d > 170) {
      const c = this.packC.get(z.pack);
      if (c && c.n > 1) {
        const cx = c.x / c.n - z.x, cy = c.y / c.n - z.y, cd = Math.hypot(cx, cy);
        if (cd > 36) {
          const k = Math.min(0.4, (cd - 36) / 220);
          mx = mx * (1 - k) + (cx / cd) * k; my = my * (1 - k) + (cy / cd) * k;
          const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
        }
      }
    }

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
          // летящий зомби передаёт импульс: толпа валится как кегли
          if (knockSpd > 210 && o.bumpCd <= this.elapsed && !o.heavy && !o.boss) this.bonk(z, o, knockSpd);
          if (z.dead) return;
        }
      }
      // в героя не влезаем: тела плотные
      for (const p of this.players) {
        if (!p.alive || ghost || Math.abs(z.lvl - p.lvl) > 0.5) continue;
        const ox = z.x - p.x, oy = z.y - p.y, min = z.r + PLAYER_R - 3, dd = ox * ox + oy * oy;
        if (dd >= min * min || dd < 0.01) continue;
        const dist = Math.sqrt(dd);
        z.x = p.x + (ox / dist) * min; z.y = p.y + (oy / dist) * min;
        if (p.stats.repulseKnock > 0 && z.repCd <= this.elapsed) {
          z.repCd = this.elapsed + 0.7;
          this.vfx.burst('magic', 3, z.x, z.y);
          if (this.damage(z, p.stats.repulseDmg, Math.atan2(oy, ox), p.stats.repulseKnock)) continue;
          if (z.heavy) { z.x += (ox / dist) * 24; z.y += (oy / dist) * 24; }
        }
      }
      if (z.dead) return;
      if (!ghost) {
        const flung = knockSpd > 140 && !z.heavy;
        const hitWall = this.world.resolve(z, z.r, flung);
        this.world.updateLevel(z);
        if (this.world.kindAtPx(z.x, z.y) === K_PIT) { this.fall(z); return; }
        if (this.map && z.state === 'walk') this.bashDoor(z, dt);
        if (z.state === 'dash' && hitWall) {
          z.state = 'stun'; z.stateT = 0.9;
          this.burst('dust', 12, z.x, z.y);
          this.snd('land', 0.5, z.x, z.y);
        }
        let slam = 0;
        for (const p of this.players) slam = Math.max(slam, p.stats.wallSlam);
        if (hitWall && knockSpd > 150 && slam > 0) {
          z.kx = 0; z.ky = 0;
          this.burst('dust', 5, z.x, z.y);
          this.snd('hit', 1, z.x, z.y);
          if (this.damage(z, slam)) return;
        }
      } else {
        z.lvl = pl.lvl;
      }
      if (z.type !== 'bomber') {
        for (const p of this.players) {
          if (!p.alive || p.inv > 0) continue;
          if (z.stunT <= 0 && Math.hypot(p.x - z.x, p.y - z.y) < z.r + PLAYER_R && (ghost || Math.abs(z.lvl - p.lvl) <= 0.5)) this.hurt(p, z.dmg * this.dmgScale * p.stats.contactMul);
        }
      }
    }

    if (z.dead) return;
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
    const alpha = ghost ? 0.45 + Math.sin(this.elapsed * 5 + z.phase) * 0.15 : 1;
    z.img.setPosition(z.x, z.y).setRotation(rot + wob * 0.6).setScale(sx / S, sy / S).setAlpha(alpha);
    const base = z.type === 'shield' && z.shield === 0 ? 'shield_broken' : z.type;
    const fr = moving ? `${base}_w${Math.floor(z.phase / (Math.PI / 2)) % WALK_FRAMES}` : base;
    if (z.img.texture.key !== fr) z.img.setTexture(fr);
    let flags = 0;
    if (z.flash > 0) { z.flash -= dt; z.img.setTintFill(0xffffff); flags |= ZF.FLASH; }
    else if (['windup', 'slam', 'charge', 'fuse'].includes(z.state)) { z.img.setTint(0xff8787); flags |= ZF.RED; }
    else if (z.slowUntil > this.elapsed) { z.img.setTint(0x9fd4ff); flags |= ZF.FROST; }
    else if (z.plague && z.bleedUntil > this.elapsed) z.img.setTint(0xb8e986);
    else if (z.stunT > 0) z.img.setTint(0xd0bfff);
    else z.img.clearTint();
    if (z.type === 'shield' && z.shield === 0) flags |= ZF.BROKEN;
    if (z.boss) flags |= ZF.BOSS;
    if (z.air) flags |= ZF.AIR;
    z.vsx = sx; z.vsy = sy; z.vrot = rot + wob; z.valpha = alpha; z.vflags = flags;
  }

  private shoot(z: Zombie, offset: number, kind: number, speed: number, dmg: number) {
    const a = Math.atan2(z.tgt.y - z.y, z.tgt.x - z.x) + offset;
    const img = this.add.image(z.x, z.y, kind === 1 ? 'orb' : 'acid').setScale(1 / S).setDepth(7.5);
    this.projs.push({ x: z.x, y: z.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2.8, dmg: dmg * this.dmgScale, img, dead: false, friendly: false, kind });
    this.snd('spit', 0.6, z.x, z.y);
  }

  private slam(z: Zombie) {
    this.ring(z.x, z.y, SLAM_R, 0xff6b6b, 0.4, 8);
    this.shake(260, 0.012);
    this.snd('land', 1, z.x, z.y);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; this.vfx.burst('dust', 1, z.x + Math.cos(a) * SLAM_R * 0.8, z.y + Math.sin(a) * SLAM_R * 0.8); }
    this.E('p', EMITTERS.indexOf('dust'), 20, z.x | 0, z.y | 0);
    for (const p of this.alivePlayers()) if (Math.hypot(p.x - z.x, p.y - z.y) < SLAM_R + PLAYER_R) this.hurt(p, 28 * this.dmgScale);
  }

  private summon(z: Zombie, type: ZType, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawnZombie(type, { at: { x: z.x + Math.cos(a) * (z.r + 26), y: z.y + Math.sin(a) * (z.r + 26) }, around: z.tgt });
    }
    this.ring(z.x, z.y, z.r + 40, 0xb197fc, 0.4);
  }

  /** Копья/осколки, мины, вихри, волны. */
  private updateShapes(dt: number) {
    for (const b of this.bolts) {
      if (b.homing) {
        // душа доворачивает к ближайшему ещё не задетому
        let best: Zombie | null = null, bd = 420 * 420;
        for (const z of this.queryRect(b.x - 420, b.y - 420, b.x + 420, b.y + 420)) {
          if (z.dead || b.hit.has(z)) continue;
          const dd = (z.x - b.x) ** 2 + (z.y - b.y) ** 2;
          if (dd < bd) { bd = dd; best = z; }
        }
        if (best) {
          const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y - b.y, best.x - b.x);
          const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
          const na = cur + Phaser.Math.Clamp(diff, -7 * dt, 7 * dt), sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
        if (Math.random() < dt * 20) this.vfx.burst('heal', 1, b.x, b.y);
      }
      const ox = b.x, oy = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.kind === 9) b.img.setRotation(b.img.rotation + dt * 12); else b.img.setRotation(Math.atan2(b.vy, b.vx));
      if (b.life > 0 && b.bounces > 0 && this.world.solidAtPx(b.x, b.y)) {
        const sx = this.world.solidAtPx(b.x, oy), sy = this.world.solidAtPx(ox, b.y);
        if (sx || !sy) b.vx = -b.vx;
        if (sy || !sx) b.vy = -b.vy;
        b.x = ox; b.y = oy; b.bounces--; b.hit.clear();
        this.burst('spark', 4, b.x, b.y); this.snd('clank', 0.5, b.x, b.y, 1.6);
      }
      b.img.setPosition(b.x, b.y);
      if (b.life <= 0 || (!b.homing && this.world.solidAtPx(b.x, b.y))) { b.dead = true; b.img.destroy(); this.vfx.burst('spark', 4, b.x, b.y); continue; }
      const st = b.owner.stats, ang = Math.atan2(b.vy, b.vx);
      for (const z of this.queryRect(b.x - 50, b.y - 50, b.x + 50, b.y + 50)) {
        if (z.dead || b.hit.has(z) || (z.x - b.x) ** 2 + (z.y - b.y) ** 2 > (z.r + 10) ** 2) continue;
        b.hit.add(z);
        if (z.shield > 0 && b.kind === 3) { z.shield = 0; z.img.setTexture('shield_broken'); }
        if (b.kind === 4 && st.syn.iceshards) { z.slowUntil = this.elapsed + 2; z.slowMul = z.boss ? 0.6 : 0.15; }
        this.burst('spark', 3, z.x, z.y);
        const killed = this.damage(z, b.dmg, ang, 180, true);
        if (b.kind === 3 && st.syn.thunderspear) this.chain(z, b.owner);
        if (!killed) this.snd('hit', 0.6, z.x, z.y);
        if (!b.pierce) { b.dead = true; b.img.destroy(); break; }
      }
    }
    this.bolts = this.bolts.filter((b) => !b.dead);

    for (const m of this.mines) {
      m.t -= dt;
      m.img.setScale((1 + Math.sin(this.elapsed * 30) * 0.12) / S);
      if (m.t > 0) continue;
      m.img.destroy();
      this.blast(m.x, m.y, m.r, m.dmg, 0xffd43b, 260);
      if (m.owner.stats.syn.cluster) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, x = m.x + Math.cos(a) * 55, y = m.y + Math.sin(a) * 55;
          this.timers.push({ at: this.elapsed + 0.1 + i * 0.07, fn: () => this.blast(x, y, m.r * 0.6, m.dmg * 0.5, 0xffa94d, 200) });
        }
      }
    }
    this.mines = this.mines.filter((m) => m.t > 0);

    for (const v of this.vortices) {
      const left = v.until - this.elapsed;
      v.tick -= dt;
      const tick = v.tick <= 0;
      if (tick) v.tick = 0.25;
      for (const z of this.queryRect(v.x - v.r, v.y - v.r, v.x + v.r, v.y + v.r)) {
        if (z.dead || z.air) continue;
        const dx = v.x - z.x, dy = v.y - z.y, d = Math.hypot(dx, dy) || 1;
        if (d > v.r + z.r) continue;
        if (!z.heavy) { const pull = Math.min(d, 230 * dt); z.x += (dx / d) * pull - (dy / d) * 90 * dt; z.y += (dy / d) * pull + (dx / d) * 90 * dt; }
        if (tick) this.damage(z, v.dps * 0.25);
      }
      if (left <= 0 && v.owner.stats.syn.tornado) this.blast(v.x, v.y, v.r * 1.2, v.dps, 0xa5d8ff, 900);
    }
    this.vortices = this.vortices.filter((v) => v.until > this.elapsed);

    for (const w of this.waves) {
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      const sc = 1 + (w.s1 - 1) * Phaser.Math.Easing.Cubic.Out(k);
      const r = w.rel;
      for (let i = 0; i + 3 < r.length; i += 2) {
        const x1 = w.cx + r[i] * sc, y1 = w.cy + r[i + 1] * sc, x2 = w.cx + r[i + 2] * sc, y2 = w.cy + r[i + 3] * sc;
        for (const z of this.queryRect(Math.min(x1, x2) - 40, Math.min(y1, y2) - 40, Math.max(x1, x2) + 40, Math.max(y1, y2) + 40)) {
          if (z.dead || w.hit.has(z) || distToSeg(z.x, z.y, x1, y1, x2, y2) > z.r + 14) continue;
          w.hit.add(z);
          this.damage(z, w.dmg, Math.atan2(z.y - w.cy, z.x - w.cx), 140);
        }
        if (w.fire && k >= 1 && !w.burned) this.addBurn(x1, y1, x2, y2, 22, w.owner, 1.5);
      }
      if (k >= 1) w.burned = true;
    }
    this.waves = this.waves.filter((w) => w.t < w.dur);
  }

  private updateProjs(dt: number) {
    for (const p of this.projs) {
      if (p.dead) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.img.setPosition(p.x, p.y).setRotation(p.img.rotation + dt * 8).setScale((1 + Math.sin(p.life * 20) * 0.15) / S);
      if (!p.friendly && Math.random() < dt * 25) this.vfx.burst(p.kind === 1 ? 'magic' : 'acid', 1, p.x, p.y); // шлейф
      if (p.life <= 0 || this.world.solidAtPx(p.x, p.y)) {
        p.dead = true; p.img.destroy(); this.burst('acid', 8, p.x, p.y);
        continue;
      }
      if (p.friendly) {
        for (const z of this.queryRect(p.x - 40, p.y - 40, p.x + 40, p.y + 40)) {
          if (z.dead || (z.x - p.x) ** 2 + (z.y - p.y) ** 2 > (z.r + 9) ** 2) continue;
          this.damage(z, p.dmg, Math.atan2(p.vy, p.vx), 200);
          p.dead = true; p.img.destroy(); this.burst('spark', 8, p.x, p.y); this.snd('hit', 1, p.x, p.y);
          break;
        }
        continue;
      }
      for (const pl of this.alivePlayers()) {
        if (Math.hypot(pl.x - p.x, pl.y - p.y) < PLAYER_R + 8) {
          p.dead = true; p.img.destroy(); this.burst('acid', 10, p.x, p.y);
          this.hurt(pl, p.dmg);
          break;
        }
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }

  private updateBooms(dt: number) {
    for (const b of this.booms) {
      b.t += dt;
      const o = b.owner;
      if (b.t < 0.45) { b.x += b.vx * dt; b.y += b.vy * dt; }
      else {
        const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) || 1;
        const sp = 700 * dt;
        b.x += (dx / d) * Math.min(sp, d); b.y += (dy / d) * Math.min(sp, d);
        if (d < 22 || b.t > 2.5) { b.dead = true; b.img.destroy(); continue; }
      }
      b.img.setPosition(b.x, b.y).setRotation(b.t * 22);
      for (const z of this.queryRect(b.x - 60, b.y - 60, b.x + 60, b.y + 60)) {
        if (z.dead || z.boomCd > this.elapsed || (z.x - b.x) ** 2 + (z.y - b.y) ** 2 > (z.r + 16) ** 2) continue;
        z.boomCd = this.elapsed + 0.25;
        this.burst('spark', 3, z.x, z.y);
        if (z.shield > 0) { z.shield--; this.snd('clank', 1, z.x, z.y); if (!z.shield) z.img.setTexture('shield_broken'); continue; }
        this.damage(z, b.dmg, Math.atan2(b.vy, b.vx), 160, true);
      }
    }
    this.booms = this.booms.filter((b) => !b.dead);
  }

  private trinkets(p: Player, dt: number) {
    const s = p.stats;
    const { x: px, y: py } = p;
    // Якорь
    p.stillT = p.moving > 0.1 ? 0 : p.stillT + dt;
    const wasRooted = p.rooted;
    p.rooted = s.anchorMul > 0 && p.stillT >= 0.6;
    if (p.rooted && !wasRooted) { this.ring(px, py, 42, 0xadb5bd, 0.4, 5); this.burst('dust', 6, px, py); }
    // Метка охотника
    if (s.markCd > 0) {
      p.markT -= dt;
      if (p.markT <= 0) {
        p.markT = s.markCd;
        let best: Zombie | null = null;
        for (const z of this.queryRect(px - 480, py - 480, px + 480, py + 480)) {
          if (z.dead || z.boss || z.marked || !z.awake) continue;
          if (!best || z.maxHp > best.maxHp) best = z;
        }
        if (best) { best.marked = true; this.text(best.x, best.y - 30, 'МЕТКА', '#ff6b6b', 16); this.snd('charge', 0.5, best.x, best.y, 1.3); }
      }
    }
    // Тотем
    if (s.totemCd > 0) {
      p.totemT -= dt;
      if (p.totemT <= 0) { p.totemT = s.totemCd; this.addProp(6, px, py + 6, p, s.totemDur); this.snd('land', 0.6, px, py); }
    }
    // Бочкарь
    if (s.barrelCd > 0) {
      p.barrelT -= dt;
      if (p.barrelT <= 0) {
        p.barrelT = s.barrelCd;
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2, d = 110 + Math.random() * 60;
          const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
          if (this.world.solidAtPx(x, y) || this.world.kindAtPx(x, y) === K_PIT) continue;
          this.addBarrel(x, y, p); this.snd('crate', 0.6, x, y, 0.7);
          break;
        }
      }
    }
    // Хронос
    if (s.chronoDur > 0 && this.combo >= 40 && p.chronoAt <= this.elapsed) {
      p.chronoAt = this.elapsed + s.chronoCd;
      this.chronoUntil = this.elapsed + s.chronoDur;
      this.toast('⏳ Время замерло', 1200);
      this.ring(px, py, 420, 0xa5d8ff, 0.7, 8);
      this.snd('rune', 1, px, py, 0.7);
    }
    if (s.auraRadius > 0) {
      p.auraTick += dt;
      if (p.auraTick >= 0.5) {
        p.auraTick = 0;
        const r = s.auraRadius;
        for (const z of this.queryRect(px - r, py - r, px + r, py + r)) {
          if (!z.dead && (z.x - px) ** 2 + (z.y - py) ** 2 < (r + z.r) ** 2) this.damage(z, s.auraDps * 0.5);
        }
      }
      if (s.syn.blackhole) {
        const R2 = s.auraRadius * 1.8;
        for (const z of this.queryRect(px - R2, py - R2, px + R2, py + R2)) {
          if (z.dead || z.heavy || z.air) continue;
          const dx = px - z.x, dy = py - z.y, d = Math.hypot(dx, dy) || 1;
          if (d < R2 && d > s.auraRadius * 0.5) { z.x += (dx / d) * 70 * dt; z.y += (dy / d) * 70 * dt; }
        }
      }
    }
    while (p.boneImgs.length < s.bones) p.boneImgs.push(this.add.image(0, 0, 'bone').setDepth(6).setScale(1 / S));
    if (s.bones > 0) {
      p.boneAngle += dt * 3.2;
      const R = 85;
      p.boneImgs.forEach((img, i) => {
        const a = p.boneAngle + (i / s.bones) * Math.PI * 2;
        const bx = px + Math.cos(a) * R, by = py + Math.sin(a) * R;
        img.setPosition(bx, by).setRotation(a * 2);
        for (const z of this.queryRect(bx - 50, by - 50, bx + 50, by + 50)) {
          if (z.dead || z.boneCd > this.elapsed) continue;
          if ((z.x - bx) ** 2 + (z.y - by) ** 2 < (z.r + 12) ** 2) {
            z.boneCd = this.elapsed + 0.4;
            this.vfx.burst('spark', 3, bx, by);
            this.damage(z, s.boneDmg, a + Math.PI / 2, 150);
          }
        }
      });
    }
    if (s.grenadeCd > 0) {
      p.grenadeT -= dt;
      if (p.grenadeT <= 0) {
        p.grenadeT = s.grenadeCd;
        const near = this.queryRect(px - 320, py - 320, px + 320, py + 320).filter((z) => !z.dead);
        if (near.length) {
          const t = near[Math.floor(Math.random() * Math.min(near.length, 8))];
          const tx = t.x, ty = t.y;
          const img = this.add.image(px, py, 'grenade').setScale(1 / S).setDepth(6.5);
          this.snd('throw', 1, px, py);
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
    const hitThisTick = new Set<Zombie>();
    for (const b of this.burns) {
      const dmg = b.owner.stats.burnDps * 0.25;
      const m = b.width / 2 + 50;
      for (const z of this.queryRect(Math.min(b.x1, b.x2) - m, Math.min(b.y1, b.y2) - m, Math.max(b.x1, b.x2) + m, Math.max(b.y1, b.y2) + m)) {
        if (z.dead || hitThisTick.has(z) || z.air) continue;
        if (distToSeg(z.x, z.y, b.x1, b.y1, b.x2, b.y2) <= b.width / 2 + z.r) { hitThisTick.add(z); this.damage(z, dmg); }
      }
    }
  }

  private collectGems(dt: number) {
    const alive = this.alivePlayers();
    for (const g of this.gems) {
      let best: Player | null = null, bd = Infinity;
      for (const p of alive) {
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < p.stats.pickupRadius && d < bd) { bd = d; best = p; }
      }
      if (best) g.pulled = true;
      g.t += dt;
      const p = (g.to?.alive ? g.to : null) ?? best ?? (g.pulled && alive.length ? this.nearestPlayer(g.x, g.y, true) : null);
      if (!p) { g.img.setPosition(g.x, g.y + Math.sin(g.t * 4) * 2.5); continue; }
      const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
      if (g.pulled) {
        const sp = (g.to ? 620 : 380) * (1 + g.t * 0.5) * dt;
        g.x += (dx / (d || 1)) * Math.min(sp, d); g.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      g.img.setPosition(g.x, g.y + (g.pulled ? 0 : Math.sin(g.t * 4) * 2.5));
      if (d < PLAYER_R + 6) {
        g.img.destroy();
        if (g.chest) { this.burst('wood', 12, g.x, g.y); this.burst('magic', 16, g.x, g.y); this.snd('chest', 1, g.x, g.y); this.openChest(p); }
        else if (g.heal) {
          p.hp = Math.min(p.stats.maxHp, p.hp + 25);
          this.burst('heal', 14, p.x, p.y); this.snd('heal', 1, p.x, p.y);
          this.text(p.x, p.y - 26, '+25', '#69db7c', 20);
        } else {
          this.vfx.burst('xp', g.value >= 5 ? 5 : 2, g.x, g.y);
          if (p === this.me) sfx.play('gem', 0.8); else this.E('s', 'gem', 0.8, g.x | 0, g.y | 0);
          this.gainXp(g.value * p.stats.xpMul * this.comboXp());
          if (p.stats.greedDmg > 0 && p.greedCd <= this.elapsed) {
            p.greedCd = this.elapsed + 0.15;
            this.blast(p.x, p.y, p.stats.greedR, p.stats.greedDmg + g.value, 0xffd43b, 220, true);
          }
        }
        g.value = -1;
      }
    }
    this.gems = this.gems.filter((g) => g.value !== -1);
  }

  private gainXp(v: number) {
    this.xp += v;
    while (this.xp >= this.xpNext()) { this.xp -= this.xpNext(); this.level++; this.pendingLevels++; }
  }

  private xpNext() { return Math.floor((4 + this.level * 2.5 + Math.pow(this.level, 1.75)) * (this.players.length > 1 ? 1.5 : 1)); }

  private openChest(p: Player) {
    const pool = offerPool(p.levels, 'trinket', p.unlocked);
    const who = this.players.length > 1 ? (p.idx === 0 ? 'Игрок 1: ' : 'Игрок 2: ') : '';
    if (!pool.length) { p.hp = Math.min(p.stats.maxHp, p.hp + 30); this.toast(`📦 ${who}+30 HP`); return; }
    const u = pool[Math.floor(Math.random() * pool.length)];
    this.applyUpgrade(p, u.id);
    // соло: сундук — маленькая церемония с паузой; в коопе мир не останавливаем
    if (p === this.me && !this.coop && (this.pauseMode === '' || this.pauseMode === 'chest')) {
      this.pauseMode = 'chest';
      this.endLocalStrokes(); this.controls?.reset();
      this.hud.showChest(u, p.levels[u.id], () => { if (this.pauseMode === 'chest') this.pauseMode = ''; });
    } else this.toast(`📦 ${who}${u.icon} ${u.name} (ур. ${p.levels[u.id]})`);
  }

  private applyUpgrade(p: Player, id: string) {
    const oldMax = p.stats.maxHp;
    p.levels[id] = (p.levels[id] ?? 0) + 1;
    p.stats = computeStats(p.levels, p.meta);
    p.hp += p.stats.maxHp - oldMax;
    if (p === this.me) this.hud.setItems(p.levels);
    for (const sy of SYNERGIES) {
      if (!p.stats.syn[sy.id] || p.synSeen.has(sy.id)) continue;
      p.synSeen.add(sy.id);
      const who = this.players.length > 1 ? (p.idx === 0 ? 'Игрок 1: ' : 'Игрок 2: ') : '';
      if (p === this.me) { this.hud.showEvolution(sy); this.E('t', `🔗 ${who}связка «${sy.name}» ${sy.icon}`, 2600); }
      else this.toast(`🔗 ${who}связка «${sy.name}» ${sy.icon}`, 2600);
      this.snd('synergy', 1, p.x, p.y);
      this.burst('magic', 40, p.x, p.y);
      this.ring(p.x, p.y, 160, 0xffd43b, 0.6, 6);
    }
  }

  private openLevelUp() {
    this.pauseMode = 'levelup';
    for (const s of this.strokes.values()) this.finishStroke(s);
    for (const s of this.remoteStrokes.values()) this.finishStroke(s);
    this.endLocalStrokes(); this.remoteStrokes.clear();
    this.controls?.reset();
    sfx.play('level'); haptic('level');
    // волна уровня: вспышка и толчок — секунда передышки перед выбором
    for (const p of this.alivePlayers()) {
      this.ring(p.x, p.y, 190, 0xb197fc, 0.5, 6); this.burst('xp', 26, p.x, p.y);
      for (const z of this.queryRect(p.x - 190, p.y - 190, p.x + 190, p.y + 190)) if (!z.dead && !z.heavy && !z.air) { const a = Math.atan2(z.y - p.y, z.x - p.x); z.kx += Math.cos(a) * 420; z.ky += Math.sin(a) * 420; }
    }
    this.picks.clear();
    for (const p of this.players) {
      const ch = rollChoices(p.levels, p.unlocked);
      if (!ch.length) { p.hp = Math.min(p.stats.maxHp, p.hp + 20); continue; }
      this.picks.set(p, ch);
      this.offer(p, ch);
    }
    this.checkPicks();
  }

  private offer(p: Player, ch: UpgradeDef[]) {
    if (p.remote) { this.net?.send({ t: 'choices', ids: ch.map((c) => c.id), rr: p.rerolls }); return; }
    this.hud.showLevelUp(ch, p.levels, {
      rerolls: p.rerolls,
      onPick: (id) => this.pick(p, id),
      onReroll: () => this.reroll(p),
      onSkip: () => this.pick(p, '__skip'),
    });
  }

  private reroll(p: Player) {
    if (!this.picks.has(p) || p.rerolls <= 0) return;
    p.rerolls--;
    const ch = rollChoices(p.levels, p.unlocked);
    this.picks.set(p, ch);
    this.offer(p, ch);
  }

  private pick(p: Player, id: string) {
    const ch = this.picks.get(p);
    if (!ch || (id !== '__skip' && !ch.some((c) => c.id === id))) return;
    this.picks.delete(p);
    if (id === '__skip') p.hp = Math.min(p.stats.maxHp, p.hp + 20);
    else this.applyUpgrade(p, id);
    this.burst('magic', 30, p.x, p.y);
    this.ring(p.x, p.y, 120, 0xb197fc, 0.45, 5);
    if (this.picks.size && p === this.me) this.hud.showWait('Напарник выбирает улучшение…');
    this.checkPicks();
  }

  private checkPicks() {
    if (this.pauseMode !== 'levelup' || this.picks.size) return;
    this.hud.showWait(null);
    this.pendingLevels--;
    this.pauseMode = '';
    this.net?.send({ t: 'picked' });
  }

  /** Кости 🦴 за забег (для Мастерской). */
  private bonesEarned(win: boolean) {
    const base = Math.floor(this.kills / 10) + Math.floor(this.elapsed / 10) + this.bossKills * 25 + (this.map ? this.objIdx * 30 : this.wave * 8);
    return base + (win ? 80 : 0);
  }

  private lifeSummary(win: boolean) {
    return { kills: this.kills, bosses: this.bossKills, falls: this.falls, combo: this.bestCombo, score: this.score, wave: this.map ? 0 : this.wave + (win ? 1 : 0), chapter: this.map && win ? this.chapter + 1 : 0, time: Math.floor(this.elapsed) };
  }

  /** Пишет прирост пожизненной статистики и показывает новые ачивки. */
  private flushLife(final: boolean, win: boolean) {
    const d = { kills: this.kills - this.rec.kills, bosses: this.bossKills - this.rec.bosses, falls: this.falls - this.rec.falls, runs: final ? 1 : 0, coop: final && this.players.length > 1 ? 1 : 0 };
    this.rec = { kills: this.kills, bosses: this.bossKills, falls: this.falls };
    const syn = Object.keys(this.me.stats.syn).length;
    const max: Record<string, number> = { maxCombo: this.bestCombo, maxScore: this.score, synergies: syn };
    if (!this.map) max.maxWave = this.wave + (final && win ? 1 : 0);
    if (final && win && this.map) { max.chapter = this.chapter + 1; if (this.chapter === 0) max.bestCh1 = Math.floor(this.elapsed); }
    for (const a of recordLife(d, max)) {
      const extra = a.unlock?.length ? ` — открыт предмет` : '';
      // в конце забега новое показывает экран итогов, тост был бы под ним
      if (final) this.fresh.push(a); else { this.hud.toast(`Ачивка «${a.name}»${extra}`, 2600); sfx.play('synergy'); }
    }
  }

  private endRun(win = false) {
    this.flushLife(true, win);
    this.over = true;
    sfx.musicStop();
    this.endLocalStrokes(); this.controls?.reset();
    this.hud.setBoss(null); this.hud.setJoystick(null); this.hud.closeModals(); this.hud.showWait(null);
    const prog = loadProgress();
    prog.best[this.stageIdx] = Math.max(prog.best[this.stageIdx] ?? 0, Math.floor(this.elapsed));
    return prog;
  }

  private summary(win = false) {
    const bones = this.bonesEarned(win);
    const got = this.fresh.map((a) => {
      const ul = a.unlock?.map((id) => UPGRADES.find((u) => u.id === id)).filter(Boolean).map((u) => `${u!.icon} ${u!.name}`).join(', ');
      return `<div class="unlocked"><small>${ul ? 'Открыт предмет' : 'Ачивка'}</small><b>${ul ?? a.name}</b> — ${a.desc}</div>`;
    }).join('');
    return this.summaryText() + `<div class="bonesline">+${bones} <i>костей в Мастерскую</i></div>` + got + goalsHtml();
  }

  private summaryText() {
    const head = this.map ? `Время <b>${fmt(this.elapsed)}</b>` : `Волна <b>${this.wave}/${WAVES}</b> · <b>${fmt(this.elapsed)}</b>`;
    return `<span class="bigscore">${this.score.toLocaleString('ru-RU')}</span><div class="runstats"><span>${head}</span><span>Убито <b>${this.kills}</b></span><span>Комбо <b>${this.bestCombo}</b></span><span>Уровень <b>${this.level}</b></span></div>`;
  }

  private gameOver() {
    const prog = this.endRun();
    saveProgress(prog);
    const bones = this.bonesEarned(false);
    addBones(bones);
    sfx.play('lose');
    this.vfx.burst('gore', 30, this.me.x, this.me.y);
    const text = this.summary();
    this.net?.send({ t: 'end', win: false, title: 'Вас съели', text, bones, life: this.lifeSummary(false) });
    this.hud.showEnd({
      title: 'Вас съели', text,
      primary: { label: 'Ещё раз', fn: () => this.restart(this.stageIdx) },
      secondary: { label: 'Меню', fn: () => this.leave() },
    });
  }

  private victory() {
    if (this.map) { this.storyVictory(); return; }
    const prog = this.endRun(true);
    const bones = this.bonesEarned(true);
    addBones(bones);
    const next = this.stageIdx + 1;
    prog.cleared[this.stageIdx] = true;
    const unlockedNew = next < STAGES.length && prog.unlocked < next;
    if (next < STAGES.length) prog.unlocked = Math.max(prog.unlocked, next);
    saveProgress(prog);
    sfx.play('win');
    this.vfx.burst('magic', 60, this.me.x, this.me.y);
    for (const z of this.zombies) if (!z.dead) z.img.setAlpha(0.3);
    const hasNext = next < STAGES.length;
    const title = hasNext ? 'Уровень пройден!' : 'Все уровни пройдены!';
    const text = this.summary(true) + (unlockedNew ? `<br>🔓 Открыт уровень ${next + 1}: <b>${STAGES[next].name}</b>` : '');
    this.net?.send({ t: 'end', win: true, title, text: this.summary(true), stage: this.stageIdx, bones, life: this.lifeSummary(true) });
    this.hud.showEnd({
      title, text,
      primary: hasNext ? { label: `Дальше: ${STAGES[next].name}`, fn: () => this.restart(next) } : { label: 'Ещё раз', fn: () => this.restart(this.stageIdx) },
      secondary: { label: 'Меню', fn: () => this.leave() },
      win: true,
    });
  }

  private storyVictory() {
    this.objIdx = this.objs.length;
    const prog = this.endRun(true);
    const bones = this.bonesEarned(true);
    addBones(bones);
    prog.story = Math.max(prog.story ?? 0, this.chapter + 1);
    const par = this.chap.par, stars = this.elapsed <= par ? 3 : this.elapsed <= par * 1.5 ? 2 : 1;
    prog.stars = { ...(prog.stars ?? {}), [this.chapter]: Math.max(prog.stars?.[this.chapter] ?? 0, stars) };
    saveProgress(prog);
    const starHtml = `<div class="stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></div>${stars < 3 ? `<div class="runstats"><span>Три звезды — быстрее <b>${fmt(par)}</b></span></div>` : ''}`;
    sfx.play('win');
    this.vfx.burst('magic', 60, this.me.x, this.me.y);
    const next = CHAPTERS[this.chapter + 1];
    const title = `Глава ${this.chapter + 1} пройдена!`;
    const text = starHtml + this.summary(true);
    this.net?.send({ t: 'end', win: true, title, text: this.summary(true), story: this.chapter, bones, life: this.lifeSummary(true) });
    this.hud.showEnd({
      title, text, win: true,
      primary: next?.ready ? { label: `Дальше: ${next.name}`, fn: () => { this.chapter++; this.restart(this.stageIdx); } } : { label: 'Ещё раз', fn: () => this.restart(this.stageIdx) },
      secondary: { label: 'Меню', fn: () => this.leave() },
    });
  }

  private restart(stage: number) {
    if (this.coop) this.game.events.emit('coop-start', { mode: this.mode, stage, chapter: this.chapter });
    else this.scene.restart({ stage, mode: this.mode, chapter: this.chapter });
  }

  // ---------- Комбо ----------
  /** Множитель счёта: +0.1 за каждые 20 в серии, до ×4. */
  private get comboMul() { return Math.min(4, 1 + Math.floor(this.combo / 20) * 0.1); }
  private comboXp() { return 1 + Math.min(this.combo, 200) / 400; }
  /** Урон клинка: +0.4% за каждое убийство в серии (до +40%), «Азарт» удваивает. */
  private comboDmg(st: Stats) { return 1 + Math.min(0.4, this.combo * 0.002) * (1 + st.frenzyDmg); }
  private comboWindow() { return 1.8 + Math.max(...this.players.map((p) => p.stats.comboTime)); }

  private addCombo(z: Zombie) {
    this.combo++;
    this.comboT = this.comboWindow();
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const base = z.boss ? 500 : 10 + z.xp * 10;
    this.score += Math.round(base * this.comboMul);
    if (this.combo >= 40 && Math.random() < 0.005) this.dropGem(z.x, z.y, 0, false, true);
    // рубежи серии
    const ms = [40, 80, 160, 300, 500].find((m) => this.combo >= m && this.milestone < m);
    if (ms) { this.milestone = ms; this.comboMilestone(ms); }
  }

  private comboMilestone(m: number) {
    this.snd('synergy', 0.9);
    this.shake(200, 0.006);
    if (m === 40) this.toast('КОМБО 40 — РАЗОГРЕВ! Волна по врагам', 1800);
    if (m === 80) this.toast('КОМБО 80 — СВЕЖАЯ КРОВЬ! +25 HP', 1800);
    if (m === 160) this.toast('КОМБО 160 — БЕЗУМИЕ! Клинок не тупится и шире', 2200);
    if (m >= 300) this.toast(`КОМБО ${m} — ЛЕГЕНДА!`, 2200);
    for (const p of this.alivePlayers()) {
      this.blast(p.x, p.y, 200 + m * 0.6, 6 + m * 0.15, 0xffd43b, 500);
      if (m >= 80) { p.hp = Math.min(p.stats.maxHp, p.hp + 25); this.burst('heal', 16, p.x, p.y); }
    }
    if (m >= 160) this.frenzyT = 6;
  }

  private tickCombo(dt: number) {
    if (this.frenzyT > 0) this.frenzyT -= dt;
    if (this.combo <= 0) return;
    this.comboT -= dt;
    if (this.comboT > 0) return;
    // серия закончилась: награда за длинную серию
    const c = this.combo;
    this.combo = 0; this.milestone = 0;
    if (c < 10) return;
    this.toast(`Серия ×${c} · +${Math.round(c * 5 * Math.min(4, 1 + Math.floor(c / 20) * 0.1))} очков`, 1300);
    this.score += Math.round(c * 5 * Math.min(4, 1 + Math.floor(c / 20) * 0.1));
    for (const p of this.alivePlayers()) {
      for (let i = 0; i < Math.min(12, Math.floor(c / 5)); i++) { const a = Math.random() * 6.28; this.dropGem(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, 2, false); }
      if (p.stats.finisher > 0) this.blast(p.x, p.y, 220, c * 0.6 * p.stats.finisher, 0xff6b6b, 700);
    }
  }

  // ---------- Режим разработчика ----------
  private devActions(): DevAction[] {
    const allBosses: ZType[] = ['colossus', 'brood', 'leaper', 'necro'];
    const spawnN = (type: ZType, n: number) => () => {
      for (let i = 0; i < n; i++) this.spawnZombie(type, { at: { x: this.me.x + Math.cos(i) * 220, y: this.me.y + Math.sin(i) * 220 }, around: this.me });
    };
    const refreshStats = () => {
      this.hud.setDevStats('Загружаем статистику…');
      void fetchStats().then((st) => {
        const f = (v: number | null | undefined) => (v === null || v === undefined ? 'нет связи' : String(v));
        this.hud.setDevStats(`Уникальных игроков: ${f(st.users)}\nЗабегов: ${f(st.runs)} (из них кооп: ${f(st.coop)})`);
      });
    };
    refreshStats();
    return [
      { label: () => `Бессмертие`, fn: () => { this.god = !this.god; }, on: () => this.god },
      { label: () => `Клинок ∞`, fn: () => { this.infEnergy = !this.infEnergy; }, on: () => this.infEnergy },
      { label: 'Лечение', fn: () => { for (const p of this.players) { p.hp = p.stats.maxHp; if (!p.alive) this.revive(p, false); } } },
      { label: () => 'FPS', fn: () => { this.showFps = !this.showFps; if (!this.showFps) this.hud.setFps(null); }, on: () => this.showFps },
      { label: '+1 уровень', fn: () => this.gainXp(this.xpNext() - this.xp + 0.01) },
      { label: 'Сундук', fn: () => this.openChest(this.me) },
      { label: 'Все апгрейды макс', fn: () => { for (const u of UPGRADES) while ((this.me.levels[u.id] ?? 0) < u.max) this.applyUpgrade(this.me, u.id); } },
      { label: 'Сброс апгрейдов', fn: () => { this.me.levels = {}; this.me.stats = computeStats({}, this.me.meta); this.me.hp = Math.min(this.me.hp, this.me.stats.maxHp); this.hud.setItems({}); } },
      { label: 'Босс уровня', fn: () => { const t = this.stage.bosses[this.devBoss++ % this.stage.bosses.length]; this.spawnZombie(t, { extra: -200, around: this.me }); } },
      { label: () => `Босс: ${ZDEF[allBosses[this.devBoss % 4]].boss}`, fn: () => { this.spawnZombie(allBosses[this.devBoss++ % 4], { extra: -200, around: this.me }); } },
      { label: 'Орда', fn: () => { this.nextHorde = this.elapsed; } },
      { label: 'Убить всех', fn: () => { for (const z of this.zombies) if (!z.dead) this.kill(z); } },
      { label: '+10 прыгунов', fn: spawnN('jumper', 10) },
      { label: '+10 подрывников', fn: spawnN('bomber', 10) },
      { label: '+10 щитоносцев', fn: spawnN('shield', 10) },
      { label: '+10 призраков', fn: spawnN('ghost', 10) },
      { label: '+5 таранов', fn: spawnN('charger', 5) },
      { label: '+5 плевунов', fn: spawnN('spitter', 5) },
      { label: '+1 минута', fn: () => { this.elapsed += 60; } },
      { label: 'К Стражу (−1:31)', fn: () => { this.elapsed = Math.max(this.elapsed, this.stageTime - 91); } },
      { label: 'Победа', fn: () => { if (!this.over) this.victory(); } },
      { label: '+500 🦴', fn: () => { addBones(500); this.hud.toast('+500 костей'); } },
      { label: 'Статистика ↻', fn: refreshStats },
    ];
  }

  // ---------- Отрисовка ----------
  private draw() {
    const tg = this.trailG;
    tg.clear();
    this.fxG2.clear();
    for (const p of this.players) {
      if (p.stats.auraRadius > 0 && p.alive) drawAura(tg, p.x, p.y, p.stats.auraRadius, this.elapsed);
      if (!p.alive) drawRevive(tg, p.x, p.y, p.downT, this.elapsed);
    }
    for (const p of this.players) if (p.alive) drawVitals(this.fxG2, p.x, p.y, p.hp / p.stats.maxHp);
    for (const b of this.burns) drawBurn(tg, b.x1, b.y1, b.x2, b.y2, b.width, (b.until - this.elapsed) / 0.4);
    const long = this.players.some((p) => p.stats.crossDmg > 0);
    this.segs = this.segs.filter((s) => {
      const life = trailLife(s.kind, long);
      if (this.elapsed - s.born > life && !this.paused) return false;
      drawTrail(tg, s, this.elapsed, life);
      return true;
    });

    const fg = this.fxG;
    fg.clear();
    this.tele = [];
    let boss: Zombie | null = null;
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (z.boss && z.awake && (!boss || z.final)) boss = z;
      if (z.state === 'windup') this.tele.push([0, z.x | 0, z.y | 0, +z.dirX.toFixed(2), +z.dirY.toFixed(2), z.r]);
      else if (z.state === 'slam') this.tele.push([1, z.x | 0, z.y | 0, +(1 - z.stateT / 0.9).toFixed(2)]);
      else if (z.state === 'charge' || z.state === 'jump') { this.tele.push([2, z.tgtX | 0, z.tgtY | 0, z.type === 'leaper' ? 160 : 34]); this.tele.push([4, z.x | 0, z.y | 0, 0]); }
      else if (z.state === 'fuse') this.tele.push([3, z.x | 0, z.y | 0]);
      // плевун вот-вот плюнет; босс рядом, но за экраном
      else if (z.type === 'spitter' && z.awake && z.cd1 < 0.8 && Math.hypot(z.x - z.tgt.x, z.y - z.tgt.y) < 440) this.tele.push([4, z.x | 0, z.y | 0, 1]);
      else if (z.boss && z.awake) this.tele.push([4, z.x | 0, z.y | 0, 4]);
    }
    for (const t of this.tele) drawTele(fg, t, this.elapsed, SLAM_R, BOMB_R);
    if (this.map && this.objIdx < this.objs.length) {
      const t = this.map.objectives[this.objIdx];
      drawBeacon(fg, (t.x + 0.5) * TILE, (t.y + 0.5) * TILE, this.objs[this.objIdx].kind === 'hold' ? TILE * 2.6 : TILE * 1.5, this.objProg, this.objs[this.objIdx].kind === 'hold', this.elapsed);
    }
    for (const v of this.vortices) drawVortex(fg, v.x, v.y, v.r, (v.until - this.elapsed) / v.dur, this.elapsed);
    if (this.me.stats.chargeMul > 0) for (const st of this.strokes.values()) if (st.pts.length === 1) drawCharge(fg, st.pts[0].x, st.pts[0].y, st.charged, Math.min(1, (performance.now() - st.lastT) / 500), this.elapsed);
    this.bossInfo = boss ? [boss.boss!, +(boss.hp / boss.maxHp).toFixed(3)] : null;
    this.hud.setBoss(this.bossInfo?.[0] ?? null, this.bossInfo?.[1] ?? 0);
    this.vfx.draw(fg, this.elapsed);
    if (this.me.alive) drawWarnings(this.fxG2, this.cameras.main, this.dpr, this.tele, this.projs.filter((p) => !p.dead && !p.friendly), this.elapsed);

    this.controls.render(this.hud, !this.paused && !this.over && this.me.alive);
    this.look.follow(this.me.x, this.me.y);
    this.updateObjective();

    const me = this.me;
    this.hud.update({
      hp: me.hp, maxHp: me.stats.maxHp,
      xp: this.xp, xpNext: this.xpNext(), time: this.elapsed, total: this.stageTime, kills: this.kills, level: this.level,
      wave: this.map ? 0 : this.wave,
    });
    this.hud.setScore(this.score, this.combo, this.comboMul, this.combo ? this.comboT / this.comboWindow() : 0, this.frenzyT > 0);
    sfx.musicMood(this.paused || this.over ? -1 : this.combo, !!boss, this.frenzyT > 0, me.hp / me.stats.maxHp);
    this.hud.setDanger(me.alive && !this.over && me.hp / me.stats.maxHp < 0.3);
  }

  /** Текущая цель (сюжет): текст сверху, стрелка у края экрана с расстоянием. */
  private updateObjective() {
    if (!this.map || this.objIdx >= this.objs.length) { this.hud.setObjective(null); this.hud.setWaypoint(null); return; }
    const o = this.objs[this.objIdx], t = this.map.objectives[this.objIdx];
    const wx = (t.x + 0.5) * TILE, wy = (t.y + 0.5) * TILE;
    const prog = o.kind === 'hold' ? ` · ${Math.floor(this.objProg * 100)}%` : '';
    this.hud.setObjective(`${o.icon} ${this.objIdx + 1}/${this.objs.length}: ${o.label}${prog}`);
    const cam = this.cameras.main, k = cam.zoom / this.dpr;
    this.hud.setWaypoint({ x: (wx - cam.worldView.x) * k, y: (wy - cam.worldView.y) * k, icon: o.icon, dist: Math.round(Math.hypot(wx - this.me.x, wy - this.me.y) / TILE) });
  }

  /** Цели главы: дойти до точки или удержать круг заданное время. */
  private updateObjectives(dt: number) {
    const m = this.map!;
    if (this.objIdx >= this.objs.length) return;
    const o = this.objs[this.objIdx], t = m.objectives[this.objIdx];
    const wx = (t.x + 0.5) * TILE, wy = (t.y + 0.5) * TILE;
    const R = o.kind === 'hold' ? TILE * 2.6 : TILE * 1.5;
    const inside = this.alivePlayers().some((p) => Math.hypot(p.x - wx, p.y - wy) < R);
    if (o.kind === 'reach') {
      if (inside) this.completeObjective(wx, wy);
      return;
    }
    // удержание: прогресс растёт внутри круга и медленно падает снаружи
    if (inside && this.objProg === 0) {
      this.toast(o.dur <= 10 ? `${o.icon} Обыск… шум привлекает мертвецов` : `${o.icon} Держите круг! Орда идёт`, 2000);
      this.snd('boss', 0.6);
      if (this.objIdx === this.objs.length - 1) for (const z of this.zombies) if (z.boss && !z.awake) this.wake(z);
    }
    this.objProg = Phaser.Math.Clamp(this.objProg + (inside ? dt / o.dur : -dt / (o.dur * 3)), 0, 1);
    if (this.objProg > 0) {
      // волны к точке удержания
      this.holdTick -= dt;
      if (this.holdTick <= 0) {
        this.holdTick = Phaser.Math.Linear(2.6, 1.4, this.objProg) * (this.players.length > 1 ? 0.8 : 1);
        const around = this.nearestPlayer(wx, wy, true);
        const pos = this.findSpawn(around, 0, undefined, undefined, TILE * (9 + Math.random() * 5));
        const n = 6 + Math.floor(this.objIdx * 2 + this.objProg * 7);
        const pack = ++this.packSeq;
        if (pos && this.zombies.length < 340) for (let i = 0; i < n; i++) this.spawnZombie(this.pickType(), { at: pos, around, pack });
      }
    }
    if (this.objProg >= 1) this.completeObjective(wx, wy);
  }

  private completeObjective(x: number, y: number) {
    const last = this.objIdx === this.objs.length - 1;
    const o = this.objs[this.objIdx];
    this.burst('magic', 50, x, y);
    this.ring(x, y, 200, 0x69db7c, 0.6, 6);
    this.snd('synergy');
    if (last) { this.victory(); return; }
    this.toast(`✅ ${o.label.split(' —')[0]}! Дальше — по стрелке`, 2400);
    // награда за этап
    for (let i = 0; i <= this.objIdx; i++) this.dropGem(x - 20 + i * 40, y, 0, true);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.dropGem(x + Math.cos(a) * 70, y + Math.sin(a) * 70, 4, false); }
    this.dropGem(x, y + 50, 0, false, true);
    this.objIdx++; this.objProg = 0; this.holdTick = 0;
    this.chase = 0; this.chaseWarned = false;
    const next = this.objs[this.objIdx];
    if (next?.radio) { this.hud.radio(next.radio); this.E('R', next.radio); }
    // засада: шум этапа стягивает стаи с трёх сторон
    this.timers.push({ at: this.elapsed + 2.2, fn: () => {
      const around = this.randomAlive(), a0 = Math.random() * 6.28;
      for (let k = 0; k < 3; k++) {
        const pos = this.findSpawn(around, 0, undefined, a0 + k * 2.09), pack = ++this.packSeq;
        if (pos) for (let i = 0; i < 7 + this.objIdx * 2; i++) this.spawnZombie(i % 3 === 0 ? this.pickType() : 'walker', { at: pos, around, pack });
      }
      this.snd('boss', 0.45);
    } });
  }

  // ---------- Сюжет: спящие группы, лазы, шум ----------
  private placeDormant() {
    const m = this.map!;
    for (const g of m.groups) {
      const types = this.stage.weights(g.p);
      const pack = ++this.packSeq;
      for (let i = 0; i < g.n * 2 + 2; i++) {
        let r = Math.random() * types.reduce((a, b) => a + b[1], 0), t: ZType = 'walker';
        for (const [k, v] of types) if ((r -= v) <= 0) { t = k; break; }
        this.spawnZombie(t, { at: { x: (g.x + 0.5) * TILE, y: (g.y + 0.5) * TILE }, around: this.me, dormant: true, pack });
      }
      // у части групп — взрывная бочка: можно взорвать спящих
      if (Math.random() < 0.45) this.addBarrel((g.x + 2.5) * TILE, (g.y + 0.5) * TILE, null);
    }
    for (const l of m.loot) this.dropGem((l.x + 0.5) * TILE, (l.y + 0.5) * TILE, 0, true);
    // страж выхода
    this.spawnZombie(this.stage.bosses[0], { at: { x: (m.bossAt.x + 0.5) * TILE, y: (m.bossAt.y + 2.5) * TILE }, around: this.me, dormant: true, final: true });
  }

  /** Прогресс главы 0..1 — насколько близко к выходу ближайший игрок. */
  private storyProgress() {
    return Phaser.Math.Clamp((this.objIdx + this.objProg) / this.objs.length + this.elapsed / 900, 0, 1);
  }

  private storyProgressByDistance() {
    const m = this.map!;
    const ex = m.exit.x, ey = m.exit.y;
    const total = Math.hypot(ex - m.start.x, ey - m.start.y) || 1;
    let best = 0;
    for (const p of this.alivePlayers()) best = Math.max(best, 1 - Math.hypot(ex - p.x / TILE, ey - p.y / TILE) / total);
    return Phaser.Math.Clamp(best, 0, 1);
  }

  /** Зомби лезут из лазов рядом с игроками; чем ближе к выходу — тем чаще и злее. */
  private storySpawn(dt: number) {
    this.progress = this.storyProgress();
    this.entryTick -= dt;
    if (this.entryTick > 0) return;
    this.entryTick = Phaser.Math.Linear(2.1, 1.1, this.progress) * (this.players.length > 1 ? 0.75 : 1);
    this.chaseTick(this.entryTick);
    if (this.zombies.length > 300) return;
    const near = this.map!.entries.filter((e) => this.alivePlayers().some((p) => {
      const d = Math.hypot((e.x + 0.5) * TILE - p.x, (e.y + 0.5) * TILE - p.y) / TILE;
      return d > 5 && d < 24;
    }));
    if (!near.length) {
      // нет лазов рядом — группа подходит из-за края экрана
      const around = this.randomAlive(), pos = this.findSpawn(around);
      const pack = ++this.packSeq;
      if (pos) for (let i = 0; i < 6 + Math.floor(this.progress * 7); i++) this.spawnZombie(this.pickType(), { at: pos, around, pack });
      return;
    }
    const e = near[Math.floor(Math.random() * near.length)];
    const n = 4 + Math.floor(Math.random() * (4 + this.progress * 6));
    const pack = ++this.packSeq;
    const w = this.stage.weights(this.progress);
    const ex = (e.x + 0.5) * TILE, ey = (e.y + 0.5) * TILE;
    for (let i = 0; i < n; i++) {
      let r = Math.random() * w.reduce((a, b) => a + b[1], 0), t: ZType = 'walker';
      for (const [k, v] of w) if ((r -= v) <= 0) { t = k; break; }
      this.timers.push({ at: this.elapsed + i * 0.22, fn: () => this.spawnZombie(t, { at: { x: ex, y: ey }, around: this.nearestPlayer(ex, ey, true), exact: true, pack }) });
    }
    this.burst('dust', 10, ex, ey);
    this.snd('crate', 0.6, ex, ey, 0.6);
  }

  /**
   * Орда по следу: пока цель «дойти» не взята, растёт погоня. Сначала предупреждение, потом из-за спины
   * приходят всё более крупные стаи — стоять и зачищать карту невыгодно, надо двигаться к цели.
   */
  private chaseTick(dt: number) {
    const o = this.objs[this.objIdx];
    if (!o || (o.kind === 'hold' && this.objProg > 0)) { this.chase = 0; return; }
    this.chase += dt;
    if (this.chase < 28) return;
    if (!this.chaseWarned) { this.chaseWarned = true; this.toast('Орда идёт по следу — не стой', 2200); this.snd('boss', 0.5); this.hud.radio('Они слышат тебя. Чем дольше стоишь — тем их больше.'); }
    if (this.elapsed < this.chaseAt) return;
    this.chaseAt = this.elapsed + 8;
    const around = this.randomAlive(), pos = this.findSpawn(around);
    if (!pos || this.zombies.length > 380) return;
    const n = Math.min(26, 9 + Math.floor((this.chase - 28) / 5)), pack = ++this.packSeq;
    for (let i = 0; i < n; i++) this.spawnZombie(i % 4 === 0 ? this.pickType() : i % 2 ? 'runner' : 'walker', { at: pos, around, pack });
  }

  /** Спящий зомби просыпается от шума игрока (бег 40 клеток, шаг 10) или от урона. */
  private checkWake(z: Zombie, dt: number) {
    z.wakeT -= dt;
    if (z.wakeT > 0) return;
    z.wakeT = 0.25;
    for (const p of this.alivePlayers()) {
      if (Math.hypot(p.x - z.x, p.y - z.y) < Math.max(p.noise, this.chap.sight) * TILE) { this.wake(z); return; }
    }
  }

  private wake(z: Zombie) {
    if (z.awake) return;
    z.awake = true;
    z.navT = 0;
    // будит соседей по группе
    for (const o of this.queryRect(z.x - TILE * 5, z.y - TILE * 5, z.x + TILE * 5, z.y + TILE * 5)) {
      if (!o.awake && !o.dead) { o.wakeT = 0.15 + Math.random() * 0.3; o.awake = true; o.navT = 0; }
    }
    if (z.boss) { this.toast(`☠️ ${z.boss} проснулся!`, 2200); this.snd('boss'); }
  }
}

// ---------- Общие функции отрисовки ----------
/** Маяк цели: пульсирующие кольца; для удержания — круг и дуга прогресса. */
export function drawBeacon(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, prog: number, hold: boolean, now: number) {
  const pulse = (now * 0.8) % 1;
  g.lineStyle(4, 0x69db7c, 0.8 * (1 - pulse)).strokeCircle(x, y, r * (0.4 + pulse * 0.8));
  g.fillStyle(0x69db7c, hold ? 0.1 : 0.18).fillCircle(x, y, r);
  g.lineStyle(3, 0x69db7c, 0.9).strokeCircle(x, y, r);
  if (hold && prog > 0) {
    g.lineStyle(8, 0xffd43b, 1);
    g.beginPath(); g.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.strokePath();
  }
  g.fillStyle(0xffffff, 0.9).fillTriangle(x, y - 34 - Math.sin(now * 5) * 5, x - 10, y - 52 - Math.sin(now * 5) * 5, x + 10, y - 52 - Math.sin(now * 5) * 5);
}

/** Полоска здоровья под героем — видна только когда он ранен. */
export function drawVitals(g: Phaser.GameObjects.Graphics, x: number, y: number, hp: number) {
  if (hp >= 0.999) return;
  const w = 40, bx = x - w / 2, by = y + 24;
  g.fillStyle(0x000000, 0.65).fillRoundedRect(bx - 2, by - 2, w + 4, 9, 4);
  g.fillStyle(hp > 0.35 ? 0x40c057 : 0xfa5252).fillRoundedRect(bx, by, Math.max(0, w * Math.min(1, hp)), 5, 2);
}

/** Камера: на телефоне ближе, чем раньше, чтобы врагов было видно и по ним было легко попасть. */
export function worldZoomFor(w: number, h: number) { return Phaser.Math.Clamp(Math.min(w, h) / 470, 0.84, 1.45); }

export function bladeColor(id: string) { return BLADES.find((b) => b.id === id)?.color ?? 0x66d9e8; }

export function drawVortex(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, left: number, now: number) {
  const a = Math.min(1, left * 3);
  g.fillStyle(0x74c0fc, 0.1 * a).fillCircle(x, y, r);
  for (let arm = 0; arm < 3; arm++) {
    g.lineStyle(3, 0xa5d8ff, 0.7 * a);
    g.beginPath();
    for (let i = 0; i <= 14; i++) {
      const k = i / 14, ang = now * 7 + arm * 2.094 + k * 4, rr = r * (1 - k * 0.85);
      const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
  }
}

export function drawCharge(g: Phaser.GameObjects.Graphics, x: number, y: number, charged: boolean, k: number, now: number) {
  if (charged) {
    g.lineStyle(4, 0xffd43b, 0.6 + Math.sin(now * 20) * 0.3).strokeCircle(x, y, 30);
    g.fillStyle(0xffd43b, 0.15).fillCircle(x, y, 30);
  } else if (k > 0.25) {
    g.lineStyle(3, 0xffd43b, 0.5);
    g.beginPath(); g.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.strokePath();
  }
}

export function styleDowned(img: Phaser.GameObjects.Image, alive: boolean, inv: number, hurt: boolean, toxic: boolean) {
  if (!alive) { img.setAlpha(0.5).setTint(0x868e96); return; }
  img.setAlpha(inv > 0 && Math.floor(inv * 20) % 2 === 0 ? 0.45 : 1);
  if (hurt) img.setTint(0xff6b6b); else if (toxic) img.setTint(0xb2f2bb); else img.clearTint();
}

export function drawAura(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, now: number) {
  const pulse = 1 + Math.sin(now * 4) * 0.04;
  g.fillStyle(0x9c36b5, 0.12).fillCircle(x, y, r * pulse);
  g.lineStyle(2, 0xcc5de8, 0.35).strokeCircle(x, y, r * pulse);
}

export function drawRevive(g: Phaser.GameObjects.Graphics, x: number, y: number, k: number, now: number) {
  g.lineStyle(3, 0x69db7c, 0.35 + Math.sin(now * 6) * 0.15).strokeCircle(x, y, REVIVE_R);
  if (k > 0) {
    g.lineStyle(6, 0x69db7c, 0.9);
    g.beginPath(); g.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.strokePath();
  }
}

export function drawBurn(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, w: number, fade: number) {
  // приглушённый и полупрозрачный, чтобы не закрывать зомби
  const a = Math.min(1, fade) * (0.5 + Math.random() * 0.15);
  g.lineStyle(w * 0.55, 0xe8590c, a * 0.18).lineBetween(x1, y1, x2, y2);
  g.lineStyle(w * 0.18, 0xffa94d, a * 0.4).lineBetween(x1, y1, x2, y2);
}

/** Что уже близко: ближайшие ачивки и предметы, которые они открывают. */
function goalsHtml() {
  const g = nearestGoals(3);
  if (!g.length) return '';
  return `<div class="goals"><div class="goals-h">Скоро откроется</div>${g.map(({ a, cur, goal, k }) => {
    const ul = a.unlock?.map((id) => UPGRADES.find((u) => u.id === id)).filter(Boolean).map((u) => `${u!.icon} ${u!.name}`).join(', ');
    return `<div class="goal"><div class="goal-t"><b>${ul ?? a.name}</b><span>${a.desc}</span></div><div class="goal-bar"><i style="width:${Math.round(k * 100)}%"></i></div><em>${cur.toLocaleString('ru-RU')} / ${goal.toLocaleString('ru-RU')}</em></div>`;
  }).join('')}</div>`;
}

export function fmt(t: number) { t = Math.floor(t); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

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
