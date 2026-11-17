// SUNSET SIEGE — the entry program (Node 22, standard library only).
// The game itself is the plain static files under game/: game/index.html plus its ES modules,
// no libraries and no network requests. This program hands the entry in: it copies game/ and
// screenshots/ from beside this file into the output directory and writes dossier.json there,
// the summary the judge reads, using the vendored make.fun dossier library. It writes the same
// bytes on every run: the inputs are fixed files, and the dossier builder is deterministic.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The gate's caps, as the scorer applies them: the text cap shapes the dossier's bytes, and
// the rest refuse an entry the scorer would refuse (too many screenshots, an oversized
// screenshot, or a game/ tree over its file, byte or path limits).
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
