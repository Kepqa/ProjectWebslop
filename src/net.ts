import Peer, { type DataConnection, type PeerJSOption } from 'peerjs';

/**
 * Онлайн-кооп: прямое P2P-соединение (WebRTC) через PeerJS.
 * Облачный сервер PeerJS нужен только для «знакомства» устройств; игра идёт напрямую.
 * Хост симулирует мир, гость шлёт ввод и рисует присланные снимки.
 *  - канал 'rel' — надёжный и упорядоченный (JSON-сообщения),
 *  - канал 'snap' — неупорядоченный (бинарные снимки ~15 раз в секунду).
 */
const PREFIX = 'swipesurv-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Msg = { t: string; [k: string]: any };

function peerOptions(): PeerJSOption {
  // ?peer=localhost:9000 — свой сервер (для тестов); по умолчанию облако PeerJS
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 0 };
}

export class Net {
  rel: DataConnection | null = null;
  snap: DataConnection | null = null;
  onMsg: (m: Msg) => void = () => {};
  onSnap: (b: ArrayBuffer) => void = () => {};
  onOpen: () => void = () => {};
  onClose: (reason: string) => void = () => {};
  private lastRecv = 0;
  private hb = 0;
  private closed = false;
  openTimer = 0;
  connected = false;

  private constructor(public role: 'host' | 'client', public code: string, private peer: Peer) {}

  static host(): Promise<Net> {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
        const peer = new Peer(PREFIX + code, peerOptions());
        peer.on('open', () => {
          const net = new Net('host', code, peer);
          peer.on('connection', (c) => net.accept(c));
          resolve(net);
        });
        peer.on('error', (e: { type?: string; message?: string }) => {
          if (e.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); return; }
          reject(new Error(e.type === 'network' || e.type === 'server-error' ? 'Нет связи с сервером комнат' : e.message || String(e.type)));
        });
      };
      attempt();
    });
  }

  static join(code: string): Promise<Net> {
    code = code.trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      const timer = setTimeout(() => { peer.destroy(); reject(new Error('Сервер комнат не отвечает')); }, 15000);
      peer.on('open', () => {
        clearTimeout(timer);
        const net = new Net('client', code, peer);
        const rel = peer.connect(PREFIX + code, { label: 'rel', reliable: true, serialization: 'raw' });
        const snap = peer.connect(PREFIX + code, { label: 'snap', reliable: false, serialization: 'raw' });
        net.bind(rel); net.bind(snap);
        // если за 15с канал не открылся — комната недоступна (например, сеть блокирует P2P)
        net.openTimer = window.setTimeout(() => { if (!net.connected) net.drop('Не удалось соединиться с хостом'); }, 15000);
        resolve(net);
      });
      peer.on('error', (e: { type?: string; message?: string }) => {
        clearTimeout(timer);
        reject(new Error(e.type === 'peer-unavailable' ? 'Комната не найдена' : e.type === 'network' || e.type === 'server-error' ? 'Нет связи с сервером комнат' : e.message || String(e.type)));
      });
    });
  }

  private accept(c: DataConnection) {
    // в комнате только один гость
    if ((c.label === 'rel' && this.rel) || (c.label === 'snap' && this.snap)) { c.close(); return; }
    this.bind(c);
  }

  private bind(c: DataConnection) {
    if (c.label === 'rel') this.rel = c; else this.snap = c;
    c.on('open', () => this.checkOpen());
    c.on('data', (d) => {
      this.lastRecv = performance.now();
      if (typeof d === 'string') {
        const m = JSON.parse(d) as Msg;
        if (m.t !== 'ping') this.onMsg(m);
      } else if (d instanceof ArrayBuffer) this.onSnap(d);
      else if (ArrayBuffer.isView(d)) this.onSnap((d as Uint8Array).slice().buffer);
    });
    c.on('close', () => this.drop('Соединение закрыто'));
    c.on('error', () => this.drop('Ошибка соединения'));
  }

  private checkOpen() {
    if (this.connected || !this.rel?.open || !this.snap?.open) return;
    this.connected = true;
    clearTimeout(this.openTimer);
    this.lastRecv = performance.now();
    this.hb = window.setInterval(() => {
      this.send({ t: 'ping' });
      if (performance.now() - this.lastRecv > 9000) this.drop('Напарник не отвечает');
    }, 1500);
    this.onOpen();
  }

  drop(reason: string) {
    if (this.closed) return;
    const was = this.connected;
    this.connected = false;
    clearInterval(this.hb);
    this.rel?.close(); this.snap?.close();
    this.rel = null; this.snap = null;
    if (this.role === 'client') this.closed = true;
    if (was || this.role === 'client') this.onClose(reason);
  }

  send(m: Msg) {
    if (this.rel?.open) void this.rel.send(JSON.stringify(m));
  }

  sendSnap(b: ArrayBuffer) {
    const dc = this.snap?.dataChannel;
    if (!this.snap?.open || !dc) return;
    if (dc.bufferedAmount > 256 * 1024) return; // канал забит — пропускаем кадр
    void this.snap.send(b);
  }

  close() {
    this.closed = true;
    clearInterval(this.hb);
    try { this.send({ t: 'bye' }); } catch { /* ignore */ }
    setTimeout(() => { this.rel?.close(); this.snap?.close(); this.peer.destroy(); }, 100);
  }
}

// ---------- Бинарный снимок ----------
export interface ZRec { id: number; type: number; flags: number; x: number; y: number; rot: number; sx: number; sy: number; alpha: number }
export interface GemRec { x: number; y: number; kind: number }
export interface ProjRec { x: number; y: number; vx: number; vy: number; kind: number }
export interface BoomRec { x: number; y: number; rot: number }

export const ZF = { FLASH: 1, RED: 2, FROST: 4, BROKEN: 8, BOSS: 16, AIR: 32, GHOST: 64 } as const;

export class SnapWriter {
  z: number[] = []; g: number[] = []; p: number[] = []; b: number[] = [];
  zombie(id: number, type: number, flags: number, x: number, y: number, rot: number, sx: number, sy: number, alpha: number) {
    this.z.push(id & 0xffff, type, flags, x, y, rot, sx, sy, alpha);
  }
  gem(x: number, y: number, kind: number) { this.g.push(x, y, kind); }
  proj(x: number, y: number, vx: number, vy: number, kind: number) { this.p.push(x, y, vx, vy, kind); }
  boom(x: number, y: number, rot: number) { this.b.push(x, y, rot); }

  finish(header: object): ArrayBuffer {
    const hb = new TextEncoder().encode(JSON.stringify(header));
    const nz = this.z.length / 9, ng = this.g.length / 3, np = this.p.length / 5, nb = this.b.length / 3;
    const hl = 4 + hb.length, pad = (4 - (hl % 4)) % 4;
    const size = hl + pad + 8 + nz * 16 + ng * 12 + np * 20 + nb * 12;
    const buf = new ArrayBuffer(size);
    const dv = new DataView(buf);
    dv.setUint32(0, hb.length, true);
    new Uint8Array(buf, 4, hb.length).set(hb);
    let o = hl + pad;
    dv.setUint16(o, nz, true); dv.setUint16(o + 2, ng, true); dv.setUint16(o + 4, np, true); dv.setUint16(o + 6, nb, true);
    o += 8;
    const z = this.z;
    for (let i = 0; i < z.length; i += 9) {
      dv.setUint16(o, z[i], true); dv.setUint8(o + 2, z[i + 1]); dv.setUint8(o + 3, z[i + 2]);
      dv.setFloat32(o + 4, z[i + 3], true); dv.setFloat32(o + 8, z[i + 4], true);
      const rot = ((z[i + 5] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      dv.setUint8(o + 12, Math.round((rot / (Math.PI * 2)) * 255));
      dv.setUint8(o + 13, Math.min(255, Math.round(z[i + 6] * 80)));
      dv.setUint8(o + 14, Math.min(255, Math.round(z[i + 7] * 80)));
      dv.setUint8(o + 15, Math.round(Math.max(0, Math.min(1, z[i + 8])) * 255));
      o += 16;
    }
    for (let i = 0; i < this.g.length; i += 3) {
      dv.setFloat32(o, this.g[i], true); dv.setFloat32(o + 4, this.g[i + 1], true); dv.setUint8(o + 8, this.g[i + 2]); o += 12;
    }
    for (let i = 0; i < this.p.length; i += 5) {
      dv.setFloat32(o, this.p[i], true); dv.setFloat32(o + 4, this.p[i + 1], true);
      dv.setFloat32(o + 8, this.p[i + 2], true); dv.setFloat32(o + 12, this.p[i + 3], true); dv.setUint8(o + 16, this.p[i + 4]); o += 20;
    }
    for (let i = 0; i < this.b.length; i += 3) {
      dv.setFloat32(o, this.b[i], true); dv.setFloat32(o + 4, this.b[i + 1], true); dv.setFloat32(o + 8, this.b[i + 2], true); o += 12;
    }
    return buf;
  }
}

export function decodeSnap(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  const hl = dv.getUint32(0, true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))) as any;
  let o = 4 + hl; o += (4 - (o % 4)) % 4;
  const nz = dv.getUint16(o, true), ng = dv.getUint16(o + 2, true), np = dv.getUint16(o + 4, true), nb = dv.getUint16(o + 6, true);
  o += 8;
  const zs: ZRec[] = [], gs: GemRec[] = [], ps: ProjRec[] = [], bs: BoomRec[] = [];
  for (let i = 0; i < nz; i++, o += 16) {
    zs.push({
      id: dv.getUint16(o, true), type: dv.getUint8(o + 2), flags: dv.getUint8(o + 3),
      x: dv.getFloat32(o + 4, true), y: dv.getFloat32(o + 8, true), rot: (dv.getUint8(o + 12) / 255) * Math.PI * 2,
      sx: dv.getUint8(o + 13) / 80, sy: dv.getUint8(o + 14) / 80, alpha: dv.getUint8(o + 15) / 255,
    });
  }
  for (let i = 0; i < ng; i++, o += 12) gs.push({ x: dv.getFloat32(o, true), y: dv.getFloat32(o + 4, true), kind: dv.getUint8(o + 8) });
  for (let i = 0; i < np; i++, o += 20) ps.push({ x: dv.getFloat32(o, true), y: dv.getFloat32(o + 4, true), vx: dv.getFloat32(o + 8, true), vy: dv.getFloat32(o + 12, true), kind: dv.getUint8(o + 16) });
  for (let i = 0; i < nb; i++, o += 12) bs.push({ x: dv.getFloat32(o, true), y: dv.getFloat32(o + 4, true), rot: dv.getFloat32(o + 8, true) });
  return { header, zs, gs, ps, bs };
}
