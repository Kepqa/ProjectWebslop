// Плейтест в эмуляции телефона. См. SKILL.md рядом.
const { chromium, devices } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const page = arg('page', 'slicing');
const start = arg('start', '');
const out = arg('out', '.');
const device = arg('device', 'iPhone 13');
const drags = +arg('drags', 20);
const hold = +arg('hold', 120);
const wait = +arg('wait', 10);
const base = arg('url', 'http://localhost:4173/');

(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices[device] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

  await p.goto(base + (page ? `${page}/` : ''));
  await p.waitForTimeout(800);
  await shot('00-menu');
  if (start) {
    await p.click(start);
    await p.waitForTimeout(2500);
    await shot('01-start');
    const { width: w, height: h } = p.viewportSize();
    for (let i = 0; i < drags; i++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 60;
      const x0 = w / 2, y0 = h * 0.7;
      await p.mouse.move(x0, y0); await p.mouse.down();
      await p.mouse.move(x0 + Math.cos(a) * r, y0 + Math.sin(a) * r, { steps: 6 });
      await p.waitForTimeout(i === 0 ? 700 : hold);
      if (i === 0) await shot('02-aim');
      await p.mouse.up();
      await p.waitForTimeout(400);
    }
    await shot('03-after-drags');
    await p.waitForTimeout(wait * 1000);
    await shot('04-end');
  }
  const hub = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await hub.goto(base); await hub.waitForTimeout(1200);
  await hub.screenshot({ path: `${out}/hub.png` });
  console.log('SCREENSHOTS:', out);
  console.log('ERRORS:', JSON.stringify(errors));
  await b.close();
})();
