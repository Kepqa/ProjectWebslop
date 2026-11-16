/**
 * Журнал забегов: что на самом деле происходит в игре, а не что кажется.
 * Хранится только на устройстве (localStorage) и никуда не отправляется; смотреть и копировать — меню «Журнал».
 * Нужен, чтобы проверять дизайн цифрами: доля убийств «пальцем» и автоматикой, сколько свайпов режет,
 * где умирают, какие карточки берут и какие игнорируют.
 */
import { VERSION } from './version';
import { isDev } from './stats';
import { settings } from './settings';

/**
 * Кто убил зомби:
 *  blade — сам клинок; trail — производные росчерка, петли и комбо (молния, взрыв серии, копьё, мина, бочка, падение в пропасть…);
 *  auto — автономные предметы (кадило, кости, граната, тотем, жнец…); world — остальное (самоподрыв, взрыв подрывника).
 */
export type KillSrc = 'blade' | 'trail' | 'auto' | 'world';
export type Outcome = 'death' | 'win' | 'quit' | 'abandoned';
export type Via = 'card' | 'chest' | 'dev';

/** Одна выдача карточек: ids — из чего выбирали, rej — что показали и сменили «реролом». */
export interface Offer { t: number; lv: number; ids: string[]; rej: string[]; pick: string; rr: number }
export interface Gain { t: number; lv: number; id: string; n: number; via: Via }

export interface RunRecord {
  v: 1;
  id: string;
  /** начало забега, мс (Date.now) */
  at: number;
  ver: string;
  mode: 'survival' | 'story';
  stage: number;
  chapter: number;
  coop: boolean;
  /** забег в режиме разработчика — в сводку не берём */
  dev: boolean;
  /** длина уровня, с (0 — без ограничения) */
  len: number;
  blade: string;
  env: { touch: boolean; w: number; h: number; dpr: number; lefty: boolean };
  outcome: Outcome | 'running';
  time: number; wave: number; level: number; kills: number; score: number; combo: number; bosses: number; falls: number;
  killsBy: Record<KillSrc, number>;
  /** n — свайпов (палец двигался); cut — из них резали; blunted — упёрлись в предел длины;
   *  multi3 — свайпов с 3+ убийствами; best — рекорд убийств за свайп; lenAvg — средняя длина реза, px */
  swipes: { n: number; cut: number; blunted: number; multi3: number; best: number; lenAvg: number };
  /** n — замкнутых петель; hit — из них с добычей внутри; gems — кристаллов собрано петлёй */
  loops: { n: number; hit: number; gems: number };
  /** обычные кристаллы опыта: подобраны после петли / просто подойдя */
  gems: { loop: number; walk: number };
  /** hits — ударов по герою; dmg — урон по источникам (тип зомби, acid, bomb, barrel, toxic…) */
  hurt: { hits: number; dmg: Record<string, number> };
  death: { by: string; t: number } | null;
  rerolls: number; skips: number;
  offers: Offer[];
  gains: Gain[];
  /** срез каждые 30 с: [секунда, убийств, уровень, HP, зомби на поле, fps] */
  tl: number[][];
}

export interface Snap { time: number; wave: number; level: number; kills: number; score: number; combo: number; bosses: number; falls: number }

const KEY = 'ss_runlog';
const MAX_RUNS = 50;

export function loadRuns(): RunRecord[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? (a as RunRecord[]).filter((r) => r && r.v === 1) : [];
  } catch { return []; }
}

function store(runs: RunRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(runs)); return; } catch { /* квота — режем старые */ }
  try { localStorage.setItem(KEY, JSON.stringify(runs.slice(-Math.floor(MAX_RUNS / 2)))); } catch { /* журнал не критичен */ }
}

/** Записывает забег; повторная запись с тем же id заменяет прежнюю (черновик при закрытии вкладки → итог). */
export function upsertRun(rec: RunRecord) {
  const runs = loadRuns();
  const i = runs.findIndex((r) => r.id === rec.id);
  if (i >= 0) runs[i] = rec; else runs.push(rec);
  while (runs.length > MAX_RUNS) runs.shift();
  store(runs);
}

export function clearRuns() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Всё, что в журнале, одним JSON — чтобы скопировать и показать. */
export function exportRuns(): string {
  return JSON.stringify({ app: 'swipe-survivors', ver: VERSION, exportedAt: new Date().toISOString(), runs: loadRuns() });
}

export class RunLog {
  readonly rec: RunRecord;
  private lenSum = 0;
  private lastHurt = '';
  private rerolled = false;

  constructor(init: { mode: 'survival' | 'story'; stage: number; chapter: number; coop: boolean; blade: string; len: number }) {
    const now = Date.now();
    this.rec = {
      v: 1, id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: now, ver: VERSION,
      mode: init.mode, stage: init.stage, chapter: init.chapter, coop: init.coop, dev: isDev(),
      len: Number.isFinite(init.len) ? Math.round(init.len) : 0, blade: init.blade,
      env: {
        touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1, lefty: settings.lefty,
      },
      outcome: 'running',
      time: 0, wave: 0, level: 1, kills: 0, score: 0, combo: 0, bosses: 0, falls: 0,
      killsBy: { blade: 0, trail: 0, auto: 0, world: 0 },
      swipes: { n: 0, cut: 0, blunted: 0, multi3: 0, best: 0, lenAvg: 0 },
      loops: { n: 0, hit: 0, gems: 0 },
      gems: { loop: 0, walk: 0 },
      hurt: { hits: 0, dmg: {} },
      death: null,
      rerolls: 0, skips: 0, offers: [], gains: [], tl: [],
    };
  }

  kill(src: KillSrc) { this.rec.killsBy[src]++; }

  /** Закончился свайп героя. cut — клинок хоть что-то резал; blunted — клинок затупился; len — длина реза, px. */
  swipe(cut: boolean, kills: number, len: number, blunted: boolean) {
    const s = this.rec.swipes;
    s.n++;
    if (blunted) s.blunted++;
    if (!cut) return;
    s.cut++;
    this.lenSum += len;
    if (kills >= 3) s.multi3++;
    if (kills > s.best) s.best = kills;
  }

  loop(got: number) {
    const l = this.rec.loops;
    l.n++;
    if (got > 0) { l.hit++; l.gems += got; }
  }

  /** Обычный кристалл опыта подобран; viaLoop — его притянула петля. */
  gem(viaLoop: boolean) { this.rec.gems[viaLoop ? 'loop' : 'walk']++; }

  /** hit=false — непрерывный урон (лужа): копим урон, но «ударом» не считаем. */
  hurt(by: string, amount: number, hit = true) {
    const h = this.rec.hurt;
    if (hit) h.hits++;
    h.dmg[by] = Math.round(((h.dmg[by] ?? 0) + amount) * 10) / 10;
    this.lastHurt = by;
  }

  offer(t: number, lv: number, ids: string[]) {
    const last = this.rec.offers[this.rec.offers.length - 1];
    if (this.rerolled && last) { last.rej.push(...last.ids); last.ids = ids; last.rr++; this.rerolled = false; }
    else this.rec.offers.push({ t: Math.floor(t), lv, ids, rej: [], pick: '', rr: 0 });
  }

  reroll() { this.rerolled = true; this.rec.rerolls++; }

  /** Выбор в последней выдаче; '__skip' — «Пропустить». */
  pick(id: string) {
    const last = this.rec.offers[this.rec.offers.length - 1];
    if (last) last.pick = id === '__skip' ? 'skip' : id;
    if (id === '__skip') this.rec.skips++;
  }

  /** Предмет получен (карточка, сундук или режим разработчика); n — новый уровень предмета. */
  gain(t: number, lv: number, id: string, n: number, via: Via) {
    this.rec.gains.push({ t: Math.floor(t), lv, id, n, via });
  }

  sample(row: number[]) { this.rec.tl.push(row); }

  /** Пишет забег в хранилище. Вызывать можно много раз — запись обновляется. */
  save(outcome: Outcome, s: Snap) {
    const r = this.rec;
    // случайный запуск и сразу выход — шум
    if ((outcome === 'quit' || outcome === 'abandoned') && s.time < 5) return;
    r.outcome = outcome;
    r.time = s.time; r.wave = s.wave; r.level = s.level; r.kills = s.kills; r.score = s.score;
    r.combo = s.combo; r.bosses = s.bosses; r.falls = s.falls;
    r.swipes.lenAvg = r.swipes.cut ? Math.round(this.lenSum / r.swipes.cut) : 0;
    r.dev = r.dev || isDev();
    r.death = outcome === 'death' ? { by: this.lastHurt || '?', t: s.time } : null;
    upsertRun(r);
  }
}

// ---------- Сводка для экрана «Журнал» ----------

export interface Summary {
  runs: number; wins: number; deaths: number; quits: number; devHidden: number;
  avgTime: number; avgLevel: number;
  /** доли убийств: палец (клинок + производные), автоматика, прочее */
  finger: number; auto: number; world: number;
  swipesPerMin: number; cutRatio: number; multi3PerMin: number; bluntedRatio: number;
  loopsPerMin: number; loopHitRatio: number; loopGemShare: number;
  deathBy: [string, number][];
  items: { id: string; shown: number; picked: number }[];
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Сводка по забегам. Режим разработчика и незавершённые записи в неё не входят. */
export function summarize(all: RunRecord[]): Summary {
  const runs = all.filter((r) => !r.dev && r.outcome !== 'running');
  const sec = sum(runs.map((r) => r.time));
  const kills = sum(runs.map((r) => r.kills));
  const by = (k: 'blade' | 'trail' | 'auto' | 'world') => sum(runs.map((r) => r.killsBy[k]));
  const sw = (k: 'n' | 'cut' | 'blunted' | 'multi3') => sum(runs.map((r) => r.swipes[k]));
  const lp = (k: 'n' | 'hit') => sum(runs.map((r) => r.loops[k]));
  const gl = sum(runs.map((r) => r.gems.loop)), gw = sum(runs.map((r) => r.gems.walk));
  const deathBy = new Map<string, number>();
  const items = new Map<string, { id: string; shown: number; picked: number }>();
  for (const r of runs) {
    if (r.death) deathBy.set(r.death.by, (deathBy.get(r.death.by) ?? 0) + 1);
    for (const o of r.offers) {
      for (const id of [...o.ids, ...o.rej]) {
        const it = items.get(id) ?? { id, shown: 0, picked: 0 };
        it.shown++;
        if (o.pick === id) it.picked++;
        items.set(id, it);
      }
    }
  }
  const perMin = (n: number) => ratio(n * 60, sec);
  return {
    runs: runs.length, wins: runs.filter((r) => r.outcome === 'win').length, deaths: runs.filter((r) => r.outcome === 'death').length,
    quits: runs.filter((r) => r.outcome === 'quit' || r.outcome === 'abandoned').length, devHidden: all.filter((r) => r.dev).length,
    avgTime: ratio(sec, runs.length), avgLevel: ratio(sum(runs.map((r) => r.level)), runs.length),
    finger: ratio(by('blade') + by('trail'), kills), auto: ratio(by('auto'), kills), world: ratio(by('world'), kills),
    swipesPerMin: perMin(sw('n')), cutRatio: ratio(sw('cut'), sw('n')), multi3PerMin: perMin(sw('multi3')), bluntedRatio: ratio(sw('blunted'), sw('n')),
    loopsPerMin: perMin(lp('n')), loopHitRatio: ratio(lp('hit'), lp('n')), loopGemShare: ratio(gl, gl + gw),
    deathBy: [...deathBy.entries()].sort((a, b) => b[1] - a[1]),
    items: [...items.values()].sort((a, b) => b.shown - a.shown),
  };
}
