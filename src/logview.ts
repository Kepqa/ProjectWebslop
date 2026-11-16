import { clearRuns, exportRuns, loadRuns, summarize, type RunRecord } from './runlog';
import { byId } from './upgrades';

/** Экран «Журнал»: сводка по забегам, причины смерти, статистика карточек, последние забеги, копирование JSON. */
const $ = (id: string) => document.getElementById(id)!;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const mmss = (t: number) => { const s = Math.round(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Чем убили героя: типы зомби и прочие источники урона. */
const CAUSE: Record<string, string> = {
  walker: 'ходок', runner: 'бегун', spitter: 'плевун', charger: 'таран', brute: 'толстяк', jumper: 'прыгун', bomber: 'подрывник',
  shield: 'щитоносец', ghost: 'призрак', dog: 'пёс', boar: 'кабан', colossus: 'Колосс', brood: 'Матка Роя', leaper: 'Скакун-Титан', necro: 'Некромант',
  acid: 'кислота', orb: 'сфера босса', bomb: 'взрыв подрывника', barrel: 'бочка', toxic: 'лужа',
};
const cause = (k: string) => CAUSE[k] ?? k;
const OUTCOME: Record<string, string> = { win: '🏆', death: '☠', quit: '↩', abandoned: '↩' };

function when(ms: number) {
  return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fingerShare(r: RunRecord) {
  const k = r.killsBy;
  return r.kills > 0 ? (k.blade + k.trail) / r.kills : 0;
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  $('log-copy').addEventListener('click', () => void copy());
  $('log-clear').addEventListener('click', () => {
    if (!confirm('Очистить журнал забегов на этом устройстве?')) return;
    clearRuns();
    renderLog();
  });
}

async function copy() {
  const text = exportRuns();
  const note = $('log-note'), ta = $('log-text') as HTMLTextAreaElement;
  try {
    await navigator.clipboard.writeText(text);
    ta.classList.add('hidden');
    note.textContent = 'Скопировано ✓';
  } catch {
    // нет доступа к буферу (http, старый Safari): показываем текст — выделить и скопировать вручную
    ta.value = text;
    ta.classList.remove('hidden');
    ta.focus(); ta.select();
    note.textContent = 'Выделите текст и скопируйте';
  }
}

export function renderLog() {
  wire();
  $('log-note').textContent = '';
  $('log-text').classList.add('hidden');
  const all = loadRuns();
  const s = summarize(all);
  const stat = (v: string, l: string) => `<div class="logstat"><b>${v}</b><span>${l}</span></div>`;

  if (!s.runs) {
    $('log-sum').innerHTML = `<div class="log-empty">Пока пусто — сыграйте забег, он появится здесь.${s.devHidden ? `<br>Забегов в режиме разработчика: ${s.devHidden} (в сводку не входят).` : ''}</div>`;
    for (const id of ['log-deaths', 'log-items', 'log-runs']) $(id).innerHTML = '';
    return;
  }

  $('log-sum').innerHTML = [
    stat(String(s.runs), `забегов · побед ${s.wins}, смертей ${s.deaths}, выходов ${s.quits}`),
    stat(mmss(s.avgTime), `среднее время · ур. ${num(s.avgLevel)}`),
    stat(pct(s.finger), 'убийств пальцем (росчерк и его эффекты)'),
    stat(pct(s.auto), 'убийств автоматикой (кадило, кости…)'),
    stat(num(s.swipesPerMin), `свайпов в минуту · режут ${pct(s.cutRatio)}`),
    stat(num(s.multi3PerMin), 'свайпов с 3+ убийствами в минуту'),
    stat(pct(s.bluntedRatio), 'свайпов упёрлись в предел длины'),
    stat(num(s.loopsPerMin), `петель в минуту · с добычей ${pct(s.loopHitRatio)}`),
    stat(pct(s.loopGemShare), 'опыта собрано петлёй'),
  ].join('');

  $('log-deaths').innerHTML = s.deathBy.length
    ? `<div class="log-line"><b>Чем убивают:</b> ${s.deathBy.slice(0, 5).map(([k, n]) => `${esc(cause(k))} ×${n}`).join(' · ')}</div>`
    : '';

  $('log-items').innerHTML = s.items.length
    ? `<table class="log-table"><tr><th>Карточка</th><th>показана</th><th>взята</th><th>%</th></tr>${s.items.map((it) => {
      const u = byId(it.id);
      return `<tr><td>${u ? `${u.icon} ${esc(u.name)}` : esc(it.id)}</td><td>${it.shown}</td><td>${it.picked}</td><td>${pct(it.picked / it.shown)}</td></tr>`;
    }).join('')}</table>`
    : '<div class="log-empty">Выбора карточек ещё не было.</div>';

  const last = all.filter((r) => !r.dev && r.outcome !== 'running').slice(-10).reverse();
  $('log-runs').innerHTML = `<table class="log-table"><tr><th>Когда</th><th></th><th>время</th><th>ур.</th><th>убито</th><th>палец</th></tr>${last.map((r) =>
    `<tr><td>${when(r.at)}</td><td>${OUTCOME[r.outcome] ?? ''}</td><td>${mmss(r.time)}</td><td>${r.level}</td><td>${r.kills}</td><td>${pct(fingerShare(r))}</td></tr>`).join('')}</table>`
    + (s.devHidden ? `<div class="log-empty">Забегов в режиме разработчика: ${s.devHidden} (не входят в сводку).</div>` : '');
}
