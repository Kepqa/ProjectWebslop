/**
 * Звуки Slicing Through — готовые записи из наборов Kenney «RPG Audio» и «Impact Sounds» (CC0, kenney.nl),
 * переведены в mp3. Играются через WebAudio: высота тона и громкость на каждый вызов, лимит голосов на звук.
 */
const files = import.meta.glob('./sfx/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urls: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) urls[path.slice(6, -4)] = url;

/** Имя → варианты файлов (берётся случайный). */
const SOUNDS = {
  dash: ['dash1', 'dash2', 'dash3'], cut: ['cut1', 'cut2', 'cut3'], multi: ['multi'], hurt: ['hurt'],
  bounce: ['bounce'], parry: ['parry'], bow: ['bow'], boom: ['boom'], gong: ['gong'],
} as const;
export type Snd = keyof typeof SOUNDS;

let ctx: AudioContext | null = null;
let out: GainNode;
const buffers: Record<string, AudioBuffer> = {};
const lastAt: Partial<Record<Snd, number>> = {};

/** Вызывать из обработчика касания: iOS разрешает звук только внутри жеста. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    out = ctx.createGain(); out.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp).connect(ctx.destination);
    for (const [name, url] of Object.entries(urls)) {
      fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).then((buf) => { buffers[name] = buf; }).catch(() => undefined);
    }
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
}

/** Не чаще одного раза в 35 мс на звук, чтобы серия убийств не превращалась в кашу. */
export function play(name: Snd, vol = 1, pitch = 1) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (t - (lastAt[name] ?? -1) < 0.035) return;
  const pick = SOUNDS[name][Math.floor(Math.random() * SOUNDS[name].length)];
  const buf = buffers[pick];
  if (!buf) return;
  lastAt[name] = t;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch * (0.96 + Math.random() * 0.08);
  const gn = ctx.createGain(); gn.gain.value = vol;
  src.connect(gn).connect(out);
  src.start();
}
