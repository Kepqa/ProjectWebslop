/**
 * Графика для справки «Дуэли» — строится из тех же данных, что и бой, поэтому не расходится с балансом.
 *  - counterDiagram: что чем бьётся (схема-механизм, inline SVG);
 *  - frameChart: тайминги ударов — замах / удар / возврат в миллисекундах (stacked bar, общая шкала).
 */
import { AIR, HEAVY, HEROES, LIGHTS, type Move } from './game';

// ---------- схема «что чем бьётся» ----------
interface Node { id: string; label: string; x: number; y: number; hot?: boolean }
const NW = 128, NH = 36;

export function counterDiagram(): string {
  const nodes: Node[] = [
    { id: 'light', label: 'Удар', x: 320, y: 46, hot: true },
    { id: 'heavy', label: 'Сильный удар', x: 470, y: 222, hot: true },
    { id: 'block', label: 'Блок', x: 170, y: 222, hot: true },
    { id: 'cast', label: 'Заклинание', x: 560, y: 46 },
    { id: 'parry', label: 'Парирование', x: 80, y: 46 },
    { id: 'dodge', label: 'Кувырок', x: 600, y: 120 },
  ];
  const by = (id: string) => nodes.find((n) => n.id === id)!;
  // [откуда, куда, подпись, где подпись относительно середины стрелки]
  type Place = 'above' | 'below' | 'left' | 'right';
  const edges: [string, string, string, Place][] = [
    ['light', 'heavy', 'прерывает замах', 'right'],
    ['heavy', 'block', 'пробивает', 'below'],
    ['block', 'light', 'гасит урон', 'left'],
    ['light', 'cast', 'сбивает', 'above'],
    ['parry', 'light', 'оглушает', 'above'],
    ['dodge', 'heavy', 'уходит из-под', 'right'],
  ];
  const PLACE: Record<Place, [number, number, string]> = { above: [0, -10, 'middle'], below: [0, 20, 'middle'], left: [-14, 4, 'end'], right: [14, 4, 'start'] };
  const trim = (from: Node, to: Node) => {
    // точка на границе прямоугольника узла по направлению к другому узлу
    const dx = to.x - from.x, dy = to.y - from.y;
    const k = Math.min((NW / 2 + 6) / Math.abs(dx || 1e-6), (NH / 2 + 6) / Math.abs(dy || 1e-6));
    return { x: from.x + dx * k, y: from.y + dy * k };
  };
  const lines = edges.map(([a, b, label, place]) => {
    const A = by(a), B = by(b);
    const p = trim(A, B), q = trim(B, A);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const hot = A.hot && B.hot;
    const [ox, oy, anchor] = PLACE[place];
    return `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${hot ? '#ff9a5a' : 'currentColor'}" stroke-width="${hot ? 2.5 : 1.5}" marker-end="url(#${hot ? 'ah-hot' : 'ah'})"/>`
      + `<text x="${(mx + ox).toFixed(1)}" y="${(my + oy).toFixed(1)}" text-anchor="${anchor}" font-size="12" fill="currentColor">${label}</text>`;
  }).join('');
  const boxes = nodes.map((n) => `<rect x="${n.x - NW / 2}" y="${n.y - NH / 2}" width="${NW}" height="${NH}" rx="9" fill="${n.hot ? '#3a1d33' : '#241828'}" stroke="${n.hot ? '#ff9a5a' : 'currentColor'}" stroke-opacity="${n.hot ? 1 : 0.4}" stroke-width="1.5"/>`
    + `<text x="${n.x}" y="${n.y + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="#f4eaf2">${n.label}</text>`).join('');
  const claim = 'Удар прерывает замах сильного удара, сильный пробивает блок, блок гасит удар. Парирование оглушает атакующего, кувырок уводит из-под сильного удара, любой удар сбивает заклинание.';
  return `<figure class="fig">
  <svg viewBox="0 0 680 262" role="img" aria-label="${claim}" class="diagram">
    <defs>
      <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker>
      <marker id="ah-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ff9a5a"/></marker>
    </defs>
    ${lines}${boxes}
  </svg>
  <figcaption>Основной круг (оранжевый): удар → сильный → блок → удар. Каждое действие кого-то бьёт и кому-то проигрывает, поэтому нет одной кнопки, которая выигрывает всегда.</figcaption>
</figure>`;
}

// ---------- тайминги ударов ----------
interface Row { label: string; m: Move; k: number }
const PHASES = [
  { key: 'startup', name: 'Замах', note: 'удар ещё не опасен, его можно прервать', color: '#3987e5' },
  { key: 'active', name: 'Удар', note: 'клинок наносит урон', color: '#d95926' },
  { key: 'recovery', name: 'Возврат', note: 'боец открыт, его можно наказать', color: '#199e70' },
] as const;

export function frameChart(): string {
  const rogue = HEROES.find((h) => h.id === 'rogue')!;
  const rows: Row[] = [
    { label: 'Удар 1', m: LIGHTS[0], k: 1 },
    { label: 'Удар 2', m: LIGHTS[1], k: 1 },
    { label: 'Удар 3 (добивающий)', m: LIGHTS[2], k: 1 },
    { label: 'Удар 1 · Тень', m: LIGHTS[0], k: 1 / rogue.lightSpeed },
    { label: 'Удар в прыжке', m: AIR, k: 1 },
    { label: 'Сильный удар', m: HEAVY, k: 1 },
  ];
  const ms = (s: number) => Math.round(s * 1000);
  const L = 160, R = 56, W = 640, plotW = W - L - R;
  const max = 1000, ticks = [0, 200, 400, 600, 800, 1000];
  const rowH = 30, barH = 16, top = 22;
  const H = top + rows.length * rowH + 10;
  const x = (v: number) => L + (v / max) * plotW;
  const grid = ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 10}" stroke="#ffffff" stroke-opacity=".08"/>`
    + `<text x="${x(t)}" y="${top - 10}" text-anchor="middle" font-size="11" fill="#a998a6">${t}</text>`).join('');
  const bars = rows.map((r, i) => {
    const y = top + i * rowH + (rowH - barH) / 2;
    let acc = 0; const segs: string[] = [];
    PHASES.forEach((ph, j) => {
      const v = ms(r.m[ph.key] * r.k);
      const x0 = x(acc) + (j > 0 ? 1 : 0), x1 = x(acc + v) - (j < 2 ? 1 : 0); // 2px зазор между сегментами
      const w = Math.max(1, x1 - x0);
      const tip = `${r.label} · ${ph.name}: ${v} мс`;
      if (j === 2) {
        // конец полосы скруглён на 4px, начало у оси — прямое
        const rr = Math.min(4, w);
        segs.push(`<path class="seg" data-tip="${tip}" fill="${ph.color}" d="M${x0} ${y}H${x0 + w - rr}Q${x0 + w} ${y} ${x0 + w} ${y + rr}V${y + barH - rr}Q${x0 + w} ${y + barH} ${x0 + w - rr} ${y + barH}H${x0}Z"/>`);
      } else segs.push(`<rect class="seg" data-tip="${tip}" x="${x0}" y="${y}" width="${w}" height="${barH}" fill="${ph.color}"/>`);
      acc += v;
    });
    return `<text x="${L - 10}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="12" fill="#f4eaf2">${r.label}</text>${segs.join('')}`
      + `<text x="${x(acc) + 6}" y="${y + barH / 2 + 4}" font-size="11" fill="#cdb8c9" class="num">${acc} мс</text>`;
  }).join('');
  const legend = PHASES.map((p) => `<span class="lg"><i style="background:${p.color}"></i><b>${p.name}</b> — ${p.note}</span>`).join('');
  const table = `<table class="ftable"><tr><th>Приём</th>${PHASES.map((p) => `<th>${p.name}, мс</th>`).join('')}<th>Урон</th></tr>${rows.map((r) => `<tr><td>${r.label}</td>${PHASES.map((p) => `<td class="num">${ms(r.m[p.key] * r.k)}</td>`).join('')}<td class="num">${r.m.dmg}</td></tr>`).join('')}</table>`;
  return `<figure class="fig">
  <div class="legend">${legend}</div>
  <div class="chartbox">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Тайминги ударов в миллисекундах: замах, удар и возврат. Сильный удар самый долгий, его замах ${ms(HEAVY.startup)} мс." class="frames">${grid}${bars}</svg>
    <div class="ttip" hidden></div>
  </div>
  <figcaption>Время в миллисекундах. Блок для парирования нужно поставить не раньше чем за 160 мс до удара. Длинный зелёный хвост сильного удара — окно, чтобы ответить.</figcaption>
  <details class="tview"><summary>Таблицей</summary>${table}</details>
</figure>`;
}

/** Подсказка при наведении/касании на сегмент графика. */
export function wireChart(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>('.chartbox');
  const tip = root.querySelector<HTMLElement>('.ttip');
  if (!box || !tip) return;
  const show = (e: PointerEvent) => {
    const seg = (e.target as Element).closest<SVGElement>('.seg');
    for (const s of box.querySelectorAll('.seg')) s.classList.toggle('dim', !!seg && s !== seg);
    if (!seg) { tip.hidden = true; return; }
    const r = box.getBoundingClientRect();
    tip.textContent = seg.dataset.tip ?? '';
    tip.hidden = false;
    const tx = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, e.clientX - r.left + 12));
    tip.style.transform = `translate(${tx}px, ${e.clientY - r.top - 36}px)`;
  };
  box.addEventListener('pointermove', show);
  box.addEventListener('pointerdown', show);
  box.addEventListener('pointerleave', () => { tip.hidden = true; for (const s of box.querySelectorAll('.seg')) s.classList.remove('dim'); });
}
