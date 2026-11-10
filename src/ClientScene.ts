import Phaser from 'phaser';
import { Hud } from './hud';
import { sfx, type SfxName } from './sfx';
import { session } from './session';
import { decodeSnap, ZF, type Msg, type Net } from './net';
import { ChunkView } from './chunks';
import { Effects, EMITTERS, drawTele, drawTrail, trailLife, type TrailSeg, type Tele } from './effects';
import { STAGES, STAGE_TIME, loadProgress, saveProgress, type StageDef } from './stages';
import { UPGRADES, computeStats, type Levels, type Stats } from './upgrades';
import { S, ZTYPES, makeTextures, zOrigin } from './textures';
import { World, K_FLOOR, K_TOXIC, key2, type Body } from './world';
import { BOMB_R, PLAYER_R, PLAYER_SPEED, SLAM_R, SWIPE_COST, SWIPE_MIN_SPEED, drawAura, drawBurn, drawRevive, styleDowned } from './GameScene';

interface ZView { img: Phaser.GameObjects.Image; type: number; fx: number; fy: number; tx: number; ty: number; fr: number; tr: number; t0: number; seen: number }
interface PState { x: number; y: number; lvl: number; rot: number; hp: number; mhp: number; en: number; emx: number; alive: boolean; down: number; inv: number; hurt: boolean; tox: boolean; aura: number; bones: number; ba: number; sc: number }

const SNAP_MS = 66;

/** Гость в онлайн-коопе: рисует мир по снимкам хоста, своё движение и свайпы — локально. */
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
  private ps: PState[] = [];
  private levels: Levels = {};
  private stats: Stats = computeStats({});
  private energyPred = 100;
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
  private strokes = new Map<number, { sid: number; lastSX: number; lastSY: number; lastT: number; px: number; py: number }>();
  private sidSeq = 0;
  private joy: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private touchSeen = false;
  private mvAt = 0; private chunkAt = 0;
  private pauseReqPending = false; private pauseReqAt = -1e9;
  private trailG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() { super('client'); }

  init(data: { stage: number; seed: number; time?: number }) {
    this.stageIdx = data.stage; this.seed = data.seed;
    this.net = session.net!;
    this.stage = STAGES[this.stageIdx];
    this.hdr.T = data.time ?? STAGE_TIME;
  }

  create() {
    if (location.search.includes('debug')) Object.assign(window, { scene: this, sfx });
    makeTextures(this);
    this.dpr = (this.registry.get('dpr') as number) || 1;
    this.world = new World(this.seed, this.stage.gen);
    this.chunks = new ChunkView(this, this.world, this.stage.palette);
    this.vfx = new Effects(this);
    this.cameras.main.setBackgroundColor(this.stage.bg);
    document.body.style.background = this.stage.bg;

    this.me = { x: 40, y: 0, lvl: 0, rot: 0, moving: 0, bob: 0 };
    this.levels = {}; this.stats = computeStats(this.levels); this.energyPred = this.stats.energyMax;
    this.zv.clear(); this.gemImgs = []; this.projImgs = []; this.boomImgs = []; this.boneImgs = [[], []];
    this.segs = []; this.burns = []; this.tele = []; this.projs = []; this.ps = [];
    this.lastSeq = 0; this.paused = false; this.over = false; this.strokes.clear(); this.joy = null;
    this.pauseReqPending = false; this.pauseReqAt = -1e9;

    this.meImg = this.add.image(this.me.x, 0, 'player2').setScale(1 / S).setDepth(5).setOrigin(22 / 46, 0.5);
    this.mateImg = this.add.image(0, 0, 'player').setScale(1 / S).setDepth(5).setOrigin(22 / 46, 0.5);
    this.trailG = this.add.graphics().setDepth(7);
    this.fxG = this.add.graphics().setDepth(8);

    this.hud = new Hud();
    this.hud.show(true);
    this.hud.setItems(this.levels);
    this.hud.onPause = () => this.requestPause();
    this.hud.toast(`Уровень ${this.stageIdx + 1}: ${this.stage.name} · кооп`, 2200);

    this.cameras.main.startFollow(this.meImg, false, 1, 1);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    session.onMsg = this.onMsg;
    session.onSnap = this.onSnap;
    session.onClose = this.onClose;
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.hud.setJoystick(null); this.hud.setBoss(null); this.hud.closeModals();
      if (session.onSnap === this.onSnap) { session.onMsg = null; session.onSnap = null; session.onClose = null; }
    });

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC,P') as Record<string, Phaser.Input.Keyboard.Key>;
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
    this.worldZoom = Phaser.Math.Clamp(Math.min(w, h) / 760, 0.55, 1.15);
    this.cameras.main.setZoom(this.worldZoom * this.dpr);
  }

  private get myState() { return this.ps[1]; }
  private get alive() { return this.myState ? this.myState.alive : true; }

  // ---------- Сеть ----------
  private onMsg = (m: Msg) => {
    switch (m.t) {
      case 'choices': {
        const ch = (m.ids as string[]).map((id) => UPGRADES.find((u) => u.id === id)!).filter(Boolean);
        this.paused = true; this.strokes.clear(); this.joy = null;
        sfx.play('level');
        this.hud.showLevelUp(ch, this.levels, (id) => {
          this.net.send({ t: 'pick', id });
          this.hud.showWait('Напарник выбирает улучшение…');
        });
        break;
      }
      case 'picked': this.paused = false; this.hud.showWait(null); break;
      case 'paused':
        this.paused = true; this.strokes.clear(); this.joy = null;
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
    this.hud.closeModals(); this.hud.showWait(null); this.hud.setBoss(null); this.hud.setJoystick(null);
    const prog = loadProgress();
    prog.best[this.stageIdx] = Math.max(prog.best[this.stageIdx] ?? 0, Math.floor(this.hdr.t));
    if (m.win) {
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
    this.tele = h.tele; this.cross = !!h.cross;
    this.ps = (h.pl as number[][]).map((a) => ({
      x: a[0], y: a[1], lvl: a[2], rot: a[3], hp: a[4], mhp: a[5], en: a[6], emx: a[7], alive: !!a[8], down: a[9], inv: a[10], hurt: !!a[11], tox: !!a[12],
      aura: a[13], bones: a[14], ba: a[15], sc: a[16],
    }));
    if (this.ps[1]) this.energyPred = this.ps[1].en;
    const lv = h.lv2 as Levels;
    if (JSON.stringify(lv) !== JSON.stringify(this.levels)) { this.levels = { ...lv }; this.stats = computeStats(this.levels); this.hud.setItems(this.levels); }
    const mate = this.ps[0];
    if (mate) { this.mate.fx = this.mateImg.x; this.mate.fy = this.mateImg.y; this.mate.tx = mate.x; this.mate.ty = mate.y; this.mate.t0 = now; }

    // Зомби: интерполяция между текущим видом и новым снимком
    for (const r of zs) {
      let v = this.zv.get(r.id);
      if (!v || v.type !== r.type) {
        v?.img.destroy();
        const t = ZTYPES[r.type];
        const img = this.add.image(r.x, r.y, t).setOrigin(zOrigin(t), 0.5).setDepth(4);
        v = { img, type: r.type, fx: r.x, fy: r.y, tx: r.x, ty: r.y, fr: r.rot, tr: r.rot, t0: now, seen: h.s };
        this.zv.set(r.id, v);
      }
      v.fx = v.img.x; v.fy = v.img.y; v.tx = r.x; v.ty = r.y; v.fr = v.img.rotation; v.tr = r.rot; v.t0 = now; v.seen = h.s;
      const img = v.img;
      img.setScale(r.sx / S, r.sy / S).setAlpha(r.alpha);
      img.setDepth(r.flags & ZF.AIR ? 6.5 : r.flags & ZF.BOSS ? 4.5 : 4);
      if (r.flags & ZF.BROKEN && img.texture.key !== 'shield_broken') img.setTexture('shield_broken');
      if (r.flags & ZF.FLASH) img.setTintFill(0xffffff);
      else if (r.flags & ZF.RED) img.setTint(0xff8787);
      else if (r.flags & ZF.FROST) img.setTint(0x9fd4ff);
      else img.clearTint();
    }
    for (const [id, v] of this.zv) if (v.seen !== h.s) { v.img.destroy(); this.zv.delete(id); }

    pool(this, this.gemImgs, gs.length, 'gem', 2).forEach((img, i) => {
      const g = gs[i];
      img.setTexture(g.kind === 2 ? 'chest' : 'gem').setPosition(g.x, g.y).setScale((g.kind === 1 ? 1.5 : 1) / S);
      if (g.kind === 1) img.setTint(0xb197fc); else img.clearTint();
    });
    this.projs = ps; this.projAt = now;
    pool(this, this.projImgs, ps.length, 'acid', 6).forEach((img, i) => {
      const p = ps[i];
      img.setTexture(p.kind === 1 ? 'orb' : 'acid');
      if (p.kind === 2) img.setTint(0x66d9e8); else img.clearTint();
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
        sfx.play(e[1] as SfxName, n(2) * att);
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
        this.vfx.poly(now, pts, 0xb197fc);
        break;
      }
      case 'c': this.vfx.slice(ZTYPES[n(1)], n(2), n(3), n(4), n(5)); break;
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
      case 'g': this.segs.push({ x1: n(1), y1: n(2), x2: n(3), y2: n(4), born: now, kind: (['blade', 'dull', 'echo'] as const)[n(5)], width: n(6) }); break;
      case 'B': this.burns.push({ x1: n(1), y1: n(2), x2: n(3), y2: n(4), until: now + n(5), w: n(6) }); break;
    }
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
  private inJoyZone(x: number, y: number) {
    const w = window.innerWidth, h = window.innerHeight;
    return w > h ? x < w * 0.4 : x < w * 0.55 && y > h * 0.5;
  }
  private joyR() { return Phaser.Math.Clamp(Math.min(window.innerWidth, window.innerHeight) * 0.11, 44, 70); }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.paused || this.over || !this.alive) return;
    const sx = p.x / this.dpr, sy = p.y / this.dpr;
    if (p.wasTouch) this.touchSeen = true;
    if (p.wasTouch && !this.joy && this.inJoyZone(sx, sy)) { this.joy = { id: p.id, bx: sx, by: sy, x: sx, y: sy }; return; }
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const sid = ++this.sidSeq;
    this.strokes.set(p.id, { sid, lastSX: sx, lastSY: sy, lastT: performance.now(), px: w.x, py: w.y });
    this.net.send({ t: 'sd', s: sid, x: Math.round(w.x), y: Math.round(w.y) });
  }

  private onMove(p: Phaser.Input.Pointer) {
    const sx = p.x / this.dpr, sy = p.y / this.dpr;
    if (this.joy && p.id === this.joy.id) { this.joy.x = sx; this.joy.y = sy; return; }
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
      const cost = d * SWIPE_COST * this.stats.costMul;
      if (this.energyPred >= cost) { this.energyPred -= cost; kind = 'blade'; } else this.hud.energyEmpty();
    }
    if (kind === 'blade' && Math.random() < 0.5) this.vfx.burst('spark', 1, w.x, w.y);
    this.segs.push({ x1: s.px, y1: s.py, x2: w.x, y2: w.y, born: this.now, kind, width: kind === 'blade' ? this.stats.bladeWidth : 4 });
    this.net.send({ t: 'sm', s: s.sid, x: Math.round(w.x), y: Math.round(w.y), d: +d.toFixed(1), v: +v.toFixed(3) });
    s.lastSX = sx; s.lastSY = sy; s.lastT = now; s.px = w.x; s.py = w.y;
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.joy && p.id === this.joy.id) { this.joy = null; return; }
    const s = this.strokes.get(p.id);
    if (!s) return;
    this.strokes.delete(p.id);
    this.net.send({ t: 'su', s: s.sid });
  }

  // ---------- Цикл ----------
  update(_t: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.now += dt;
    const now = performance.now();
    const me = this.me;

    if (!this.paused && !this.over && this.alive) {
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
      const tox = this.world.kindAtPx(me.x, me.y) === K_TOXIC;
      const sp = PLAYER_SPEED * this.stats.speedMul * (tox ? 0.7 : 1);
      me.x += dx * sp * dt; me.y += dy * sp * dt;
      this.world.resolve(me, PLAYER_R);
      this.world.updateLevel(me);
      me.moving = Math.min(1, l);
      if (l > 0.05) me.rot = Math.atan2(dy, dx);
      this.energyPred = Math.min(this.stats.energyMax, this.energyPred + this.stats.energyRegen * dt);
    } else me.moving = 0;
    if (now - this.mvAt > 50) {
      this.mvAt = now;
      if (!this.over) this.net.send({ t: 'mv', x: Math.round(me.x), y: Math.round(me.y), l: me.lvl, r: +me.rot.toFixed(2), m: +me.moving.toFixed(2) });
    }
    me.bob += dt * 14 * me.moving;
    const my = this.myState;
    this.meImg.setPosition(me.x, me.y).setRotation(me.rot).setScale(((1 + 0.07 * me.lvl) * (1 + Math.sin(me.bob) * 0.05 * me.moving)) / S);
    if (my) styleDowned(this.meImg, my.alive, my.inv, my.hurt, my.tox);

    // Напарник
    const mate = this.ps[0];
    if (mate) {
      const k = Phaser.Math.Clamp((now - this.mate.t0) / SNAP_MS, 0, 1);
      this.mateImg.setPosition(this.mate.fx + (this.mate.tx - this.mate.fx) * k, this.mate.fy + (this.mate.ty - this.mate.fy) * k)
        .setRotation(mate.rot).setScale(mate.sc / S);
      styleDowned(this.mateImg, mate.alive, mate.inv, mate.hurt, mate.tox);
    }

    // Зомби
    for (const v of this.zv.values()) {
      const k = Phaser.Math.Clamp((now - v.t0) / SNAP_MS, 0, 1);
      let dr = v.tr - v.fr;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      v.img.setPosition(v.fx + (v.tx - v.fx) * k, v.fy + (v.ty - v.fy) * k).setRotation(v.fr + dr * k);
    }
    // Снаряды: экстраполяция по скорости
    const ex = (now - this.projAt) / 1000;
    this.projImgs.forEach((img, i) => {
      const p = this.projs[i];
      if (!p || !img.visible) return;
      img.setPosition(p.x + p.vx * ex, p.y + p.vy * ex).setRotation(img.rotation + dt * 8);
    });

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
    this.vfx.draw(fg, now);
    this.hud.setBoss(this.hdr.boss?.[0] ?? null, this.hdr.boss?.[1] ?? 0);

    if (this.joy) {
      const R = this.joyR();
      const jx = this.joy.x - this.joy.bx, jy = this.joy.y - this.joy.by;
      const l = Math.hypot(jx, jy), m = l > R ? R / l : 1;
      this.hud.setJoystick('active', this.joy.bx, this.joy.by, this.joy.bx + jx * m, this.joy.by + jy * m, R);
    } else if (this.touchSeen && !this.paused && !this.over && this.alive) {
      const R = this.joyR(), w = window.innerWidth, h = window.innerHeight;
      if (w > h) this.hud.setJoystick('hint', R + 40, h - R - 40, 0, 0, R);
      else this.hud.setJoystick('hint', w * 0.27, h - R - 60, 0, 0, R);
    } else this.hud.setJoystick(null);

    const my = this.myState;
    this.hud.update({
      hp: my?.hp ?? 100, maxHp: my?.mhp ?? 100, energy: Math.min(this.energyPred, my?.emx ?? 100), energyMax: my?.emx ?? 100,
      xp: this.hdr.xp, xpNext: this.hdr.xn, time: this.hdr.t, total: this.hdr.T, kills: this.hdr.k, level: this.hdr.lv,
    });
  }
}

/** Пул картинок: возвращает первые n видимыми, остальные прячет. */
function pool(scene: Phaser.Scene, arr: Phaser.GameObjects.Image[], n: number, tex: string, depth: number) {
  while (arr.length < n) arr.push(scene.add.image(0, 0, tex).setDepth(depth).setScale(1 / S));
  arr.forEach((img, i) => img.setVisible(i < n));
  return arr.slice(0, n);
}

