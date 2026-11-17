// Screenshot driver: serves game/ on localhost, opens each staged state in Playwright's
// Chromium, waits for the game to signal readiness, and saves a JPEG that fits the
// bounty caps (1280x720, at most 256 KiB). Run from the repo root:
//   node shots.mjs
// The Playwright install lives in the shared shot-tool directory.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire('/home/hatch/workspace/makefun/shot-tool/package.json');
const { chromium } = require('playwright');

const ROOT = '/home/hatch/workspace/makefun/best-game-3';
const GAME_DIR = join(ROOT, 'game');
const OUT_DIR = join(ROOT, 'screenshots');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const SHOTS = [
  { name: '1-title.jpg', query: 'shot=title&seed=1' },
  { name: '2-gameplay.jpg', query: 'shot=play&seed=1' },
  { name: '3-collapse.jpg', query: 'shot=collapse&seed=1' },
  { name: '4-complete.jpg', query: 'shot=complete&seed=1' },
];

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const data = await readFile(join(GAME_DIR, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
console.log(`serving ${GAME_DIR} on http://127.0.0.1:${port}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

for (const shot of SHOTS) {
  await page.goto(`http://127.0.0.1:${port}/index.html?${shot.query}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__shotReady === true', null, { timeout: 15000 });
  await page.waitForTimeout(150);
  // Quality ladder: start high, step down until the file fits the 256 KiB cap.
  let quality = 88;
  let buffer = null;
  for (;;) {
    buffer = await page.screenshot({ type: 'jpeg', quality });
    if (buffer.length <= 262144 || quality <= 30) break;
    quality -= quality > 60 ? 13 : 15;
  }
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, shot.name), buffer);
  console.log(`${shot.name}: ${buffer.length} bytes at quality ${quality}`);
}

await browser.close();
server.close();
if (errors.length > 0) {
  console.log('ERRORS:');
  for (const error of errors) console.log(`  ${error}`);
  process.exit(1);
}
console.log('all shots captured, zero console errors');
