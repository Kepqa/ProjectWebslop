/**
 * Бот для дуэли. Видит мир с задержкой реакции: на замах врага решает — блок, кувырок или
 * встречный удар — не мгновенно, а через `react` секунд. Сложность меняет реакцию, шанс блока,
 * агрессию и умение наказывать за промахи.
 */
import { type Cmd, type Fighter, type Game, GROUND, NOCMD } from './game';

export interface BotLevel { name: string; react: number; block: number; parry: number; aggro: number; punish: number; spells: number }

export const LEVELS: BotLevel[] = [
  { name: 'Новичок', react: 0.42, block: 0.25, parry: 0, aggro: 0.9, punish: 0.15, spells: 0.25 },
  { name: 'Боец', react: 0.24, block: 0.55, parry: 0.12, aggro: 1.5, punish: 0.5, spells: 0.6 },
  { name: 'Мастер', react: 0.13, block: 0.8, parry: 0.4, aggro: 2.3, punish: 0.9, spells: 1 },
];

export class Bot {
  private seen = -1;          // attackId врага, на который уже отреагировали
  private seenShots = new WeakSet<object>();
  private seenStrikes = new WeakSet<object>();
  private pending: { at: number; plan: Plan } | null = null;
  private plan: Plan = { kind: 'none', until: 0 };
  private nextThink = 0;
  private wantMove: -1 | 0 | 1 = 0;
  private moveUntil = 0;
  private comboLeft = 0;

  constructor(public me: Fighter, public lv: BotLevel) {}

  think(g: Game): Cmd {
    const me = this.me, foe = g.foeOf(me), now = g.time;
    if (g.phase !== 'fight' || me.act === 'ko') return NOCMD;
    const c: Cmd = { ...NOCMD };
    const dist = Math.abs(foe.x - me.x);
    const toFoe = (foe.x > me.x ? 1 : -1) as 1 | -1;

    // --- угрозы: замах врага, снаряды, молнии ---
    const threat = (foe.act === 'light' || foe.act === 'heavy') && foe.attackId !== this.seen && dist < (foe.move?.range ?? 90) + 60;
    const dashThreat = foe.act === 'dash' && foe.attackId !== this.seen && dist < 340;
    if ((threat || dashThreat) && !this.pending) {
      this.seen = foe.attackId;
      const r = Math.random();
      let plan: Plan;
      if (foe.act === 'heavy' && r < this.lv.block * 0.6) plan = { kind: 'dodge', dir: -toFoe as -1 | 1, until: 0 };
      else if (r < this.lv.block) plan = { kind: 'block', until: 0, parry: Math.random() < this.lv.parry };
      else plan = { kind: 'none', until: 0 };
      let at = now + this.lv.react * (0.7 + Math.random() * 0.6);
      // для парирования блок ставится впритык к удару
      if (plan.kind === 'block' && plan.parry && foe.move) at = Math.max(at, now + foe.move.startup - foe.t - 0.07);
      this.pending = { at, plan };
    }
    for (const s of g.shots) {
      if (s.owner === me || this.seenShots.has(s)) continue;
      const coming = Math.sign(s.vx) === Math.sign(me.x - s.x);
      if (!coming || Math.abs(s.x - me.x) > 380) continue;
      this.seenShots.add(s);
      if (this.pending) continue;
      const r = Math.random();
      const plan: Plan = r < this.lv.block * 0.5 ? { kind: 'jump', until: 0 } : r < this.lv.block ? { kind: 'block', until: 0, parry: Math.random() < this.lv.parry } : { kind: 'none', until: 0 };
      this.pending = { at: now + this.lv.react, plan };
    }
    for (const s of g.strikes) {
      if (s.owner === me || this.seenStrikes.has(s)) continue;
      this.seenStrikes.add(s);
      if (Math.random() < this.lv.block + 0.1) {
        const dir = (me.x < s.x ? -1 : 1) as -1 | 1;
        this.pending = { at: now + this.lv.react, plan: { kind: 'run', dir: me.x + dir * 120 < 60 || me.x + dir * 120 > 900 ? (-dir as -1 | 1) : dir, until: 0 } };
      }
    }
    if (this.pending && now >= this.pending.at) {
      this.plan = this.pending.plan; this.pending = null;
      this.plan.until = now + (this.plan.kind === 'block' ? 0.55 : this.plan.kind === 'run' ? 0.5 : 0.1);
      if (this.plan.kind === 'block' && this.plan.parry) this.plan.until = now + 0.25;
    }

    // --- исполняем план защиты ---
    if (this.plan.kind !== 'none' && now < this.plan.until) {
      switch (this.plan.kind) {
        case 'block': c.block = true; return c;
        case 'dodge': c.dodge = true; c.move = this.plan.dir; this.plan.until = 0; return c;
        case 'jump': c.jump = true; c.move = -toFoe as -1 | 1; this.plan.until = 0; return c;
        case 'run': c.move = this.plan.dir; return c;
      }
    }
    this.plan.kind = 'none';
    // держим блок, пока враг ещё бьёт
    if (me.act === 'block' && (foe.act === 'light' || foe.act === 'heavy') && foe.phase < 2 && Math.random() < this.lv.block) { c.block = true; return c; }

    // --- продолжение серии ---
    if (me.act === 'light' && this.comboLeft > 0) { c.light = true; if (me.queued) this.comboLeft--; return c; }

    // --- наказание за промах: враг в оглушении/возврате рядом ---
    const open = foe.act === 'stun' || ((foe.act === 'heavy' || foe.act === 'light') && foe.phase === 2) || foe.act === 'cast';
    if (open && dist < 95 && Math.random() < this.lv.punish) {
      if (foe.act === 'stun' && me.stamina > 30) c.heavy = true;
      else { c.light = true; this.comboLeft = 2; }
      return c;
    }

    if (now < this.nextThink) { c.move = this.wantMove; return c; }
    this.nextThink = now + 0.08 + Math.random() * 0.12;

    // --- заклинания ---
    if (Math.random() < this.lv.spells * 0.35) {
      const s = this.pickSpell(g, dist);
      if (s) { c.spell = s; return c; }
    }

    // --- дистанция ---
    const prefer = me.hero.prefer;
    const lowStam = me.stamina < 25;
    if (now > this.moveUntil) {
      if (lowStam && dist < 200) this.wantMove = -toFoe as -1 | 1;
      else if (dist > prefer + 40) this.wantMove = toFoe;
      else if (dist < prefer - 60 && prefer > 150) this.wantMove = -toFoe as -1 | 1;
      else this.wantMove = Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
      this.moveUntil = now + 0.15 + Math.random() * 0.3;
      // маг, зажатый в углу, прыгает через врага
      if (prefer > 150 && dist < 120 && (me.x < 120 || me.x > 840) && Math.random() < 0.5) { c.jump = true; c.move = toFoe; return c; }
    }
    c.move = this.wantMove;

    // --- атака ---
    if (dist < 95 && Math.random() < this.lv.aggro * 0.18) {
      if (foe.act === 'block' && me.stamina > 40 && Math.random() < 0.45) c.heavy = true;
      else if (Math.random() < 0.22 && me.stamina > 40) c.heavy = true;
      else { c.light = true; this.comboLeft = Math.random() < 0.6 ? 2 : Math.floor(Math.random() * 2); }
      c.move = 0;
    } else if (dist < 200 && Math.random() < 0.02 * this.lv.aggro) {
      c.jump = true; c.move = toFoe;
    }
    if (me.y < GROUND - 40 && dist < 110) c.light = true;
    return c;
  }

  private pickSpell(g: Game, dist: number): 0 | 1 | 2 | 3 {
    const me = this.me, foe = g.foeOf(me);
    const ok = (i: number) => me.cds[i] <= 0 && me.mana >= me.hero.spells[i].mana;
    switch (me.hero.id) {
      case 'knight':
        if (ok(2) && me.hp < me.maxHp * 0.55 && dist > 220) return 3;
        if (ok(1) && dist < 200 && me.mana > 60) return 2;
        if (ok(0) && dist > 120 && dist < 300) return 1;
        return 0;
      case 'mage':
        if (ok(2) && dist < 130 && Math.random() < 0.6) return 3;
        if (ok(1) && dist > 140 && Math.random() < 0.55) return 2;
        if (ok(0) && dist > 130) return 1;
        return 0;
      case 'rogue':
        if (ok(2) && dist < 260 && me.mana > 55) return 3;
        if (ok(1) && dist > 140 && dist < 380 && foe.act !== 'block') return 2;
        if (ok(0) && dist > 200) return 1;
        return 0;
    }
  }
}

type Plan =
  | { kind: 'none'; until: number }
  | { kind: 'block'; until: number; parry?: boolean }
  | { kind: 'dodge'; dir: -1 | 1; until: number }
  | { kind: 'jump'; until: number }
  | { kind: 'run'; dir: -1 | 1; until: number };
