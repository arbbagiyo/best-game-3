// Everything the player sees: the sunset desert, the fortress blocks, the defenders, the
// trebuchet, the trajectory, the particles and the HUD. The static background is painted
// once to an offscreen canvas; only the moving pieces are drawn each frame.
import { FIELD, PALETTE, SHOT_ORDER, SHOT_TYPES, TREBUCHET } from './config.js';
import { createRandom } from './rng.js';
import { trajectoryPoint } from './world.js';

const FONT = "'Trebuchet MS', Verdana, sans-serif";

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

export function drawText(ctx, str, x, y, size, color, align = 'left', weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function drawTextOutlined(ctx, str, x, y, size, color, align = 'left', weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = Math.max(3, size / 7);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(26,16,10,0.85)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function dunePath(ctx, random, baseY, amplitude, segments) {
  ctx.beginPath();
  ctx.moveTo(-20, FIELD.height);
  ctx.lineTo(-20, baseY);
  for (let i = 0; i <= segments; i += 1) {
    const x = (i / segments) * (FIELD.width + 40) - 20;
    const y = baseY - random() * amplitude - Math.sin((i / segments) * Math.PI * 2.2) * amplitude * 0.5;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(FIELD.width + 20, FIELD.height);
  ctx.closePath();
}

export function createBackground() {
  const canvas = document.createElement('canvas');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');
  const random = createRandom(7);
  const sky = ctx.createLinearGradient(0, 0, 0, FIELD.groundY);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(0.42, PALETTE.skyMid);
  sky.addColorStop(0.72, PALETTE.skyLow);
  sky.addColorStop(1, PALETTE.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, FIELD.width, FIELD.groundY + 1);
  // Sun and its glow, low over the dunes.
  const glow = ctx.createRadialGradient(955, 215, 10, 955, 215, 230);
  glow.addColorStop(0, 'rgba(255, 217, 138, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 157, 77, 0.55)');
  glow.addColorStop(1, 'rgba(255, 157, 77, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(700, 0, 510, 470);
  ctx.fillStyle = PALETTE.sun;
  ctx.beginPath();
  ctx.arc(955, 215, 62, 0, Math.PI * 2);
  ctx.fill();
  // A few drifting clouds.
  ctx.fillStyle = PALETTE.cloud;
  ctx.globalAlpha = 0.5;
  for (const [cx, cy, cw] of [[220, 120, 150], [520, 80, 190], [1130, 110, 130], [760, 150, 110]]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw / 2, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - cw * 0.22, cy - 9, cw / 4, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + cw * 0.22, cy - 7, cw / 4, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Distant ruined towers on the horizon.
  ctx.fillStyle = PALETTE.duneFar;
  for (const [tx, tw, th, lean] of [[340, 46, 120, 0.05], [392, 30, 84, -0.03], [1180, 54, 140, -0.04]]) {
    ctx.save();
    ctx.translate(tx, 596);
    ctx.rotate(lean);
    ctx.fillRect(-tw / 2, -th, tw, th);
    ctx.fillRect(-tw / 2 - 5, -th - 10, tw + 10, 12);
    ctx.restore();
  }
  // Dune layers.
  dunePath(ctx, random, 606, 26, 14);
  ctx.fillStyle = PALETTE.duneFar;
  ctx.fill();
  dunePath(ctx, random, 632, 18, 12);
  ctx.fillStyle = PALETTE.duneNear;
  ctx.fill();
  // Ground: warm sand with a darker edge and scattered stones.
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, FIELD.groundY, FIELD.width, FIELD.height - FIELD.groundY);
  ctx.fillStyle = PALETTE.groundEdge;
  ctx.fillRect(0, FIELD.groundY, FIELD.width, 4);
  ctx.fillStyle = PALETTE.groundDark;
  for (let i = 0; i < 90; i += 1) {
    const x = random() * FIELD.width;
    const y = FIELD.groundY + 10 + random() * 58;
    ctx.globalAlpha = 0.25 + random() * 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + random() * 5, 1.5 + random() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Long shadows stretch toward the viewer from the fortress ground.
  ctx.fillStyle = 'rgba(95, 49, 37, 0.25)';
  for (let i = 0; i < 12; i += 1) {
    const x = 700 + random() * 560;
    ctx.beginPath();
    ctx.ellipse(x, FIELD.groundY + 22 + random() * 40, 26 + random() * 30, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function blockColors(material) {
  if (material === 'wood') return { fill: PALETTE.wood, dark: PALETTE.woodDark, line: PALETTE.woodLine };
  if (material === 'iron') return { fill: PALETTE.iron, dark: PALETTE.ironDark, line: PALETTE.ironLine };
  return { fill: PALETTE.sandstone, dark: PALETTE.sandstoneDark, line: PALETTE.sandstoneLine };
}

function drawCracks(ctx, body, w, h) {
  const fraction = body.health / body.maxHealth;
  if (fraction >= 0.66) return;
  const random = createRandom(body.seed * 31 + 5);
  const cracks = fraction < 0.33 ? 2 : 1;
  ctx.strokeStyle = 'rgba(40, 22, 12, 0.7)';
  ctx.lineWidth = 2;
  for (let i = 0; i < cracks; i += 1) {
    let x = (random() - 0.5) * w * 0.7;
    let y = -h / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < h / 2) {
      x += (random() - 0.5) * w * 0.35;
      y += h / 4;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawBlock(ctx, body) {
  const w = body.hw * 2;
  const h = body.hh * 2;
  const colors = blockColors(body.material);
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.angle);
  ctx.fillStyle = colors.fill;
  ctx.fillRect(-body.hw, -body.hh, w, h);
  ctx.fillStyle = colors.dark;
  ctx.fillRect(-body.hw, body.hh - Math.min(6, h * 0.2), w, Math.min(6, h * 0.2));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(-body.hw, -body.hh, w, Math.min(4, h * 0.14));
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(-body.hw + 1, -body.hh + 1, w - 2, h - 2);
  if (body.material === 'wood') {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    const lines = Math.max(1, Math.floor(w / 34));
    for (let i = 1; i <= lines; i += 1) {
      const x = -body.hw + (w / (lines + 1)) * i;
      ctx.beginPath();
      ctx.moveTo(x, -body.hh + 3);
      ctx.lineTo(x, body.hh - 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (body.material === 'sandstone') {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.55;
    if (w > 60) {
      ctx.beginPath();
      ctx.moveTo(0, -body.hh + 3);
      ctx.lineTo(0, body.hh - 3);
      ctx.stroke();
    }
    if (h > 40) {
      ctx.beginPath();
      ctx.moveTo(-body.hw + 3, 0);
      ctx.lineTo(body.hw - 3, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (body.material === 'iron') {
    ctx.fillStyle = PALETTE.ironRivet;
    for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(rx * (body.hw - 6), ry * (body.hh - 6), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawCracks(ctx, body, w, h);
  if (body.burning) {
    ctx.fillStyle = 'rgba(255, 110, 20, 0.35)';
    ctx.fillRect(-body.hw, -body.hh, w, h);
  }
  ctx.restore();
}

function drawDefender(ctx, body) {
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.angle);
  ctx.fillStyle = PALETTE.robe;
  ctx.beginPath();
  ctx.arc(0, 0, body.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.robeDark;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = PALETTE.robeDark;
  ctx.fillRect(-body.r + 3, 4, body.r * 2 - 6, 4);
  // Helmet dome and brim.
  ctx.fillStyle = PALETTE.helmet;
  ctx.beginPath();
  ctx.arc(0, -2, body.r - 2, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = PALETTE.helmetDark;
  ctx.fillRect(-body.r + 1, -4, body.r * 2 - 2, 3);
  ctx.fillStyle = PALETTE.helmet;
  ctx.fillRect(-2, -body.r - 3, 4, 5);
  // Eyes: wide when tumbling, calm when standing.
  const tumbling = Math.abs(body.av) > 0.6 || Math.hypot(body.vx, body.vy) > 200;
  ctx.fillStyle = '#1d1410';
  for (const ex of [-5, 5]) {
    if (tumbling) {
      ctx.beginPath();
      ctx.arc(ex, 3, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(ex - 2, 2, 4, 2.5);
    }
  }
  ctx.restore();
}

export function drawShotBody(ctx, body) {
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.angle);
  drawShotIcon(ctx, body.shotType || 'rock', 0, 0, body.r, body);
  ctx.restore();
}

export function drawShotIcon(ctx, type, x, y, r, body = null) {
  ctx.save();
  ctx.translate(x, y);
  if (type === 'rock') {
    ctx.fillStyle = PALETTE.rock;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.rockDark;
    ctx.beginPath();
    ctx.arc(-r * 0.3, r * 0.25, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.35, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'bomb') {
    ctx.fillStyle = PALETTE.bomb;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1c2126';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.4, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.bombFuse;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r * 0.75);
    ctx.quadraticCurveTo(r * 0.8, -r * 1.25, r * 0.45, -r * 1.45);
    ctx.stroke();
    const lit = body && body.fuse > 0;
    ctx.fillStyle = lit ? '#ffe45c' : '#ffb03a';
    ctx.beginPath();
    ctx.arc(r * 0.45, -r * 1.45, lit ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'splitter') {
    ctx.fillStyle = '#8a6fd8';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a3fa8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#e9e2ff';
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * r * 0.45, Math.sin(angle) * r * 0.45, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Firepot: terracotta pot with a burning wick.
    ctx.fillStyle = '#c65f33';
    ctx.beginPath();
    ctx.arc(0, 1, r * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a34a26';
    ctx.fillRect(-r * 0.45, -r - 2, r * 0.9, 5);
    ctx.fillStyle = '#ff9d2e';
    ctx.beginPath();
    ctx.moveTo(0, -r - 9);
    ctx.quadraticCurveTo(r * 0.4, -r - 2, 0, -r + 1);
    ctx.quadraticCurveTo(-r * 0.4, -r - 2, 0, -r - 9);
    ctx.fill();
  }
  ctx.restore();
}

function drawShadow(ctx, body) {
  if (body.staticBody || body.kind === 'ground') return;
  const height = Math.max(0, FIELD.groundY - body.y);
  const alpha = Math.max(0.04, 0.22 - height / 2600);
  const w = body.shape === 'circle' ? body.r * 1.6 : Math.hypot(body.hw, body.hh) * 1.1;
  ctx.fillStyle = `rgba(60, 30, 18, ${alpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(body.x, FIELD.groundY + 8, w, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrebuchet(ctx, aimAngle, loadedType, kick, time) {
  const { x, pivotY, armLength } = TREBUCHET;
  ctx.save();
  // Wheels.
  for (const wx of [x - 32, x + 32]) {
    ctx.fillStyle = PALETTE.woodDark;
    ctx.beginPath();
    ctx.arc(wx, 630, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.woodLine;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = PALETTE.ironRivet;
    ctx.beginPath();
    ctx.arc(wx, 630, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Frame: two legs and a base beam.
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 44, 636);
  ctx.lineTo(x - 8, pivotY);
  ctx.moveTo(x + 44, 636);
  ctx.lineTo(x + 8, pivotY);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.wood;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x - 44, 636);
  ctx.lineTo(x - 8, pivotY);
  ctx.moveTo(x + 44, 636);
  ctx.lineTo(x + 8, pivotY);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x - 52, 614);
  ctx.lineTo(x + 52, 614);
  ctx.stroke();
  // Arm: rests high, follows the aim, and kicks forward on release.
  const armAngle = aimAngle + kick * 0.55 + Math.sin(time * 1.4) * 0.006;
  const tipX = x + Math.cos(armAngle) * armLength;
  const tipY = pivotY - Math.sin(armAngle) * armLength;
  const tailX = x - Math.cos(armAngle) * 30;
  const tailY = pivotY + Math.sin(armAngle) * 30;
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.wood;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  // Counterweight.
  ctx.fillStyle = PALETTE.ironDark;
  ctx.fillRect(tailX - 13, tailY - 10, 26, 24);
  ctx.strokeStyle = PALETTE.ironLine;
  ctx.lineWidth = 2;
  ctx.strokeRect(tailX - 13, tailY - 10, 26, 24);
  // Pivot bolt.
  ctx.fillStyle = PALETTE.ironRivet;
  ctx.beginPath();
  ctx.arc(x, pivotY, 6, 0, Math.PI * 2);
  ctx.fill();
  // Sling and loaded shot.
  if (loadedType) {
    ctx.strokeStyle = '#e8d9b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(tipX + 6, tipY + 14, tipX, tipY + 22);
    ctx.stroke();
    drawShotIcon(ctx, loadedType, tipX, tipY + 24, SHOT_TYPES[loadedType].radius);
  }
  ctx.restore();
}

function drawTrajectory(ctx, angle, power) {
  let previous = null;
  for (let t = 0.1; t <= 1.7; t += 0.09) {
    const point = trajectoryPoint(angle, power, t);
    if (point.y > FIELD.groundY - 4 || point.x > FIELD.width - 8) break;
    const fade = 1 - t / 1.9;
    ctx.fillStyle = `rgba(255, 210, 62, ${(0.95 * fade).toFixed(2)})`;
    ctx.strokeStyle = 'rgba(26, 16, 10, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6.5 - t * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (previous) {
      ctx.strokeStyle = `rgba(255, 210, 62, ${(0.25 * fade).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    previous = point;
  }
}

function drawParticles(ctx, particles) {
  for (const p of particles.list) {
    const fade = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'dust') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.55 * fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - fade * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'debris') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = Math.min(1, fade * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    } else if (p.kind === 'flame') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.85 * fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * fade + 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.35 * fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * fade + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** The whole living scene: background, shadows, trebuchet, bodies, aim, particles. */
export function drawScene(ctx, background, world, particles, aimView, time) {
  ctx.drawImage(background, 0, 0);
  const bodies = world.physics.bodies;
  for (const body of bodies) {
    if (!body.dead) drawShadow(ctx, body);
  }
  const aiming = aimView.active && world.state.phase === 'aim';
  const aimAngle = aiming ? aimView.angle : 0.95;
  const loaded = world.state.phase === 'aim' && world.shotsLeft() > 0 ? world.state.selected : null;
  drawTrebuchet(ctx, aimAngle, loaded, world.state.armKick, time);
  for (const body of bodies) {
    if (body.dead || body.kind === 'ground') continue;
    if (body.kind === 'block') drawBlock(ctx, body);
    else if (body.kind === 'defender') drawDefender(ctx, body);
    else drawShotBody(ctx, body);
  }
  if (aiming && aimView.valid) drawTrajectory(ctx, aimView.angle, aimView.power);
  drawParticles(ctx, particles);
}

// --- HUD ---

export const HUD_BUTTONS = [
  { id: 'restart', x: 1136, y: 662, r: 22, label: 'R' },
  { id: 'pause', x: 1188, y: 662, r: 22, label: 'II' },
  { id: 'mute', x: 1240, y: 662, r: 22, label: 'M' },
];

export function ammoSlotRects(world) {
  const types = SHOT_ORDER.filter((type) => (world.level.shots[type] ?? 0) > 0);
  const slotW = 72;
  const gap = 10;
  const total = types.length * slotW + (types.length - 1) * gap;
  let x = FIELD.width / 2 - total / 2;
  return types.map((type) => {
    const rect = { type, x, y: 654, w: slotW, h: 58 };
    x += slotW + gap;
    return rect;
  });
}

export function drawHUD(ctx, world, totalScore, muted, time) {
  // Top strip.
  ctx.fillStyle = 'rgba(24, 14, 24, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, 52);
  drawTextOutlined(ctx, `LEVEL ${world.state.levelIndex + 1} · ${world.level.name.toUpperCase()}`, 18, 34, 21, '#ffd98a');
  // Defenders left, centred.
  const defenders = world.defendersLeft();
  const cx = FIELD.width / 2 - 130;
  ctx.fillStyle = PALETTE.helmet;
  ctx.beginPath();
  ctx.arc(cx, 26, 11, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = PALETTE.robe;
  ctx.beginPath();
  ctx.arc(cx, 28, 11, 0, Math.PI);
  ctx.fill();
  drawTextOutlined(ctx, `${defenders}`, cx + 18, 35, 24, '#ffffff');
  drawTextOutlined(ctx, 'LEFT', cx + 44, 35, 15, '#f6b25c');
  // Destruction meter.
  const barX = FIELD.width / 2 + 30;
  drawTextOutlined(ctx, 'RUIN', barX, 35, 15, '#f6b25c');
  const pct = world.destruction();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRectPath(ctx, barX + 52, 16, 150, 20, 10);
  ctx.fill();
  ctx.fillStyle = '#ff9d2e';
  if (pct > 0.02) {
    roundRectPath(ctx, barX + 52, 16, Math.max(20, 150 * pct), 20, 10);
    ctx.fill();
  }
  drawTextOutlined(ctx, `${Math.round(pct * 100)}%`, barX + 210, 35, 17, '#ffffff');
  // Score, right.
  drawTextOutlined(ctx, `SCORE ${totalScore.toLocaleString('en-US')}`, FIELD.width - 18, 35, 22, '#ffffff', 'right');
  // Ammo tray.
  for (const rect of ammoSlotRects(world)) {
    const count = world.state.ammo[rect.type];
    const selected = world.state.selected === rect.type && world.state.phase === 'aim';
    ctx.fillStyle = selected ? 'rgba(255, 210, 62, 0.28)' : 'rgba(24, 14, 24, 0.55)';
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = selected ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.stroke();
    ctx.globalAlpha = count > 0 ? 1 : 0.35;
    drawShotIcon(ctx, rect.type, rect.x + 26, rect.y + 30, 15);
    ctx.globalAlpha = 1;
    drawTextOutlined(ctx, `×${count}`, rect.x + 46, rect.y + 38, 20, count > 0 ? '#ffffff' : '#c9a98a');
    drawText(ctx, SHOT_TYPES[rect.type].key, rect.x + 8, rect.y + 16, 12, '#f6b25c');
  }
  // Round buttons.
  for (const button of HUD_BUTTONS) {
    ctx.fillStyle = 'rgba(24, 14, 24, 0.55)';
    ctx.beginPath();
    ctx.arc(button.x, button.y, button.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const label = button.id === 'mute' && muted ? '×' : button.label;
    drawText(ctx, label, button.x, button.y + 6, 16, '#ffd98a', 'center');
  }
  // First-level hint while the player has not aimed yet.
  if (world.state.levelIndex === 0 && world.state.phase === 'aim' && world.state.shotsUsed === 0) {
    const pulse = 0.7 + Math.sin(time * 3) * 0.3;
    ctx.globalAlpha = pulse;
    drawTextOutlined(ctx, 'DRAG BACK, AIM, RELEASE!', 330, 470, 22, '#ffd23e', 'center');
    ctx.globalAlpha = 1;
  }
}
