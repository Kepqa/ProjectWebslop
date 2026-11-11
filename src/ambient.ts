import Phaser from 'phaser';
import { settings } from './settings';
import { tone } from './art';

/** Что летает в воздухе на уровне. */
export type AmbientKind = 'pollen' | 'embers' | 'wisps' | 'dust' | 'ash' | 'rain' | 'leaves';

type Cfg = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/**
 * Атмосферные частицы: живут в мире, рождаются по всей площади обзора (с запасом) и дрейфуют по ветру.
 * У каждого уровня свои — пыльца на окраине, угли над разломом, огоньки душ в некрополе,
 * пыль в здании, пепел в городе, дождь при мародёрстве, листья в деревне. Отключаются в настройках.
 */
export class Ambient {
  private ems: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  constructor(private scene: Phaser.Scene, kind: AmbientKind | undefined) {
    if (!settings.particles || !kind) return;
    if (!scene.textures.exists('puff')) {
      const t = scene.textures.createCanvas('puff', 64, 64)!, c = t.getContext();
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64); t.refresh();
    }
    const cam = scene.cameras.main;
    // точка рождения — случайно по обзору с полями, чтобы частицы не «включались» на глазах у края
    const x = { onEmit: () => cam.worldView.x - 120 + Math.random() * (cam.worldView.width + 240) };
    const y = { onEmit: () => cam.worldView.y - 120 + Math.random() * (cam.worldView.height + 240) };
    const top = { onEmit: () => cam.worldView.y - 60 - Math.random() * 80 };
    const add = (tex: string, depth: number, cfg: Cfg) => {
      const tint = Array.isArray(cfg.tint) ? (cfg.tint as number[]).map(tone) : cfg.tint;
      this.ems.push(scene.add.particles(0, 0, tex, { x, y, ...cfg, tint }).setDepth(depth));
    };
    const fade = { onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) }; // плавно появляется и гаснет
    switch (kind) {
      case 'pollen': // тёплые пылинки и редкие светлячки
        add('dot', 11, { frequency: 260, lifespan: 7000, speedX: { min: 6, max: 22 }, speedY: { min: -8, max: 8 }, scale: { min: 0.12, max: 0.3 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.55 }, tint: [0xfff3bf, 0xd8f5a2, 0xffffff] });
        add('puff', 11, { frequency: 1500, lifespan: 5000, speedX: { min: -14, max: 14 }, speedY: { min: -14, max: 14 }, scale: { min: 0.12, max: 0.2 }, alpha: { onUpdate: (_p, _k, t) => Math.abs(Math.sin(t * Math.PI * 4)) * Math.sin(t * Math.PI) * 0.9 }, tint: [0xd8f5a2, 0xffe066], blendMode: 'ADD' });
        break;
      case 'embers': // угли поднимаются из разлома
        add('dot', 11, { frequency: 110, lifespan: { min: 2600, max: 4600 }, speedX: { min: -18, max: 28 }, speedY: { min: -70, max: -28 }, scale: { start: 0.42, end: 0 }, alpha: fade, tint: [0xff922b, 0xffd43b, 0xff6b00], blendMode: 'ADD' });
        add('puff', 2.2, { frequency: 900, lifespan: 6000, speedX: { min: 4, max: 16 }, speedY: { min: -10, max: -3 }, scale: { start: 1.6, end: 3.4 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.07 }, tint: [0x5c4a3d] });
        break;
      case 'wisps': // стелющийся туман и огоньки душ
        add('puff', 11, { frequency: 520, lifespan: 9000, speedX: { min: 5, max: 16 }, speedY: { min: -4, max: 4 }, scale: { start: 2.6, end: 5 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.085 }, tint: [0xa5b4fc, 0xd0ebff] });
        add('puff', 11, { frequency: 1100, lifespan: 5500, speedX: { min: -16, max: 16 }, speedY: { min: -30, max: -8 }, scale: { start: 0.3, end: 0.06 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.8 }, tint: [0x63e6be, 0xa5d8ff], blendMode: 'ADD' });
        break;
      case 'dust': // пыль в спёртом воздухе: медленно, почти неподвижно
        add('dot', 11, { frequency: 200, lifespan: 9000, speedX: { min: -6, max: 6 }, speedY: { min: -2, max: 7 }, scale: { min: 0.08, max: 0.22 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.45 }, tint: [0xe9ecef, 0xced4da] });
        break;
      case 'ash': // пепел и обрывки бумаги по ветру
        add('dot', 11, { frequency: 120, lifespan: 6500, speedX: { min: 26, max: 70 }, speedY: { min: 8, max: 34 }, scale: { min: 0.1, max: 0.28 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.6 }, tint: [0xdee2e6, 0x868e96, 0xadb5bd] });
        add('chip', 11, { frequency: 2400, lifespan: 5200, speedX: { min: 50, max: 110 }, speedY: { min: -12, max: 30 }, rotate: { start: 0, end: 540 }, scale: { min: 0.7, max: 1.2 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.7 }, tint: [0xf1f3f5, 0xe9e2c8] });
        break;
      case 'rain': // косой дождь
        add('chip', 11, { y: top, frequency: 12, lifespan: 900, speedX: { min: -150, max: -110 }, speedY: { min: 760, max: 940 }, rotate: 100, scaleX: { min: 1.8, max: 3 }, scaleY: 0.22, alpha: { min: 0.16, max: 0.34 }, tint: [0xa5d8ff, 0xdbe4ff] });
        add('puff', 1.5, { frequency: 70, lifespan: 420, speed: 0, scale: { start: 0.08, end: 0.42 }, alpha: { start: 0.22, end: 0 }, tint: [0xc5d6e8] });
        break;
      case 'leaves': // листья кружатся, над травой мошкара
        add('chip', 11, { frequency: 520, lifespan: 7000, speedX: { min: 18, max: 60 }, speedY: { min: 10, max: 40 }, rotate: { start: 0, end: 720 }, scale: { min: 0.8, max: 1.4 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.85 }, tint: [0xa9763a, 0xc99a3c, 0x7a8f3a, 0x8a4f2a] });
        add('dot', 11, { frequency: 700, lifespan: 4000, speedX: { min: -30, max: 30 }, speedY: { min: -30, max: 30 }, scale: { min: 0.08, max: 0.14 }, alpha: { onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.5 }, tint: [0x212529] });
        break;
    }
    // чтобы воздух не был пустым в первую секунду
    for (const e of this.ems) e.fastForward?.(4000, 120);
  }

  setPaused(p: boolean) { for (const e of this.ems) { if (p) e.pause(); else e.resume(); } }
}
