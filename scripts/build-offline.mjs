import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = path.join(appDir, '.offline-build');
const outputPath = path.join(appDir, 'offline-test.html');

await build({
  configFile: false,
  root: appDir,
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': appDir },
  },
  publicDir: false,
  build: {
    outDir: tempDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

let html = await fs.readFile(path.join(tempDir, 'index.html'), 'utf8');
html = html.replace(/\s*<link[^>]+href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, '');
html = html.replace(/\s*<link[^>]+(?:icon|apple-touch-icon)[^>]*>/g, '');
html = html.replace(/\s*<link[^>]+rel="modulepreload"[^>]*>/g, '');

for (const match of [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {
  const assetPath = path.resolve(tempDir, match[1].replace(/^\.\//, ''));
  const source = (await fs.readFile(assetPath, 'utf8')).replace(/<\/script/gi, '<\\/script');
  html = html.replace(match[0], () => `<script type="module">\n${source}\n</script>`);
}

const icon = await fs.readFile(path.join(appDir, 'public', 'icon.svg'));
html = html.replaceAll('/icon.svg', `data:image/svg+xml;base64,${icon.toString('base64')}`);

const pdfWorker = (await fs.readFile(path.join(appDir, 'public', 'pdf.worker.min.mjs'))).toString('base64');
const pdfWorkerBootstrap = `<script>window.__LUMINA_PDF_WORKER_URL__=URL.createObjectURL(new Blob([Uint8Array.from(atob('${pdfWorker}'),c=>c.charCodeAt(0))],{type:'text/javascript'}));</script>`;
html = html.replace('<div id="root"></div>', `<div id="root"></div>\n${pdfWorkerBootstrap}`);

for (const match of [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)]) {
  const assetPath = path.resolve(tempDir, match[1].replace(/^\.\//, ''));
  const css = await fs.readFile(assetPath, 'utf8');
  html = html.replace(match[0], `<style>\n${css}\n</style>`);
}

html = html.replace('</head>', '<meta name="lumina-build" content="generated from luminaboard source">\n</head>');
await fs.writeFile(outputPath, html, 'utf8');
await fs.rm(tempDir, { recursive: true, force: true });
console.log(`Offline LuminaBoard created: ${outputPath} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
