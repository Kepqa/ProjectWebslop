/**
 * Логика дуэли: бойцы, удары, блок/парирование, рывки, заклинания, снаряды.
 * Мир фиксированного размера W×H, вид сбоку; координата y бойца — уровень ног.
 */
import { sfx, type SfxName } from '../sfx';

export const W = 960;
export const H = 540;
export const GROUND = 452;
export const LEFT = 50;
export const RIGHT = W - 50;
const GRAVITY = 2300;

/** Команда на кадр: движение и «держать блок» — удерживаемые, остальное — нажатия. */
export interface Cmd { move: -1 | 0 | 1; jump: boolean; light: boolean; heavy: boolean; block: boolean; dodge: boolean; spell: 0 | 1 | 2 | 3 }
export const NOCMD: Cmd = { move: 0, jump: false, light: false, heavy: false, block: false, dodge: false, spell: 0 };

export type Act = 'idle' | 'walk' | 'air' | 'light' | 'heavy' | 'block' | 'dodge' | 'hurt' | 'stun' | 'cast' | 'dash' | 'ko';

interface Move {
  startup: number; active: number; recovery: number;
  dmg: number; range: number; kb: number; hitstun: number; guard: number;
  stamina?: number; /** пробивает блок сразу */ crush?: boolean;
}

const LIGHTS: Move[] = [
  { startup: 0.09, active: 0.08, recovery: 0.17, dmg: 6, range: 82, kb: 110, hitstun: 0.28, guard: 9 },
  { startup: 0.08, active: 0.08, recovery: 0.19, dmg: 6, range: 84, kb: 120, hitstun: 0.28, guard: 9 },
  { startup: 0.12, active: 0.1, recovery: 0.3, dmg: 10, range: 90, kb: 380, hitstun: 0.42, guard: 16 },
];
const AIR: Move = { startup: 0.06, active: 0.16, recovery: 0.14, dmg: 8, range: 80, kb: 220, hitstun: 0.34, guard: 12 };
const HEAVY: Move = { startup: 0.38, active: 0.1, recovery: 0.44, dmg: 17, range: 98, kb: 460, hitstun: 0.5, guard: 42, stamina: 14 };

export type HeroId = 'knight' | 'mage' | 'rogue';

export interface Spell {
  name: string; icon: string; desc: string;
  mana: number; cd: number; cast: number;
  /** может ли сработать сейчас (например, лечение при полном HP бессмысленно, но разрешено) */
  fire: (g: Game, me: Fighter) => void;
}

export interface Hero {
  id: HeroId; name: string; title: string;
  hp: number; speed: number; power: number; lightSpeed: number; manaRegen: number;
  body: string; trim: string; skin: string; accent: string;
  spells: [Spell, Spell, Spell];
  /** дистанция, на которой боту комфортно */ prefer: number;
  /** цвета второго бойца в зеркальном бою */ alt: { body: string; trim: string; accent: string };
}

// ---------- Заклинания ----------

const shieldBash: Spell = {
  name: 'Рывок щитом', icon: '🛡️', desc: 'Таран вперёд: сносит и выбивает выносливость из блока',
  mana: 30, cd: 5.5, cast: 0.12,
  fire: (g, me) => {
    me.startDash(0.26, 980, { dmg: 9, kb: 520, hitstun: 0.5, guard: 55, through: false, unblockable: false });
    g.sound('wave');
  },
};
const warCry: Spell = {
  name: 'Боевой клич', icon: '📯', desc: '5 с: +35% урона и не сбивают с ног',
  mana: 35, cd: 13, cast: 0.35,
  fire: (g, me) => { me.buff = 5; g.ring(me.x, me.y - 70, me.hero.accent, 120); g.sound('charge'); g.text(me.x, me.y - 150, 'Ярость!', me.hero.accent); },
};
const prayer: Spell = {
  name: 'Молитва', icon: '✨', desc: '+24 здоровья',
  mana: 45, cd: 14, cast: 0.6,
  fire: (g, me) => {
    const h = Math.min(24, me.maxHp - me.hp); me.hp += h;
    g.sound('heal'); g.text(me.x, me.y - 150, `+${Math.round(h)}`, '#8dff9a');
    for (let i = 0; i < 24; i++) g.spark(me.x + (Math.random() - 0.5) * 60, me.y - Math.random() * 120, '#c6ffb0', 0, -120 - Math.random() * 120, 0.8);
  },
};

const fireball: Spell = {
  name: 'Огненный шар', icon: '🔥', desc: 'Снаряд: 14 урона и отбрасывает',
  mana: 18, cd: 1.1, cast: 0.2,
  fire: (g, me) => { g.shoot(me, 'fire', 600, 14, 22); g.sound('throw'); },
};
const lightning: Spell = {
  name: 'Молния', icon: '⚡', desc: 'Через 0.6 с бьёт туда, где стоял враг. Не блокируется — уходи',
  mana: 30, cd: 4.5, cast: 0.25,
  fire: (g, me) => { const foe = g.foeOf(me); g.strikes.push({ x: foe.x, t: 0.6, owner: me, dmg: 20 }); g.sound('zap'); },
};
const blink: Spell = {
  name: 'Скачок', icon: '🌀', desc: 'Телепорт назад, подальше от врага. В углу — за его спину',
  mana: 20, cd: 4, cast: 0.08,
  fire: (g, me) => {
    const foe = g.foeOf(me);
    g.ring(me.x, me.y - 60, me.hero.accent, 60);
    const away = me.x >= foe.x ? 1 : -1;
    let nx = me.x + away * 280;
    if (nx < LEFT + 20 || nx > RIGHT - 20) nx = foe.x - away * 120;
    me.x = Math.max(LEFT, Math.min(RIGHT, nx)); me.vx = 0;
    me.facing = foe.x > me.x ? 1 : -1;
    me.invuln = 0.2;
    g.ring(me.x, me.y - 60, me.hero.accent, 60); g.sound('rune');
  },
};

const kunai: Spell = {
  name: 'Кунай', icon: '🗡️', desc: 'Быстрый нож: 7 урона',
  mana: 15, cd: 0.9, cast: 0.1,
  fire: (g, me) => { g.shoot(me, 'knife', 900, 7, 12); g.sound('spear'); },
};
const shadowStep: Spell = {
  name: 'Теневой шаг', icon: '💨', desc: 'Рывок сквозь врага с ударом в спину',
  mana: 30, cd: 5, cast: 0.08,
  fire: (g, me) => {
    me.startDash(0.22, 1250, { dmg: 13, kb: 200, hitstun: 0.45, guard: 20, through: true, unblockable: false });
    g.sound('swipe');
  },
};
const venom: Spell = {
  name: 'Ядовитый клинок', icon: '🧪', desc: '6 с: удары отравляют (2 урона/с, 4 с)',
  mana: 35, cd: 12, cast: 0.3,
  fire: (g, me) => { me.venom = 6; g.sound('charge'); g.text(me.x, me.y - 150, 'Яд!', '#9dff5a'); },
};

export const HEROES: Hero[] = [
  {
    id: 'knight', name: 'Рыцарь', title: 'Крепкий, медленный, бьёт больно',
    hp: 122, speed: 225, power: 1.08, lightSpeed: 1, manaRegen: 5, prefer: 80,
    body: '#5d6b82', trim: '#c9d2e0', skin: '#e9c7a2', accent: '#7fb2ff', alt: { body: '#7a3a3a', trim: '#e8c46a', accent: '#ff8a6b' },
    spells: [shieldBash, warCry, prayer],
  },
  {
    id: 'mage', name: 'Маг', title: 'Хрупкий, держит дистанцию заклинаниями',
    hp: 100, speed: 255, power: 0.9, lightSpeed: 1, manaRegen: 8.5, prefer: 330,
    body: '#5b2f78', trim: '#f2c14e', skin: '#f0d3b5', accent: '#ff8a3d', alt: { body: '#1f5a6e', trim: '#bfe9ff', accent: '#5ad1ff' },
    spells: [fireball, lightning, blink],
  },
  {
    id: 'rogue', name: 'Тень', title: 'Быстрая, рвёт дистанцию и травит',
    hp: 104, speed: 300, power: 0.95, lightSpeed: 1.25, manaRegen: 5, prefer: 90,
    body: '#2c3a34', trim: '#9dff5a', skin: '#d9b08c', accent: '#9dff5a', alt: { body: '#3a2c3a', trim: '#ff5ad1', accent: '#ff5ad1' },
    spells: [kunai, shadowStep, venom],
  },
];

interface DashHit { dmg: number; kb: number; hitstun: number; guard: number; through: boolean; unblockable: boolean }

export class Fighter {
  x: number; y = GROUND; vx = 0; vy = 0;
  facing: 1 | -1;
  hp: number; maxHp: number;
  stamina = 100; mana = 30;
  act: Act = 'idle'; t = 0;
  move: Move | null = null; combo = 0; hitDone = false; stepped = false; attackId = 0; queued = false;
  stunFor = 0; invuln = 0; blockAt = -1;
  cds = [0, 0, 0]; casting = -1;
  buff = 0; venom = 0; poison = 0;
  dash: DashHit | null = null; dashDur = 0;
  walkPhase = 0; flash = 0; wins = 0;
  /** время на земле без атак — для «дыхания» */
  life = 0;

  constructor(public hero: Hero, public side: 0 | 1) {
    this.maxHp = hero.hp; this.hp = hero.hp;
    this.x = side === 0 ? 300 : W - 300;
    this.facing = side === 0 ? 1 : -1;
  }

  reset() {
    this.x = this.side === 0 ? 300 : W - 300; this.y = GROUND; this.vx = this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.hp = this.maxHp; this.stamina = 100; this.mana = 30;
    this.act = 'idle'; this.t = 0; this.move = null; this.combo = 0; this.cds = [0, 0, 0];
    this.buff = this.venom = this.poison = 0; this.dash = null; this.stunFor = 0; this.invuln = 0; this.casting = -1;
  }

  get grounded() { return this.y >= GROUND - 0.5; }
  get busy() { return !['idle', 'walk', 'block', 'air'].includes(this.act); }
  /** фаза атаки: 0 — замах, 1 — удар, 2 — возврат */
  get phase(): 0 | 1 | 2 {
    const m = this.move; if (!m) return 2;
    const k = this.act === 'light' ? 1 / this.hero.lightSpeed : 1;
    if (this.t < m.startup * k) return 0;
    if (this.t < (m.startup + m.active) * k) return 1;
    return 2;
  }
  get moveLen() { const m = this.move!; const k = this.act === 'light' ? 1 / this.hero.lightSpeed : 1; return (m.startup + m.active + m.recovery) * k; }

  set(act: Act) { this.act = act; this.t = 0; }

  startDash(dur: number, speed: number, hit: DashHit) {
    this.set('dash'); this.dash = hit; this.dashDur = dur; this.vx = this.facing * speed; this.hitDone = false; this.attackId++;
    if (hit.through) this.invuln = dur;
  }
}

interface Projectile { x: number; y: number; vx: number; owner: Fighter; kind: 'fire' | 'knife'; dmg: number; r: number; life: number }
interface Strike { x: number; t: number; owner: Fighter; dmg: number; hit?: boolean; flash?: number }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }
export interface FloatText { x: number; y: number; text: string; color: string; life: number }
export interface Ring { x: number; y: number; color: string; r: number; life: number }
export interface Slash { f: Fighter; life: number; heavy: boolean }

export type Phase = 'intro' | 'fight' | 'ko' | 'over';

export class Game {
  f: [Fighter, Fighter];
  shots: Projectile[] = [];
  strikes: Strike[] = [];
  parts: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  slashes: Slash[] = [];
  shake = 0; hitstop = 0; slowmo = 0;
  phase: Phase = 'intro'; phaseT = 0;
  round = 1; timer = 60;
  banner = ''; bannerT = 0;
  winner: Fighter | null = null;
  time = 0;
  /** события для HUD/звука/вибрации */
  onEvent: (e: 'hit' | 'parry' | 'ko' | 'round' | 'over') => void = () => undefined;

  constructor(a: Hero, b: Hero, public roundsToWin = 2) {
    if (a.id === b.id) b = { ...b, ...b.alt };
    this.f = [new Fighter(a, 0), new Fighter(b, 1)];
    this.startRound();
  }

  foeOf(me: Fighter) { return this.f[me.side === 0 ? 1 : 0]; }
  sound(n: SfxName, v = 1, p = 1) { sfx.play(n, v, p); }

  startRound() {
    for (const f of this.f) f.reset();
    this.shots = []; this.strikes = [];
    this.timer = 60; this.phase = 'intro'; this.phaseT = 0;
    this.banner = `Раунд ${this.round}`; this.bannerT = 1.6;
    this.onEvent('round');
  }

  // ---------- эффекты ----------
  spark(x: number, y: number, color: string, vx = 0, vy = 0, life = 0.4, size = 3, g = 600) {
    this.parts.push({ x, y, vx, vy, life, max: life, color, size, g });
  }
  burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.spark(x, y, color, Math.cos(a) * s, Math.sin(a) * s - 80, 0.25 + Math.random() * 0.35, 2 + Math.random() * 3);
    }
  }
  text(x: number, y: number, text: string, color: string) { this.texts.push({ x, y, text, color, life: 1 }); }
  ring(x: number, y: number, color: string, r: number) { this.rings.push({ x, y, color, r, life: 0.45 }); }
  shoot(me: Fighter, kind: Projectile['kind'], speed: number, dmg: number, r: number) {
    this.shots.push({ x: me.x + me.facing * 46, y: me.y - 78, vx: me.facing * speed, owner: me, kind, dmg, r, life: 2.2 });
  }

  // ---------- кадр ----------
  update(dt: number, cmds: [Cmd, Cmd]) {
    this.time += dt;
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.updateFx(dt);
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.3; }

    this.phaseT += dt;
    if (this.phase === 'intro') {
      cmds = [NOCMD, NOCMD];
      if (this.phaseT > 1.3) { this.phase = 'fight'; this.phaseT = 0; this.banner = 'В бой!'; this.bannerT = 0.7; this.sound('bell', 0.7); }
    } else if (this.phase === 'fight') {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 0; this.endRound(null); }
    } else {
      cmds = [NOCMD, NOCMD];
      if (this.phase === 'ko' && this.phaseT > 2.4) {
        if (this.f.some((f) => f.wins >= this.roundsToWin)) { this.phase = 'over'; this.phaseT = 0; this.onEvent('over'); }
        else { this.round++; this.startRound(); }
      }
    }

    for (let i = 0; i < 2; i++) this.updateFighter(this.f[i], cmds[i], dt);
    this.separate();
    for (const f of this.f) this.checkMelee(f);
    this.updateShots(dt);
    this.updateStrikes(dt);
  }

  private endRound(loser: Fighter | null) {
    if (this.phase !== 'fight') return;
    const [a, b] = this.f;
    if (!loser) {
      const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
      loser = pa === pb ? null : pa < pb ? a : b;
      this.banner = loser ? 'Время!' : 'Ничья';
    } else this.banner = 'K.O.';
    this.bannerT = 2.2;
    if (loser) { this.winner = this.foeOf(loser); this.winner.wins++; } else { a.wins++; b.wins++; this.winner = null; }
    this.phase = 'ko'; this.phaseT = 0; this.slowmo = 0.9;
    this.onEvent('ko');
  }

  private updateFighter(me: Fighter, c: Cmd, dt: number) {
    const foe = this.foeOf(me);
    const h = me.hero;
    me.t += dt; me.life += dt;
    me.invuln = Math.max(0, me.invuln - dt);
    me.flash = Math.max(0, me.flash - dt);
    me.buff = Math.max(0, me.buff - dt);
    me.venom = Math.max(0, me.venom - dt);
    for (let i = 0; i < 3; i++) me.cds[i] = Math.max(0, me.cds[i] - dt);
    if (me.poison > 0 && me.act !== 'ko') {
      me.poison -= dt; this.damage(me, 2 * dt, null);
      if (Math.random() < dt * 8) this.spark(me.x + (Math.random() - 0.5) * 30, me.y - 40 - Math.random() * 70, '#9dff5a', 0, -60, 0.6, 2, 0);
    }
    if (me.act !== 'ko' && this.phase === 'fight') me.mana = Math.min(100, me.mana + h.manaRegen * dt);
    const blocking = me.act === 'block';
    me.stamina = Math.min(100, me.stamina + (blocking ? 6 : me.busy ? 10 : 24) * dt);

    const canAct = this.phase === 'fight';
    const free = ['idle', 'walk', 'block'].includes(me.act) && me.grounded;

    // разворот к врагу
    if (free || me.act === 'air') me.facing = foe.x >= me.x ? 1 : -1;

    switch (me.act) {
      case 'idle': case 'walk': case 'block': {
        if (!canAct) { me.vx = 0; if (me.act !== 'idle') me.set('idle'); break; }
        if (c.spell && this.tryCast(me, c.spell - 1)) break;
        if (c.dodge && me.stamina >= 22) {
          me.stamina -= 22; me.set('dodge'); me.invuln = 0.28;
          const dir = c.move || -me.facing;
          me.vx = dir * 560; this.sound('swipe', 0.6, 0.8); break;
        }
        if (c.heavy && me.stamina >= HEAVY.stamina!) { me.stamina -= HEAVY.stamina!; this.attack(me, HEAVY, 'heavy'); break; }
        if (c.light) { me.combo = 0; this.attack(me, LIGHTS[0], 'light'); break; }
        if (c.jump) { me.vy = -760; me.vx = c.move * h.speed * 1.05; me.y -= 1; me.set('air'); this.sound('jump', 0.5); break; }
        if (c.block) {
          if (me.act !== 'block') { me.set('block'); me.blockAt = this.time; }
          me.vx = 0; break;
        }
        if (c.move) {
          me.vx = c.move * h.speed * (c.move === me.facing ? 1 : 0.8);
          if (me.act !== 'walk') me.set('walk');
          me.walkPhase += dt * me.vx * me.facing * 0.045;
        } else { me.vx = 0; if (me.act !== 'idle') me.set('idle'); }
        break;
      }
      case 'air':
        if (canAct && c.light && !me.move) this.attack(me, AIR, 'light');
        if (canAct && c.spell) this.tryCast(me, c.spell - 1, true);
        break;
      case 'light': case 'heavy': {
        if (me.act === 'light' && c.light && me.combo < 2 && me.phase >= 1) me.queued = true;
        const end = me.moveLen;
        if (me.grounded) me.vx *= Math.pow(0.0005, dt);
        // шаг вперёд в момент удара
        if (me.phase === 1 && me.grounded && !me.stepped) { me.stepped = true; me.vx = me.facing * (me.act === 'heavy' ? 260 : 130); }
        if (me.t >= end) {
          if (me.queued && me.move !== AIR) { me.queued = false; me.combo++; this.attack(me, LIGHTS[me.combo], 'light'); }
          else { me.move = null; me.queued = false; me.set(me.grounded ? 'idle' : 'air'); }
        }
        break;
      }
      case 'dodge':
        me.vx *= Math.pow(0.02, dt);
        if (me.t > 0.36) me.set('idle');
        break;
      case 'dash':
        if (me.t > me.dashDur) { me.vx *= 0.2; me.dash = null; me.set('idle'); me.facing = foe.x >= me.x ? 1 : -1; }
        break;
      case 'cast':
        me.vx *= Math.pow(0.001, dt);
        if (me.casting >= 0 && me.t >= h.spells[me.casting].cast) {
          const i = me.casting; me.casting = -1;
          const s = h.spells[i];
          me.mana -= s.mana; me.cds[i] = s.cd;
          me.set(me.grounded ? 'idle' : 'air');
          s.fire(this, me);
        }
        break;
      case 'hurt':
        me.vx *= Math.pow(0.01, dt);
        if (me.t > me.stunFor) me.set(me.grounded ? 'idle' : 'air');
        break;
      case 'stun':
        me.vx *= Math.pow(0.005, dt);
        if (me.t > me.stunFor) me.set('idle');
        break;
      case 'ko':
        me.vx *= Math.pow(0.05, dt);
        break;
    }

    // физика
    if (!me.grounded || me.vy < 0) {
      me.vy += GRAVITY * dt;
      if (me.act === 'air' && canAct && c.move) me.vx += (c.move * h.speed - me.vx) * Math.min(1, dt * 3);
    }
    me.x += me.vx * dt; me.y += me.vy * dt;
    if (me.y >= GROUND) {
      if (me.vy > 300) { this.sound('land', 0.4); this.dust(me.x); }
      me.y = GROUND; me.vy = 0;
      if (me.act === 'air') { me.move = null; me.set('idle'); }
    }
    if (me.x < LEFT) { me.x = LEFT; if (me.act === 'dash') me.vx = 0; }
    if (me.x > RIGHT) { me.x = RIGHT; if (me.act === 'dash') me.vx = 0; }
  }

  private dust(x: number) {
    for (let i = 0; i < 8; i++) this.spark(x + (Math.random() - 0.5) * 30, GROUND - 2, '#b9a58a', (Math.random() - 0.5) * 200, -40 - Math.random() * 60, 0.4, 3, 200);
  }

  private attack(me: Fighter, m: Move, act: 'light' | 'heavy') {
    me.move = m; me.set(act); me.hitDone = false; me.stepped = false; me.attackId++; me.queued = false;
    if (act === 'heavy') this.sound('charge', 0.4, 0.6);
  }

  private tryCast(me: Fighter, i: number, air = false) {
    const s = me.hero.spells[i];
    if (!s || me.cds[i] > 0 || me.mana < s.mana) return false;
    if (air && i === 2 && me.hero.id === 'knight') return false;
    me.casting = i; me.set('cast'); me.vx *= 0.3;
    if (s.cast > 0.2) this.sound('rune', 0.4);
    return true;
  }

  /** Бойцы не проходят друг сквозь друга (кроме кувырка и теневого шага). */
  private separate() {
    const [a, b] = this.f;
    if (a.act === 'ko' || b.act === 'ko') return;
    const passA = a.act === 'dodge' || (a.act === 'dash' && a.dash?.through);
    const passB = b.act === 'dodge' || (b.act === 'dash' && b.dash?.through);
    if (passA || passB) return;
    if (Math.abs(a.y - b.y) > 110) return;
    const d = b.x - a.x, min = 56;
    if (Math.abs(d) < min) {
      const push = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
      a.x -= push; b.x += push;
      for (const f of this.f) f.x = Math.max(LEFT, Math.min(RIGHT, f.x));
    }
  }

  /** Хитбокс удара против «тела» врага. */
  private checkMelee(me: Fighter) {
    const foe = this.foeOf(me);
    if (me.hitDone || foe.act === 'ko') return;
    if (me.act === 'dash' && me.dash) {
      if (Math.abs(foe.x - me.x) < 60 && Math.abs(foe.y - me.y) < 100 && (foe.invuln <= 0 || me.dash.through)) {
        me.hitDone = true;
        const d = me.dash;
        this.hit(me, foe, { dmg: d.dmg, kb: d.kb, hitstun: d.hitstun, guard: d.guard, range: 0, startup: 0, active: 0, recovery: 0 }, d.unblockable, d.through ? -me.facing : me.facing);
      }
      return;
    }
    if ((me.act !== 'light' && me.act !== 'heavy') || me.phase !== 1 || !me.move) return;
    const dx = (foe.x - me.x) * me.facing;
    if (dx < -10 || dx > me.move.range || Math.abs(foe.y - me.y) > 105) return;
    if (foe.invuln > 0) return;
    me.hitDone = true;
    this.hit(me, foe, me.move, false, me.facing);
  }

  private hit(me: Fighter, foe: Fighter, m: Move, unblockable: boolean, dir: number) {
    const pw = me.hero.power * (me.buff > 0 ? 1.35 : 1);
    const hx = (me.x + foe.x) / 2, hy = foe.y - 80;
    const facingAttacker = (me.x - foe.x) * foe.facing > 0 || Math.abs(me.x - foe.x) < 8;
    if (foe.act === 'block' && facingAttacker && !unblockable) {
      if (this.time - foe.blockAt < 0.16) return this.parry(foe, me, hx, hy);
      foe.stamina -= m.guard;
      if (foe.stamina <= 0 || m.crush) {
        foe.stamina = 0; foe.set('stun'); foe.stunFor = 1.1; foe.vx = dir * 200;
        this.damage(foe, m.dmg * pw * 0.5, me);
        this.text(foe.x, foe.y - 150, 'Блок пробит!', '#ffb347');
        this.sound('explode', 0.6, 1.3); this.burst(hx, hy, '#ffd27a', 18, 380); this.shake = 10; this.hitstop = 0.1;
      } else {
        this.damage(foe, m.dmg * pw * 0.12, me);
        foe.vx = dir * m.kb * 0.5; foe.x += dir * 4;
        this.sound('clank', 0.8); this.burst(hx, hy, '#cfe6ff', 8, 260); this.hitstop = 0.04; this.shake = 2;
      }
      foe.mana = Math.min(100, foe.mana + 2);
      return;
    }
    // чистое попадание
    let dmg = m.dmg * pw;
    if (foe.act === 'cast' || (foe.act === 'heavy' && foe.phase === 0)) { dmg *= 1.25; this.text(hx, hy - 40, 'Прервал!', '#ffffff'); foe.casting = -1; }
    this.damage(foe, dmg, me);
    if (me.venom > 0) foe.poison = 4;
    me.mana = Math.min(100, me.mana + 4); foe.mana = Math.min(100, foe.mana + 3);
    const armored = foe.buff > 0 && foe.act !== 'cast';
    if (foe.hp > 0 && !armored) {
      foe.set('hurt'); foe.stunFor = m.hitstun; foe.move = null; foe.queued = false; foe.dash = null; foe.casting = -1;
      foe.vx = dir * m.kb;
      if (!foe.grounded || m.kb > 400) { foe.vy = Math.min(foe.vy, -260); }
    }
    foe.flash = 0.12;
    const big = m.dmg >= 10;
    this.sound(big ? 'slice' : 'hit', big ? 1 : 0.8);
    this.burst(hx, hy, big ? '#ff6b5a' : '#ffe08a', big ? 16 : 9, big ? 420 : 300);
    this.hitstop = big ? 0.09 : 0.05; this.shake = big ? 9 : 4;
    this.text(foe.x + (Math.random() - 0.5) * 30, foe.y - 140, String(Math.round(dmg)), big ? '#ff7a6b' : '#fff1c2');
    this.onEvent('hit');
  }

  private parry(def: Fighter, att: Fighter, x: number, y: number) {
    att.set('stun'); att.stunFor = 0.85; att.move = null; att.dash = null; att.vx = -att.facing * 180;
    def.mana = Math.min(100, def.mana + 18); def.stamina = Math.min(100, def.stamina + 25);
    def.set('idle');
    this.text(x, y - 50, 'Парирование!', '#7fe7ff');
    this.sound('clank', 1, 1.5); this.sound('bell', 0.35);
    this.burst(x, y, '#9ff0ff', 26, 480); this.ring(x, y, '#9ff0ff', 70);
    this.hitstop = 0.16; this.shake = 6;
    this.onEvent('parry');
  }

  damage(f: Fighter, dmg: number, by: Fighter | null) {
    if (f.act === 'ko' || this.phase !== 'fight') return;
    f.hp = Math.max(0, f.hp - dmg);
    if (f.hp <= 0) {
      f.set('ko'); f.vx = (by ? (f.x > by.x ? 1 : -1) : -f.facing) * 420; f.vy = -420; f.y -= 1;
      f.move = null; f.dash = null; f.poison = 0;
      this.sound('explode', 0.8, 0.8); this.shake = 14; this.hitstop = 0.18;
      this.endRound(f);
    }
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      s.x += s.vx * dt; s.life -= dt;
      if (s.kind === 'fire' && Math.random() < 0.8) this.spark(s.x - Math.sign(s.vx) * 10, s.y + (Math.random() - 0.5) * 14, Math.random() < 0.5 ? '#ff8a3d' : '#ffd36b', -s.vx * 0.1, -40, 0.35, 3 + Math.random() * 3, -100);
      const foe = this.foeOf(s.owner);
      if (s.life > 0 && foe.act !== 'ko' && foe.invuln <= 0 && Math.abs(foe.x - s.x) < 24 + s.r && s.y > foe.y - 135 && s.y < foe.y + 5) {
        s.life = 0;
        const facing = (s.owner.x - foe.x) * foe.facing > 0 || Math.sign(-s.vx) === foe.facing;
        if (foe.act === 'block' && facing) {
          if (this.time - foe.blockAt < 0.16) {
            // парирование снаряда — отражаем
            this.shots.push({ ...s, vx: -s.vx * 1.1, owner: foe, life: 2 });
            this.text(foe.x, foe.y - 150, 'Отражено!', '#7fe7ff'); this.sound('clank', 1, 1.4);
            foe.mana = Math.min(100, foe.mana + 10);
          } else {
            foe.stamina -= s.kind === 'fire' ? 16 : 8; this.damage(foe, s.dmg * 0.2, s.owner); this.sound('clank', 0.6);
            foe.vx = Math.sign(s.vx) * 120;
            this.burst(s.x, s.y, '#cfe6ff', 6, 200);
          }
          continue;
        }
        const dmg = s.dmg * (s.owner.buff > 0 ? 1.35 : 1);
        this.damage(foe, dmg, s.owner);
        if (s.owner.venom > 0) foe.poison = 4;
        s.owner.mana = Math.min(100, s.owner.mana + 2);
        if (foe.hp > 0 && foe.buff <= 0) { foe.set('hurt'); foe.stunFor = s.kind === 'fire' ? 0.45 : 0.22; foe.casting = -1; foe.move = null; foe.vx = Math.sign(s.vx) * (s.kind === 'fire' ? 320 : 160); }
        foe.flash = 0.12;
        this.burst(s.x, s.y, s.kind === 'fire' ? '#ff8a3d' : '#e0e0e0', 14, 320);
        this.sound(s.kind === 'fire' ? 'explode' : 'hit', 0.6, 1.2); this.shake = 5; this.hitstop = 0.05;
        this.text(foe.x, foe.y - 140, String(Math.round(dmg)), '#ffb36b');
      }
    }
    // снаряды гасят друг друга
    for (let i = 0; i < this.shots.length; i++) for (let j = i + 1; j < this.shots.length; j++) {
      const a = this.shots[i], b = this.shots[j];
      if (a.life > 0 && b.life > 0 && a.owner !== b.owner && Math.abs(a.x - b.x) < a.r + b.r && Math.abs(a.y - b.y) < a.r + b.r) {
        a.life = b.life = 0; this.burst((a.x + b.x) / 2, a.y, '#ffffff', 14, 300); this.sound('pop', 0.8);
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0 && s.x > -50 && s.x < W + 50);
  }

  private updateStrikes(dt: number) {
    for (const s of this.strikes) {
      s.t -= dt;
      if (s.t <= 0 && !s.hit) {
        s.hit = true; s.flash = 0.3;
        this.sound('zap', 1, 0.6); this.sound('explode', 0.5, 1.5); this.shake = 8;
        this.burst(s.x, GROUND - 10, '#bfe3ff', 20, 380);
        const foe = this.foeOf(s.owner);
        if (Math.abs(foe.x - s.x) < 46 && foe.invuln <= 0 && foe.act !== 'ko') {
          this.damage(foe, s.dmg, s.owner);
          if (foe.hp > 0 && foe.buff <= 0) { foe.set('hurt'); foe.stunFor = 0.5; foe.casting = -1; foe.move = null; foe.vy = -300; foe.y -= 1; }
          foe.flash = 0.15;
          this.text(foe.x, foe.y - 140, String(s.dmg), '#bfe3ff');
          this.hitstop = 0.08;
        }
      }
      if (s.flash) s.flash -= dt;
    }
    this.strikes = this.strikes.filter((s) => !s.hit || (s.flash ?? 0) > 0);
  }

  private updateFx(dt: number) {
    for (const p of this.parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    for (const t of this.texts) { t.life -= dt; t.y -= 50 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }
}
