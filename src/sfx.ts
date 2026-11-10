/**
 * Процедурные звуки на WebAudio (без файлов).
 * Защита от перегруза при толпах:
 *  - у каждого звука минимальный интервал и лимит одновременных голосов;
 *  - громкость частых звуков падает с плотностью событий;
 *  - всё идёт через компрессор/лимитер.
 */
type Name =
  | 'swipe' | 'hit' | 'kill' | 'gem' | 'chest' | 'level' | 'hurt' | 'explode' | 'rune' | 'boss' | 'jump' | 'land'
  | 'crate' | 'spit' | 'clank' | 'fall' | 'win' | 'lose' | 'fuse' | 'slice' | 'zap' | 'throw' | 'bell';

interface Lim { gap: number; voices: number }

const LIMITS: Record<Name, Lim> = {
  swipe: { gap: 0.06, voices: 2 }, hit: { gap: 0.035, voices: 3 }, kill: { gap: 0.05, voices: 3 },
  gem: { gap: 0.045, voices: 2 }, chest: { gap: 0.3, voices: 1 }, level: { gap: 0.5, voices: 1 },
  hurt: { gap: 0.15, voices: 1 }, explode: { gap: 0.09, voices: 2 }, rune: { gap: 0.2, voices: 1 },
  boss: { gap: 1, voices: 1 }, jump: { gap: 0.12, voices: 2 }, land: { gap: 0.1, voices: 2 },
  crate: { gap: 0.06, voices: 2 }, spit: { gap: 0.15, voices: 2 }, clank: { gap: 0.06, voices: 2 },
  fall: { gap: 0.12, voices: 2 }, win: { gap: 1, voices: 1 }, lose: { gap: 1, voices: 1 },
  fuse: { gap: 0.2, voices: 2 }, slice: { gap: 0.05, voices: 2 }, zap: { gap: 0.06, voices: 2 },
  throw: { gap: 0.1, voices: 1 }, bell: { gap: 0.5, voices: 1 },
};

class Sfx {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<Name, number>();
  private voices = new Map<Name, number>();
  private recent = new Map<Name, number[]>();
  private gemPitch = 0; private gemAt = 0;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem('ss_muted') === '1'; } catch { /* приватный режим */ }
  }

  /** Вызывать из обработчика нажатия (iOS разрешает звук только после жеста). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 8;
      comp.attack.value = 0.003; comp.release.value = 0.15;
      this.out = ctx.createGain();
      this.out.gain.value = this.muted ? 0 : 0.55;
      this.out.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('ss_muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  play(name: Name, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const lim = LIMITS[name];
    if (t - (this.last.get(name) ?? -1) < lim.gap) return;
    if ((this.voices.get(name) ?? 0) >= lim.voices) return;
    // плотность событий за последние 0.4с приглушает частые звуки
    const arr = (this.recent.get(name) ?? []).filter((x) => t - x < 0.4);
    arr.push(t); this.recent.set(name, arr);
    const v = vol / Math.sqrt(1 + (arr.length - 1) * 0.6);
    this.last.set(name, t);
    this.voices.set(name, (this.voices.get(name) ?? 0) + 1);
    const done = () => this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1));
    const dur = this.synth(name, t, v);
    setTimeout(done, dur * 1000 + 30);
  }

  private env(t: number, a: number, d: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(this.out);
    return g;
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, a = 0.005) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(this.env(t, a, dur, vol));
    o.start(t); o.stop(t + a + dur + 0.02);
  }

  private hiss(t: number, ftype: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, a = 0.004) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx!.createBiquadFilter();
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    s.connect(f).connect(this.env(t, a, dur, vol));
    s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.02);
  }

  /** @returns длительность, с */
  private synth(n: Name, t: number, v: number): number {
    const r = 0.9 + Math.random() * 0.2;
    switch (n) {
      case 'swipe': this.hiss(t, 'bandpass', 2600 * r, 700, 0.13, 0.35 * v, 1.5, 0.015); return 0.15;
      case 'slice': this.hiss(t, 'highpass', 3000, 1500, 0.06, 0.25 * v, 0.7); this.tone(t, 'triangle', 1400 * r, 600, 0.06, 0.08 * v); return 0.08;
      case 'hit': this.hiss(t, 'lowpass', 1200, 300, 0.06, 0.4 * v); this.tone(t, 'sine', 160 * r, 60, 0.07, 0.3 * v); return 0.09;
      case 'kill': this.hiss(t, 'bandpass', 700 * r, 250, 0.14, 0.45 * v, 2); this.tone(t, 'sine', 240 * r, 70, 0.12, 0.25 * v); return 0.16;
      case 'gem': {
        if (t - this.gemAt > 0.6) this.gemPitch = 0;
        this.gemAt = t; this.gemPitch = Math.min(12, this.gemPitch + 1);
        const f = 880 * Math.pow(2, this.gemPitch / 24);
        this.tone(t, 'sine', f, f * 1.5, 0.07, 0.12 * v); return 0.09;
      }
      case 'chest': [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.06, 'triangle', f, f, 0.12, 0.18 * v)); return 0.4;
      case 'level': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(t + i * 0.07, 'square', f, f, 0.14, 0.07 * v)); return 0.5;
      case 'hurt': this.tone(t, 'square', 180, 70, 0.2, 0.18 * v); this.hiss(t, 'lowpass', 900, 200, 0.15, 0.3 * v); return 0.22;
      case 'explode': this.hiss(t, 'lowpass', 1600, 80, 0.55, 0.7 * v, 0.8); this.tone(t, 'sine', 90, 30, 0.45, 0.5 * v); return 0.6;
      case 'rune': [392, 523, 659, 784].forEach((f) => this.tone(t, 'sine', f, f * 1.02, 0.55, 0.08 * v, 0.03)); this.hiss(t, 'highpass', 5000, 8000, 0.4, 0.06 * v); return 0.6;
      case 'boss': this.tone(t, 'sawtooth', 70, 45, 1.1, 0.25 * v, 0.1); this.tone(t, 'sawtooth', 73, 44, 1.1, 0.2 * v, 0.1); this.hiss(t, 'lowpass', 500, 100, 1, 0.3 * v); return 1.2;
      case 'jump': this.tone(t, 'sine', 180, 520, 0.16, 0.18 * v); return 0.18;
      case 'land': this.hiss(t, 'lowpass', 600, 80, 0.2, 0.5 * v); this.tone(t, 'sine', 110, 40, 0.18, 0.35 * v); return 0.22;
      case 'crate': this.hiss(t, 'bandpass', 1800, 900, 0.05, 0.35 * v, 3); this.hiss(t + 0.04, 'bandpass', 1200, 500, 0.08, 0.3 * v, 3); return 0.14;
      case 'spit': this.hiss(t, 'bandpass', 1400, 400, 0.12, 0.25 * v, 4); this.tone(t, 'sine', 300, 600, 0.08, 0.08 * v); return 0.14;
      case 'clank': this.tone(t, 'square', 1250 * r, 1100, 0.08, 0.12 * v); this.tone(t, 'square', 1870 * r, 1700, 0.1, 0.08 * v); return 0.12;
      case 'fall': this.tone(t, 'sine', 700, 70, 0.6, 0.18 * v, 0.01); return 0.62;
      case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(t + i * 0.12, 'triangle', f, f, 0.25, 0.2 * v)); return 1.1;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(t + i * 0.18, 'triangle', f, f * 0.98, 0.3, 0.2 * v)); return 1;
      case 'fuse': this.tone(t, 'square', 1500, 1500, 0.04, 0.06 * v); return 0.05;
      case 'zap': this.hiss(t, 'highpass', 4000, 2000, 0.08, 0.15 * v); this.tone(t, 'sawtooth', 900 * r, 300, 0.08, 0.06 * v); return 0.1;
      case 'throw': this.hiss(t, 'bandpass', 900, 2200, 0.15, 0.15 * v, 2); return 0.16;
      case 'bell': [880, 1320, 1760].forEach((f) => this.tone(t, 'sine', f, f, 1.2, 0.12 * v, 0.005)); return 1.2;
    }
  }
}

export const sfx = new Sfx();
