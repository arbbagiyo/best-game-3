// Turns a level definition into physics bodies: the static ground, the fortress blocks and
// the defenders, all starting asleep so a standing fortress never jitters. Also tracks how
// much of the fortress is gone, for the destruction meter and the score.
import { FIELD } from './config.js';
import { makeBox, makeCircle } from './physics.js';

export const DEFENDER_RADIUS = 14;

export function buildFortress(physics, level, seedBase) {
  const ground = makeBox({
    x: FIELD.width / 2, y: FIELD.groundY + 250, w: 2800, h: 500,
    material: 'ground', kind: 'ground', staticBody: true,
  });
  physics.addBody(ground);
  const blocks = [];
  level.blocks.forEach((spec, index) => {
    const body = makeBox({
      x: spec.x, y: spec.b - spec.h / 2 + 0.3, w: spec.w, h: spec.h,
      angle: spec.a ?? 0, material: spec.m, kind: 'block',
      sleeping: true, seed: seedBase + index,
    });
    body.sleepTime = 1;
    physics.addBody(body);
    blocks.push(body);
  });
  const defenders = [];
  level.defenders.forEach((spec, index) => {
    const body = makeCircle({
      x: spec.x, y: spec.b - DEFENDER_RADIUS, r: DEFENDER_RADIUS,
      material: 'defender', kind: 'defender', seed: seedBase + 100 + index,
    });
    body.sleeping = true;
    body.sleepTime = 1;
    physics.addBody(body);
    defenders.push(body);
  });
  const totalHealth = blocks.reduce((sum, body) => sum + body.maxHealth, 0);
  return { ground, blocks, defenders, totalHealth };
}

/** Fraction of the fortress destroyed: broken blocks count fully, hurt ones in part. */
export function destructionFraction(fortress) {
  if (fortress.totalHealth <= 0) return 0;
  let remaining = 0;
  for (const body of fortress.blocks) {
    if (!body.dead) remaining += Math.max(0, body.health);
  }
  return 1 - remaining / fortress.totalHealth;
}

export function defendersStanding(fortress) {
  let count = 0;
  for (const body of fortress.defenders) if (!body.dead) count += 1;
  return count;
}
