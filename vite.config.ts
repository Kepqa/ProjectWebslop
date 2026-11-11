import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Версия из package.json + короткий хеш коммита + дата сборки.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let commit = (process.env.GITHUB_SHA ?? '').slice(0, 7);
if (!commit) {
  try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { commit = 'dev'; }
}
const date = new Date().toISOString().slice(0, 10);
const build = `${pkg.version}+${commit}`;

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    // Хаб мини-игр: каждая игра — отдельная страница со своей папкой
    rollupOptions: {
      input: {
        hub: fileURLToPath(new URL('./index.html', import.meta.url)),
        survivors: fileURLToPath(new URL('./survivors/index.html', import.meta.url)),
        duel: fileURLToPath(new URL('./duel/index.html', import.meta.url)),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(build),
    __APP_DATE__: JSON.stringify(date),
  },
  plugins: [{
    // version.json рядом с игрой — по нему открытая страница узнаёт, что вышла новая версия
    name: 'version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build, date }) });
    },
  }],
});
