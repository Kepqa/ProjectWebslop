import Phaser from 'phaser';
import { Hud } from './hud';
import { sfx, type SfxName } from './sfx';
import { session } from './session';
import { decodeSnap, ZF, type Msg, type Net } from './net';
import { ChunkView } from './chunks';
import { drawWarnings, Effects, EMITTERS, drawTele, drawTrail, trailLife, type TrailSeg, type Tele } from './effects';
import { STAGES, STAGE_TIME, loadProgress, saveProgress, type StageDef } from './stages';
import { UPGRADES, computeStats, type Levels, type Stats } from './upgrades';
import { addBones, loadMeta, metaBonus } from './meta';
import { recordLife, unlockedSet } from './achievements';
import { S, WALK_FRAMES, ZTYPES, makeTextures, zOrigin } from './textures';
import { World, K_FLOOR, K_TOXIC, K_DOOR, K_DOOROPEN, TILE, key2, type Body } from './world';
import { Controls } from './controls';
import { Look } from './look';
import { CHAPTERS, type StoryMap } from './story';
import { BOMB_R, PLAYER_R, PLAYER_SPEED, RUN_MUL, SLAM_R, SWIPE_MIN_SPEED, bladeColor, worldZoomFor, drawAura, drawBeacon, drawBurn, drawCharge, drawRevive, drawVitals, drawVortex, styleDowned } from './GameScene';

interface ZView { img: Phaser.GameObjects.Image; type: number; fx: number; fy: number; tx: number; ty: number; fr: number; tr: number; t0: number; seen: number; ph: number; base: string }
interface PState { x: number; y: number; lvl: number; rot: number; hp: number; mhp: number; en: number; emx: number; alive: boolean; down: number; inv: number; hurt: boolean; tox: boolean; aura: number; bones: number; ba: number; sc: number }

const SNAP_MS = 50;

/** Гость в онлайн-коопе: рисует мир по снимкам хоста, своё движение и свайпы — локально. */
/** Текстуры реплицируемых снарядов/предметов по kind. */
const PROJ_TEX = ['acid', 'orb', 'acid', 'spear', 'shard', 'barrel', 'totem', 'soul', 'trap', 'ball', 'barrel'];

export class ClientScene extends Phaser.Scene {
  private net!: Net;
  private hud!: Hud;
  private stage!: StageDef;
  private stageIdx = 0;
  private seed = 0;
  private world!: World;
  private chunks!: ChunkView;
  private vfx!: Effects;
  private dpr = 1;
  private worldZoom = 1;
  private now = 0;

  private me: Body & { rot: number; moving: number; bob: number } = { x: 40, y: 0, lvl: 0, rot: 0, moving: 0, bob: 0 };
  private meImg!: Phaser.GameObjects.Image;
  private mateImg!: Phaser.GameObjects.Image;
  private mate = { fx: 0, fy: 0, tx: 0, ty: 0, t0: 0 };
  private mateBob = 0;
  private ps: PState[] = [];
  private levels: Levels = {};
  private stats: Stats = computeStats({});
  private mb = metaBonus({});
  private zv = new Map<number, ZView>();
  private gemImgs: Phaser.GameObjects.Image[] = [];
  private projImgs: Phaser.GameObjects.Image[] = [];
  private projs: { x: number; y: number; vx: number; vy: number; kind: number }[] = [];
  private projAt = 0;
  private boomImgs: Phaser.GameObjects.Image[] = [];
  private boneImgs: Phaser.GameObjects.Image[][] = [[], []];
  private segs: TrailSeg[] = [];
  private burns: { x1: number; y1: number; x2: number; y2: number; until: number; w: number }[] = [];
  private tele: Tele[] = [];
  private cross = false;
  private lastSeq = 0;
  private hdr: { t: number; T: number; k: number; xp: number; xn: number; lv: number; boss: [string, number] | null } = { t: 0, T: STAGE_TIME, k: 0, xp: 0, xn: 10, lv: 1, boss: null };
  private paused = false; private over = false;
  private strokes = new Map<number, { sid: number; lastSX: number; lastSY: number; lastT: number; px: number; py: number; moved: boolean; charged: boolean; left: number }>();
  private mines: { img: Phaser.GameObjects.Image; t: number }[] = [];
  private vortices: { x: number; y: number; r: number; until: number; dur: number }[] = [];
  private sidSeq = 0;
  private joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private touchSeen = false;
  private mvAt = 0; private chunkAt = 0; private doorAt = 0;
  private pauseReqPending = false; private pauseReqAt = -1e9;
  private trailG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() { super('client'); }

  private map: StoryMap | null = null;
  private get objs() { return CHAPTERS[this.chapter].objectives; }
  private chapter = 0;
  private wave = 0; private exitSeen = false; private objIdx = 0; private objProg = 0;
  private sc: number[] = [0, 0, 1, 0, 0];
  private controls!: Controls;
  private look!: Look;

  init(data: { stage: number; seed: number; time?: number; mode?: 'survival' | 'story'; chapter?: number }) {
    this.stageIdx = data.stage; this.seed = data.seed;
    this.net = session.net!;
    this.chapter = data.chapter ?? 0;
    this.map = data.mode === 'story' ? CHAPTERS[this.chapter].gen(this.seed) : null;
    this.stage = this.map ? CHAPTERS[this.chapter].stage : STAGES[this.stageIdx];
    if (this.map) data.time = Infinity;
    this.hdr.T = data.time ?? STAGE_TIME;
  }

  create() {
    if (location.search.includes('debug')) Object.assign(window, { scene: this, sfx });
    makeTextures(this);
    this.dpr = (this.registry.get('dpr') as number) || 1;
    this.world = new World(this.seed, this.stage.gen, this.map);
    this.chunks = new ChunkView(this, this.world, this.stage.palette);
    this.vfx = new Effects(this);
    this.cameras.main.setBackgroundColor(this.stage.bg);
    document.body.style.background = this.stage.bg;

    this.me = { x: 40, y: 0, lvl: 0, rot: 0, moving: 0, bob: 0 };
    if (this.map) { this.me.x = (this.map.start.x + 0.5) * TILE + 30; this.me.y = (this.map.start.y + 0.5) * TILE; }
    this.wave = 0; this.exitSeen = false;
    const saved = loadMeta();
    this.levels = {}; this.mb = metaBonus(saved.lv, saved.blade); this.stats = computeStats(this.levels, this.mb);
    const un = unlockedSet();
    this.net.send({ t: 'meta', lv: saved.lv, blade: saved.blade, unl: un ? [...un] : null });
    this.zv.clear(); this.gemImgs = []; this.projImgs = []; this.boomImgs = []; this.boneImgs = [[], []];
    this.segs = []; this.burns = []; this.tele = []; this.projs = []; this.ps = [];
    this.lastSeq = 0; this.paused = false; this.over = false; this.endStrokes(); this.controls?.reset();
    this.pauseReqPending = false; this.pauseReqAt = -1e9;
    this.mines = []; this.vortices = [];

    this.meImg = this.add.image(this.me.x, 0, 'player2').setScale(1 / S).setDepth(5).setOrigin(22 / 46, 0.5);
    this.mateImg = this.add.image(0, 0, 'player').setScale(1 / S).setDepth(5).setOrigin(22 / 46, 0.5);
    this.trailG = this.add.graphics().setDepth(7);
    this.fxG = this.add.graphics().setDepth(8);
    this.fxG.setBlendMode(Phaser.BlendModes.NORMAL);

    this.hud = new Hud();
    this.hud.show(true);
    this.hud.setItems(this.levels);
    sfx.musicStart();
    this.hud.onPause = () => this.requestPause();
    this.hud.toast(this.map ? `Глава ${this.chapter + 1}: ${CHAPTERS[this.chapter].goal}` : `${this.stage.name} · кооп — 10 волн`, 2200);

    this.cameras.main.startFollow(this.meImg, false, 1, 1);
    this.applyZoom();
    this.look = new Look(this);
    this.scale.on('resize', this.applyZoom, this);
    session.onMsg = this.onMsg;
    session.onSnap = this.onSnap;
    session.onClose = this.onClose;
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.hud.setJoystick(null); this.hud.setBoss(null); this.hud.closeModals();
      if (session.onSnap === this.onSnap) { session.onMsg = null; session.onSnap = null; session.onClose = null; }
    });

    this.controls = new Controls(this);
    this.keys = this.input.keyboard!.addKeys('ESC,P') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.ESC.on('down', () => this.requestPause());
    this.keys.P.on('down', () => this.requestPause());
    this.input.addPointer(3);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.chunks.update(this.me.x, this.me.y);
  }

  private applyZoom() {
    const w = window.innerWidth, h = window.innerHeight;
    this.worldZoom = worldZoomFor(w, h);
    this.cameras.main.setZoom(this.worldZoom * this.dpr);
  }

  private get myState() { return this.ps[1]; }
  private get alive() { return this.myState ? this.myState.alive : true; }

  // ---------- Сеть ----------
  private onMsg = (m: Msg) => {
    switch (m.t) {
      case 'choices': {
        const ch = (m.ids as string[]).map((id) => UPGRADES.find((u) => u.id === id)!).filter(Boolean);
        this.paused = true; this.endStrokes(); this.controls?.reset();
        sfx.play('level');
        this.hud.showLevelUp(ch, this.levels, {
          rerolls: m.rr ?? 0,
          onPick: (id) => { this.net.send({ t: 'pick', id }); this.hud.showWait('Напарник выбирает улучшение…'); },
          onReroll: () => this.net.send({ t: 'reroll' }),
          onSkip: () => { this.net.send({ t: 'pick', id: '__skip' }); this.hud.showWait('Напарник выбирает улучшение…'); },
        });
        break;
      }
      case 'picked': this.paused = false; this.hud.showWait(null); break;
      case 'paused':
        this.paused = true; this.endStrokes(); this.controls?.reset();
        this.pauseReqPending = false; this.hud.showWait(null);
        this.hud.showPause(() => this.net.send({ t: 'resume' }), () => this.game.events.emit('menu'), 'Продолжить может любой из игроков');
        break;
      case 'cd': this.hud.hidePause(); this.hud.showCountdown(m.n); break;
      case 'unpaused': this.paused = false; this.hud.hidePause(); this.hud.showCountdown(null); break;
      case 'preq':
        this.hud.showVote('Напарник просит паузу', 10, (ok) => this.net.send({ t: 'pans', ok }));
        break;
      case 'pdecl':
        if (this.pauseReqPending) { this.pauseReqPending = false; this.pauseReqAt = performance.now(); this.hud.showWait(null); this.hud.toast('Напарник отклонил паузу'); }
        break;
      case 'end': this.end(m); break;
      case 'ev': for (const e of m.ev as unknown[][]) this.applyEvent(e); break;
      case 'bye': this.onClose('Хост вышел из игры'); break;
    }
  };

  private onClose = (reason: string) => {
    if (this.over) return;
    this.over = true;
    this.hud.closeModals(); this.hud.showWait(null);
    this.hud.showEnd({ title: 'Связь потеряна', text: reason, primary: null, secondary: { label: 'Меню', fn: () => this.game.events.emit('menu') } });
  };

  private end(m: Msg) {
    this.over = true;
    sfx.musicStop();
    this.hud.closeModals(); this.hud.showWait(null); this.hud.setBoss(null); this.hud.setJoystick(null);
    const prog = loadProgress();
    prog.best[this.stageIdx] = Math.max(prog.best[this.stageIdx] ?? 0, Math.floor(this.hdr.t));
    if (m.bones) addBones(m.bones);
    const L = m.life;
    if (L) {
      const max: Record<string, number> = { maxCombo: L.combo, maxScore: L.score, maxWave: L.wave, chapter: L.chapter };
      if (L.chapter === 1) max.bestCh1 = L.time;
      for (const a of recordLife({ kills: L.kills, bosses: L.bosses, falls: L.falls, runs: 1, coop: 1 }, max)) this.hud.toast(`🏆 Ачивка «${a.name}»`, 2600);
    }
    if (m.story !== undefined) prog.story = Math.max(prog.story ?? 0, m.story + 1);
    if (m.win && m.story === undefined) {
      prog.cleared[this.stageIdx] = true;
      if (this.stageIdx + 1 < STAGES.length) prog.unlocked = Math.max(prog.unlocked, this.stageIdx + 1);
    }
    saveProgress(prog);
    sfx.play(m.win ? 'win' : 'lose');
    this.hud.showEnd({
      title: m.title, text: `${m.text}<br><span style="opacity:.7">Хост выбирает, что дальше…</span>`, win: m.win,
      primary: null, secondary: { label: 'Выйти в меню', fn: () => this.game.events.emit('menu') },
    });
  }

  private onSnap = (buf: ArrayBuffer) => {
    const { header: h, zs, gs, ps, bs } = decodeSnap(buf);
    for (const e of h.ev as unknown[][]) this.applyEvent(e);
    if (h.s <= this.lastSeq) return; // устаревший снимок (канал неупорядоченный)
    this.lastSeq = h.s;
    const now = performance.now();
    this.hdr = { t: h.t, T: h.T, k: h.k, xp: h.xp, xn: h.xn, lv: h.lv, boss: h.boss };
    this.wave = h.wv ?? 0;
    if (h.ob) { this.objIdx = h.ob[0]; this.objProg = h.ob[1]; }
    if (h.sc) this.sc = h.sc;
    this.tele = h.tele; this.cross = !!h.cross;
    this.ps = (h.pl as number[][]).map((a) => ({
      x: a[0], y: a[1], lvl: a[2], rot: a[3], hp: a[4], mhp: a[5], en: a[6], emx: a[7], alive: !!a[8], down: a[9], inv: a[10], hurt: !!a[11], tox: !!a[12],
      aura: a[13], bones: a[14], ba: a[15], sc: a[16],
    }));
    const lv = h.lv2 as Levels;
    if (JSON.stringify(lv) !== JSON.stringify(this.levels)) { this.levels = { ...lv }; this.stats = computeStats(this.levels, this.mb); this.hud.setItems(this.levels); }
    const mate = this.ps[0];
    if (mate) { this.mate.fx = this.mateImg.x; this.mate.fy = this.mateImg.y; this.mate.tx = mate.x; this.mate.ty = mate.y; this.mate.t0 = now; }

    // Зомби: интерполяция между текущим видом и новым снимком
    for (const r of zs) {
      let v = this.zv.get(r.id);
      if (!v || v.type !== r.type) {
        v?.img.destroy();
        const t = ZTYPES[r.type];
        const img = this.add.image(r.x, r.y, t).setOrigin(zOrigin(t), 0.5).setDepth(4);
        v = { img, type: r.type, fx: r.x, fy: r.y, tx: r.x, ty: r.y, fr: r.rot, tr: r.rot, t0: now, seen: h.s, ph: 0, base: t };
        this.zv.set(r.id, v);
      }
      v.fx = v.img.x; v.fy = v.img.y; v.tx = r.x; v.ty = r.y; v.fr = v.img.rotation; v.tr = r.rot; v.t0 = now; v.seen = h.s;
      const img = v.img;
      img.setScale(r.sx / S, r.sy / S).setAlpha(r.alpha);
      img.setDepth(r.flags & ZF.AIR ? 6.5 : r.flags & ZF.BOSS ? 4.5 : 4);
      if (r.flags & ZF.BROKEN) v.base = 'shield_broken';
      if (r.flags & ZF.FLASH) img.setTintFill(0xffffff);
      else if (r.flags & ZF.RED) img.setTint(0xff8787);
      else if (r.flags & ZF.FROST) img.setTint(0x9fd4ff);
      else img.clearTint();
    }
    for (const [id, v] of this.zv) if (v.seen !== h.s) { v.img.destroy(); this.zv.delete(id); }

    pool(this, this.gemImgs, gs.length, 'gem', 2).forEach((img, i) => {
      const g = gs[i];
      img.setTexture(g.kind === 3 ? 'medkit' : g.kind === 2 ? 'chest' : 'gem').setPosition(g.x, g.y).setScale((g.kind === 1 ? 1.5 : 1) / S);
      if (g.kind === 1) img.setTint(0xb197fc); else img.clearTint();
    });
    this.projs = ps; this.projAt = now;
    pool(this, this.projImgs, ps.length, 'acid', 7.5).forEach((img, i) => {
      const p = ps[i];
      img.setTexture(PROJ_TEX[p.kind] ?? 'acid').setDepth(p.kind === 5 || p.kind === 6 || p.kind === 8 || p.kind === 10 ? 3 : 7.5);
      if (p.kind === 2) img.setTint(0x66d9e8); else if (p.kind === 10) img.setTint(0xffa8a8); else img.clearTint();
      if (p.kind === 3 || p.kind === 4) img.setRotation(Math.atan2(p.vy, p.vx));
      else if (p.kind >= 5) img.setRotation(0);
    });
    pool(this, this.boomImgs, bs.length, 'boomerang', 6).forEach((img, i) => img.setPosition(bs[i].x, bs[i].y).setRotation(bs[i].rot));
  };

  private applyEvent(e: unknown[]) {
    const now = this.now;
    const n = (i: number) => e[i] as number;
    switch (e[0]) {
      case 'r': this.vfx.ring(now, n(1), n(2), n(3), n(4), n(5), n(6) || undefined); break;
      case 'p': this.vfx.burst(EMITTERS[n(1)], n(2), n(3), n(4)); break;
      case 'x': this.vfx.text(n(1), n(2), e[3] as string, e[4] as string, n(5)); break;
      case 's': {
        const x = e[3] as number | null, y = e[4] as number | null;
        const att = x === null || y === null ? 1 : Phaser.Math.Clamp(1.3 - Math.hypot(x - this.me.x, y! - this.me.y) / 800, 0, 1);
        sfx.play(e[1] as SfxName, n(2) * att, (e[5] as number) || 1);
        break;
      }
      case 'k': this.cameras.main.shake(n(1), n(2)); break;
      case 't': this.hud.toast(e[1] as string, n(2)); break;
      case 'h':
        if (n(1) === 1) { this.cameras.main.shake(110, 0.007); this.cameras.main.flash(90, 140, 0, 0); sfx.play('hurt'); }
        break;
      case 'b': this.vfx.bolt(now, e[1] as number[]); break;
      case 'P': {
        const f = e[1] as number[]; const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < f.length; i += 2) pts.push({ x: f[i], y: f[i + 1] });
        this.vfx.poly(now, pts, n(2) || 0x74c0fc);
        break;
      }
      case 'c': this.vfx.slice(ZTYPES[n(1)], n(2), n(3), n(4), n(5)); break;
      case 'o': this.vfx.pop(ZTYPES[n(1)], n(2), n(3), n(4), now); break;
      case 'W': this.vfx.wave(now, n(1), n(2), e[3] as number[], n(4), n(5), !!n(6)); break;
      case 'M': {
        const img = this.add.image(n(1), n(2), 'mine').setScale(1 / S).setDepth(2.5);
        this.mines.push({ img, t: 0.6 });
        break;
      }
      case 'V': this.vortices.push({ x: n(1), y: n(2), r: n(3), until: now + n(4), dur: n(4) }); break;
      case 'sp': this.vfx.splat(n(1), n(2), n(3)); break;
      case 'f': {
        const t = ZTYPES[n(1)];
        const img = this.add.image(n(2), n(3), t).setOrigin(zOrigin(t), 0.5).setRotation(n(4)).setScale(n(5) / S).setDepth(4);
        this.vfx.fall(img);
        break;
      }
      case 'T': {
        const [tx, ty, hp, max] = [n(1), n(2), n(3), n(4)];
        if (hp <= 0) { this.world.setKind(tx, ty, K_FLOOR); this.world.crateHp.delete(key2(tx, ty)); }
        else this.world.crateHp.set(key2(tx, ty), hp);
        this.chunks.hitTile(tx, ty, hp, max);
        break;
      }
      case 'D': {
        const [tx, ty, st] = [n(1), n(2), n(3)];
        this.world.setKind(tx, ty, st === 0 ? K_DOOR : st === 1 ? K_DOOROPEN : K_FLOOR);
        this.chunks.setDoor(tx, ty, st);
        break;
      }
      case 'g': this.segs.push({ x1: n(1), y1: n(2), x2: n(3), y2: n(4), born: now, kind: (['blade', 'dull', 'echo'] as const)[n(5)], width: n(6), color: n(7) || undefined }); break;
      case 'R': this.hud.radio(e[1] as string); break;
      case 'n': this.vfx.num(n(1), n(2), String(e[3]), !!n(4)); break;
      case 'B': this.burns.push({ x1: n(1), y1: n(2), x2: n(3), y2: n(4), until: now + n(5), w: n(6) }); break;
    }
  }

  private endStrokes() {
    for (const [pid, st] of this.strokes) { sfx.swipeEnd(pid); this.net.send({ t: 'su', s: st.sid }); }
    this.strokes.clear();
  }

  // ---------- Пауза ----------
  private requestPause() {
    if (this.over || this.paused) { if (this.paused) this.net.send({ t: 'resume' }); return; }
    if (this.pauseReqPending) return;
    const wait = 20 - (performance.now() - this.pauseReqAt) / 1000;
    if (wait > 0) { this.hud.toast(`Запросить паузу снова можно через ${Math.ceil(wait)} с`); return; }
    this.pauseReqPending = true;
    this.net.send({ t: 'preq' });
    this.hud.showWait('Запрос паузы отправлен напарнику…');
    setTimeout(() => {
      if (!this.pauseReqPending) return;
      this.pauseReqPending = false; this.pauseReqAt = performance.now();
      this.hud.showWait(null); this.hud.toast('Напарник не ответил');
    }, 12000);
  }

  // ---------- Ввод ----------
  private onDown(p: Phaser.Input.Pointer) {
    if (this.paused || this.over || !this.alive) return;
    const sx = p.x / this.dpr, sy = p.y / this.dpr;
    if (this.controls.down(p.id, sx, sy, p.wasTouch)) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const tx = Math.floor(w.x / TILE), ty = Math.floor(w.y / TILE), k = this.world.kind(tx, ty);
    if ((k === K_DOOR || k === K_DOOROPEN) && Math.hypot((tx + 0.5) * TILE - this.me.x, (ty + 0.5) * TILE - this.me.y) < TILE * 2.6) {
      this.net.send({ t: 'door', tx, ty });
      return;
    }
    const sid = ++this.sidSeq;
    this.strokes.set(p.id, { sid, lastSX: sx, lastSY: sy, lastT: performance.now(), px: w.x, py: w.y, moved: false, charged: false, left: this.stats.strokeLen });
    this.net.send({ t: 'sd', s: sid, x: Math.round(w.x), y: Math.round(w.y) });
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
    const v = d / Math.max(1, now - s.lastT);
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    // предсказываем вид следа локально, урон считает хост
    let kind: TrailSeg['kind'] = 'dull';
    if (v >= SWIPE_MIN_SPEED) {
      // длину взмаха считает хост (убийства её продлевают) — здесь только прикидка для вида следа
      if (s.left > -this.stats.strokeLen * 0.5 || this.sc[4]) { s.left -= d; kind = 'blade'; }
    }
    if (kind === 'blade' && Math.random() < 0.5) this.vfx.burst('spark', 1, w.x, w.y);
    this.segs.push({ x1: s.px, y1: s.py, x2: w.x, y2: w.y, born: this.now, kind, width: kind === 'blade' ? this.stats.bladeWidth * (s.charged ? 1.5 : 1) : 4, color: bladeColor(this.mb.blade) });
    this.net.send({ t: 'sm', s: s.sid, x: Math.round(w.x), y: Math.round(w.y), d: +d.toFixed(1), v: +v.toFixed(3) });
    sfx.swipeUpdate(p.id, v, kind === 'blade');
    s.moved = true;
    s.lastSX = sx; s.lastSY = sy; s.lastT = now; s.px = w.x; s.py = w.y;
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.controls.up(p.id)) return;
    const s = this.strokes.get(p.id);
    if (!s) return;
    this.strokes.delete(p.id);
    sfx.swipeEnd(p.id);
    this.net.send({ t: 'su', s: s.sid });
  }

  // ---------- Цикл ----------
  update(_t: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.now += dt;
    const now = performance.now();
    const me = this.me;

    let running = false;
    if (!this.paused && !this.over && this.alive) {
      const { dx, dy, run, mag } = this.controls.read();
      running = run;
      const tox = this.world.kindAtPx(me.x, me.y) === K_TOXIC;
      const sp = PLAYER_SPEED * this.stats.speedMul * (tox ? 0.7 : 1) * (run ? RUN_MUL : 1);
      if (mag > 0.05) {
        // упёрлись в закрытую дверь — просим хоста открыть
        const tx = Math.floor((me.x + dx * (PLAYER_R + 8)) / TILE), ty = Math.floor((me.y + dy * (PLAYER_R + 8)) / TILE);
        if (this.world.kind(tx, ty) === K_DOOR && now - this.doorAt > 300) { this.doorAt = now; this.net.send({ t: 'door', tx, ty, bump: 1 }); }
      }
      me.x += dx * sp * dt; me.y += dy * sp * dt;
      this.world.resolve(me, PLAYER_R);
      this.world.updateLevel(me);
      me.moving = mag;
      if (mag > 0.05) me.rot = Math.atan2(dy, dx);
    } else me.moving = 0;
    if (now - this.mvAt > 33) {
      this.mvAt = now;
      if (!this.over) this.net.send({ t: 'mv', x: Math.round(me.x), y: Math.round(me.y), l: me.lvl, r: +me.rot.toFixed(2), m: +me.moving.toFixed(2), run: running ? 1 : 0 });
    }
    me.bob += dt * 14 * me.moving;
    const my = this.myState;
    this.meImg.setPosition(me.x, me.y).setRotation(me.rot).setScale(((1 + 0.07 * me.lvl) * (1 + Math.sin(me.bob) * 0.05 * me.moving)) / S);
    if (my) styleDowned(this.meImg, my.alive, my.inv, my.hurt, my.tox);
    const myFr = me.moving > 0.1 ? `player2_w${Math.floor(me.bob / (Math.PI / 2)) % WALK_FRAMES}` : 'player2';
    if (this.meImg.texture.key !== myFr) this.meImg.setTexture(myFr);

    // Напарник
    const mate = this.ps[0];
    if (mate) {
      const k = Phaser.Math.Clamp((now - this.mate.t0) / SNAP_MS, 0, 1);
      this.mateImg.setPosition(this.mate.fx + (this.mate.tx - this.mate.fx) * k, this.mate.fy + (this.mate.ty - this.mate.fy) * k)
        .setRotation(mate.rot).setScale(mate.sc / S);
      styleDowned(this.mateImg, mate.alive, mate.inv, mate.hurt, mate.tox);
      const mv = Math.hypot(this.mate.tx - this.mate.fx, this.mate.ty - this.mate.fy);
      this.mateBob += mv > 1 ? dt * 14 : 0;
      const mfr = mv > 1 ? `player_w${Math.floor(this.mateBob / (Math.PI / 2)) % WALK_FRAMES}` : 'player';
      if (this.mateImg.texture.key !== mfr) this.mateImg.setTexture(mfr);
    }

    // Зомби
    for (const v of this.zv.values()) {
      const k = Phaser.Math.Clamp((now - v.t0) / SNAP_MS, 0, 1);
      let dr = v.tr - v.fr;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      const nx = v.fx + (v.tx - v.fx) * k, ny = v.fy + (v.ty - v.fy) * k;
      const mv = Math.hypot(nx - v.img.x, ny - v.img.y);
      v.ph += mv * 0.09;
      const fr = mv > 0.2 ? `${v.base}_w${Math.floor(v.ph / (Math.PI / 2)) % WALK_FRAMES}` : v.base;
      if (v.img.texture.key !== fr) v.img.setTexture(fr);
      v.img.setPosition(nx, ny).setRotation(v.fr + dr * k);
    }
    // Снаряды: экстраполяция по скорости
    const ex = (now - this.projAt) / 1000;
    this.projImgs.forEach((img, i) => {
      const p = this.projs[i];
      if (!p || !img.visible) return;
      img.setPosition(p.x + p.vx * ex, p.y + p.vy * ex);
      if (p.kind < 3 || p.kind === 9) img.setRotation(img.rotation + dt * 8);
      if (p.kind === 10) img.setScale((1 + Math.sin(now / 30) * 0.12) / S);
      if (p.kind < 2 && Math.random() < dt * 25) this.vfx.burst(p.kind === 1 ? 'magic' : 'acid', 1, img.x, img.y);
    });

    if (this.stats.chargeMul > 0) {
      for (const s of this.strokes.values()) {
        if (!s.moved && !s.charged && now - s.lastT > 500) { s.charged = true; this.net.send({ t: 'ch', s: s.sid }); }
      }
    }
    this.mines = this.mines.filter((m) => {
      m.t -= dt;
      m.img.setScale((1 + Math.sin(this.now * 30) * 0.12) / S);
      if (m.t <= 0) { m.img.destroy(); return false; }
      return true;
    });
    this.vortices = this.vortices.filter((v) => v.until > this.now);
    if (now - this.chunkAt > 120) { this.chunkAt = now; this.chunks.update(me.x, me.y); }
    this.draw();
  }

  private draw() {
    const now = this.now;
    const tg = this.trailG;
    tg.clear();
    this.ps.forEach((p, i) => {
      const x = i === 1 ? this.me.x : this.mateImg.x, y = i === 1 ? this.me.y : this.mateImg.y;
      if (p.aura > 0 && p.alive) drawAura(tg, x, y, p.aura, now);
      if (!p.alive) drawRevive(tg, x, y, p.down, now);
      else drawVitals(tg, x, y, p.hp / p.mhp);
      // кости-тринкеты
      const imgs = this.boneImgs[i];
      while (imgs.length < p.bones) imgs.push(this.add.image(0, 0, 'bone').setDepth(6).setScale(1 / S));
      imgs.forEach((img, j) => {
        if (j >= p.bones) { img.setVisible(false); return; }
        const a = p.ba + (j / p.bones) * Math.PI * 2;
        img.setVisible(true).setPosition(x + Math.cos(a) * 85, y + Math.sin(a) * 85).setRotation(a * 2);
      });
    });
    this.burns = this.burns.filter((b) => b.until > now);
    for (const b of this.burns) drawBurn(tg, b.x1, b.y1, b.x2, b.y2, b.w, (b.until - now) / 0.4);
    this.segs = this.segs.filter((s) => {
      const life = trailLife(s.kind, this.cross);
      if (now - s.born > life) return false;
      drawTrail(tg, s, now, life);
      return true;
    });

    const fg = this.fxG;
    fg.clear();
    for (const t of this.tele) drawTele(fg, t, now, SLAM_R, BOMB_R);
    for (const v of this.vortices) drawVortex(fg, v.x, v.y, v.r, (v.until - now) / v.dur, now);
    if (this.stats.chargeMul > 0) for (const s of this.strokes.values()) if (!s.moved) drawCharge(fg, s.px, s.py, s.charged, Math.min(1, (performance.now() - s.lastT) / 500), now);
    this.vfx.draw(fg, now);
    if (this.alive) drawWarnings(fg, this.cameras.main, this.dpr, this.tele, this.projs.filter((p) => p.kind < 2), now);
    this.hud.setBoss(this.hdr.boss?.[0] ?? null, this.hdr.boss?.[1] ?? 0);

    this.controls.render(this.hud, !this.paused && !this.over && this.alive);
    this.look.follow(this.me.x, this.me.y);
    if (this.map && this.objIdx < this.objs.length) {
      const o = this.objs[this.objIdx], t = this.map.objectives[this.objIdx];
      const wx = (t.x + 0.5) * TILE, wy = (t.y + 0.5) * TILE;
      drawBeacon(fg, wx, wy, o.kind === 'hold' ? TILE * 2.6 : TILE * 1.5, this.objProg, o.kind === 'hold', now);
      this.hud.setObjective(`${o.icon} ${this.objIdx + 1}/${this.objs.length}: ${o.label}${o.kind === 'hold' ? ` · ${Math.floor(this.objProg * 100)}%` : ''}`);
      const cam = this.cameras.main, k = cam.zoom / this.dpr;
      this.hud.setWaypoint({ x: (wx - cam.worldView.x) * k, y: (wy - cam.worldView.y) * k, icon: o.icon, dist: Math.round(Math.hypot(wx - this.me.x, wy - this.me.y) / TILE) });
    } else { this.hud.setObjective(null); this.hud.setWaypoint(null); }

    const my = this.myState;
    this.hud.update({
      hp: my?.hp ?? 100, maxHp: my?.mhp ?? 100,
      xp: this.hdr.xp, xpNext: this.hdr.xn, time: this.hdr.t, total: this.hdr.T, kills: this.hdr.k, level: this.hdr.lv, wave: this.wave,
    });
    this.hud.setScore(this.sc[0], this.sc[1], this.sc[2], this.sc[3], !!this.sc[4]);
    sfx.musicMood(this.paused || this.over ? -1 : this.sc[1], !!this.hdr.boss, !!this.sc[4], my ? my.hp / my.mhp : 1);
  }
}

/** Пул картинок: возвращает первые n видимыми, остальные прячет. */
function pool(scene: Phaser.Scene, arr: Phaser.GameObjects.Image[], n: number, tex: string, depth: number) {
  while (arr.length < n) arr.push(scene.add.image(0, 0, tex).setDepth(depth).setScale(1 / S));
  arr.forEach((img, i) => img.setVisible(i < n));
  return arr.slice(0, n);
}

