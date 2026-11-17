// The full-screen moments between sieges: title, level select, pause, victory, defeat and
// the end of the campaign. Each draws its panel and registers its buttons into the array
// the caller passes, so clicks are tested against exactly what was drawn this frame.
import { FIELD } from './config.js';
import { LEVELS as LEVEL_DEFS } from './levels.js';
import { drawText, drawTextOutlined } from './render.js';

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawButton(ctx, buttons, pointer, id, x, y, w, h, label, primary = false) {
  const hover = pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;
  buttons.push({ id, x, y, w, h });
  ctx.fillStyle = primary ? (hover ? '#ffc93e' : '#f5b62e') : (hover ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)');
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = primary ? '#7a5230' : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, label, x + w / 2, y + h / 2 + 8, 22, primary ? '#2a1a0c' : '#fff6e8', 'center');
  return hover;
}

function dim(ctx, alpha = 0.55) {
  ctx.fillStyle = `rgba(16, 8, 20, ${alpha})`;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(26, 15, 24, 0.92)';
  roundRectPath(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = '#f5b62e';
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function drawStar(ctx, x, y, r, filled, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffd23e' : 'rgba(255,255,255,0.18)';
  ctx.fill();
  ctx.strokeStyle = filled ? '#a87c44' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export function drawTitle(ctx, buttons, pointer, progress, time) {
  dim(ctx, 0.35);
  const bob = Math.sin(time * 1.2) * 4;
  drawTextOutlined(ctx, 'SUNSET', FIELD.width / 2, 158 + bob, 96, '#ffd98a', 'center');
  drawTextOutlined(ctx, 'SIEGE', FIELD.width / 2, 238 + bob, 96, '#ff9d2e', 'center');
  drawTextOutlined(ctx, 'Topple the fortresses of the Dusk Wastes', FIELD.width / 2, 282, 24, '#fff6e8', 'center');
  const started = progress.unlocked > 1 || progress.stars.some((s) => s > 0);
  drawButton(ctx, buttons, pointer, 'start', FIELD.width / 2 - 150, 330, 300, 64, started ? 'CONTINUE THE SIEGE' : 'START THE SIEGE', true);
  drawButton(ctx, buttons, pointer, 'levels', FIELD.width / 2 - 150, 410, 300, 54, 'LEVEL SELECT');
  drawTextOutlined(ctx, 'Drag back to aim · Release to fire · 1–4 select shot · R retry · P pause · M sound',
    FIELD.width / 2, 540, 19, '#f6b25c', 'center');
  const stars = progress.stars.reduce((a, b) => a + b, 0);
  if (stars > 0 || progress.bestScore > 0) {
    drawTextOutlined(ctx, `${stars}/24 stars · Best score ${progress.bestScore.toLocaleString('en-US')}`,
      FIELD.width / 2, 578, 19, '#fff6e8', 'center');
  }
  drawText(ctx, 'A physics siege puzzle · 8 hand-built fortresses', FIELD.width / 2, 690, 16, 'rgba(255,246,232,0.75)', 'center');
}

export function drawLevelSelect(ctx, buttons, pointer, progress) {
  dim(ctx, 0.6);
  drawTextOutlined(ctx, 'CHOOSE A FORTRESS', FIELD.width / 2, 96, 46, '#ffd98a', 'center');
  const cols = 4;
  const cardW = 250;
  const cardH = 170;
  const gap = 24;
  const x0 = FIELD.width / 2 - ((cols * cardW + (cols - 1) * gap) / 2);
  const y0 = 140;
  LEVEL_DEFS.forEach((level, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = x0 + col * (cardW + gap);
    const y = y0 + row * (cardH + gap);
    const unlocked = index < progress.unlocked;
    buttons.push({ id: `level-${index}`, x, y, w: cardW, h: cardH, disabled: !unlocked });
    const hover = unlocked && pointer.x >= x && pointer.x <= x + cardW && pointer.y >= y && pointer.y <= y + cardH;
    ctx.fillStyle = unlocked ? (hover ? 'rgba(255,210,62,0.22)' : 'rgba(26,15,24,0.9)') : 'rgba(26,15,24,0.6)';
    roundRectPath(ctx, x, y, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = unlocked ? '#f5b62e' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawText(ctx, `LEVEL ${index + 1}`, x + cardW / 2, y + 38, 18, '#f6b25c', 'center');
    drawText(ctx, level.name, x + cardW / 2, y + 70, 23, unlocked ? '#fff6e8' : 'rgba(255,246,232,0.4)', 'center');
    if (unlocked) {
      for (let s = 0; s < 3; s += 1) {
        drawStar(ctx, x + cardW / 2 - 34 + s * 34, y + 112, 14, s < progress.stars[index]);
      }
      const shots = Object.values(level.shots).reduce((a, b) => a + b, 0);
      drawText(ctx, `${shots} shots · par ${level.par}`, x + cardW / 2, y + 148, 15, '#c9a98a', 'center');
    } else {
      // A small drawn padlock: no emoji font needed.
      ctx.strokeStyle = '#c9a98a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + cardW / 2, y + 108, 11, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#c9a98a';
      roundRectPath(ctx, x + cardW / 2 - 14, y + 106, 28, 22, 4);
      ctx.fill();
    }
  });
  drawButton(ctx, buttons, pointer, 'back-title', FIELD.width / 2 - 110, 560, 220, 52, 'BACK');
}

export function drawPause(ctx, buttons, pointer) {
  dim(ctx, 0.6);
  panel(ctx, FIELD.width / 2 - 230, 170, 460, 380);
  drawTextOutlined(ctx, 'PAUSED', FIELD.width / 2, 238, 48, '#ffd98a', 'center');
  drawButton(ctx, buttons, pointer, 'resume', FIELD.width / 2 - 160, 272, 320, 54, 'RESUME', true);
  drawButton(ctx, buttons, pointer, 'restart-level', FIELD.width / 2 - 160, 340, 320, 54, 'RESTART LEVEL');
  drawButton(ctx, buttons, pointer, 'to-levels', FIELD.width / 2 - 160, 408, 320, 54, 'LEVEL SELECT');
  drawButton(ctx, buttons, pointer, 'to-title', FIELD.width / 2 - 160, 476, 320, 54, 'TITLE SCREEN');
}

export function drawComplete(ctx, buttons, pointer, world, animT) {
  dim(ctx, 0.55);
  panel(ctx, FIELD.width / 2 - 270, 130, 540, 470);
  drawTextOutlined(ctx, 'FORTRESS FALLEN!', FIELD.width / 2, 196, 42, '#ffd23e', 'center');
  for (let s = 0; s < 3; s += 1) {
    const pop = Math.max(0, Math.min(1, (animT - 0.25 - s * 0.22) * 3));
    const scale = pop <= 0 ? 0.01 : 1 + Math.sin(pop * Math.PI) * 0.25;
    drawStar(ctx, FIELD.width / 2 - 70 + s * 70, 248, 30, s < world.state.stars && pop > 0, scale);
  }
  const rows = [
    ['Shots used', `${world.state.shotsUsed}  (par ${world.level.par})`],
    ['Ruin', `${Math.round(world.destruction() * 100)}%`],
    ['Time', `${world.state.wonAt.toFixed(1)}s`],
    ['Unused-shot bonus', `+${world.state.winBonus}`],
    ['Level score', `${world.state.score.toLocaleString('en-US')}`],
  ];
  rows.forEach(([label, value], i) => {
    const y = 310 + i * 30;
    drawText(ctx, label, FIELD.width / 2 - 200, y, 19, '#c9a98a');
    drawText(ctx, value, FIELD.width / 2 + 200, y, 19, '#fff6e8', 'right');
  });
  const last = world.state.levelIndex >= LEVEL_DEFS.length - 1;
  if (!last) {
    drawButton(ctx, buttons, pointer, 'next', FIELD.width / 2 - 210, 486, 200, 56, 'NEXT →', true);
  } else {
    drawButton(ctx, buttons, pointer, 'finish', FIELD.width / 2 - 210, 486, 200, 56, 'FINISH', true);
  }
  drawButton(ctx, buttons, pointer, 'retry', FIELD.width / 2 - 0, 486, 100, 56, 'RETRY');
  drawButton(ctx, buttons, pointer, 'to-levels', FIELD.width / 2 + 110, 486, 100, 56, 'MAP');
}

export function drawFailed(ctx, buttons, pointer, world) {
  dim(ctx, 0.55);
  panel(ctx, FIELD.width / 2 - 260, 180, 520, 360);
  drawTextOutlined(ctx, 'OUT OF STONES', FIELD.width / 2, 250, 42, '#ff9d2e', 'center');
  drawText(ctx, `${world.defendersLeft()} defender${world.defendersLeft() === 1 ? '' : 's'} still stand${world.defendersLeft() === 1 ? 's' : ''}.`, FIELD.width / 2, 296, 21, '#fff6e8', 'center');
  drawText(ctx, world.level.tip, FIELD.width / 2, 330, 18, '#f6b25c', 'center');
  drawText(ctx, `Ruin: ${Math.round(world.destruction() * 100)}% · Score ${world.state.score.toLocaleString('en-US')}`, FIELD.width / 2, 362, 18, '#c9a98a', 'center');
  drawButton(ctx, buttons, pointer, 'retry', FIELD.width / 2 - 210, 420, 200, 56, 'TRY AGAIN', true);
  drawButton(ctx, buttons, pointer, 'to-levels', FIELD.width / 2 + 10, 420, 200, 56, 'LEVEL SELECT');
}

export function drawGameComplete(ctx, buttons, pointer, progress, totalScore) {
  dim(ctx, 0.6);
  panel(ctx, FIELD.width / 2 - 300, 140, 600, 440);
  drawTextOutlined(ctx, 'THE DUSK WASTES', FIELD.width / 2, 214, 44, '#ffd98a', 'center');
  drawTextOutlined(ctx, 'ARE FREE!', FIELD.width / 2, 262, 44, '#ff9d2e', 'center');
  const stars = progress.stars.reduce((a, b) => a + b, 0);
  drawText(ctx, `All 8 fortresses fallen · ${stars}/24 stars`, FIELD.width / 2, 312, 22, '#fff6e8', 'center');
  drawText(ctx, `Campaign score: ${totalScore.toLocaleString('en-US')}`, FIELD.width / 2, 348, 22, '#fff6e8', 'center');
  drawText(ctx, 'Every defender routed, every tower toppled. The sunset is yours.', FIELD.width / 2, 384, 18, '#f6b25c', 'center');
  drawButton(ctx, buttons, pointer, 'play-again', FIELD.width / 2 - 220, 460, 210, 56, 'PLAY AGAIN', true);
  drawButton(ctx, buttons, pointer, 'to-levels', FIELD.width / 2 + 10, 460, 210, 56, 'LEVEL SELECT');
}

export function drawLevelIntro(ctx, world, alpha) {
  ctx.globalAlpha = alpha;
  drawTextOutlined(ctx, `LEVEL ${world.state.levelIndex + 1}`, FIELD.width / 2, 190, 30, '#f6b25c', 'center');
  drawTextOutlined(ctx, world.level.name.toUpperCase(), FIELD.width / 2, 248, 58, '#ffd98a', 'center');
  drawTextOutlined(ctx, world.level.tip, FIELD.width / 2, 292, 21, '#fff6e8', 'center');
  ctx.globalAlpha = 1;
}
