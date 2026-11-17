// The four shots and what they do after launch: the rock is a heavy hammer, the bomb bursts
// on first contact, the splitter breaks into three shards on first contact, and the firepot
// shatters and sets wood ablaze. Fire spreads between touching wooden blocks by heat.
import { BLAST, FIRE, MATERIALS, SHOT_TYPES, SPLIT } from './config.js';
import { makeCircle } from './physics.js';

export function launchShot(physics, type, x, y, vx, vy) {
  const def = SHOT_TYPES[type];
  const shot = makeCircle({
    x, y, r: def.radius, material: 'iron', kind: 'shot',
    shotType: type, density: def.density,
  });
  shot.vx = vx;
  shot.vy = vy;
  physics.addBody(shot);
  return shot;
}

function igniteBody(body, events) {
  if (body.burning || body.dead || body.kind !== 'block') return;
  if (!MATERIALS[body.material].burnable) return;
  body.burning = true;
  body.burnTime = FIRE.lifetime;
  body.heat = 0;
  events.push({ type: 'ignite', x: body.x, y: body.y });
}

export function igniteNear(physics, x, y, radius, events) {
  for (const body of physics.bodies) {
    if (body.kind !== 'block' || body.dead) continue;
    const reach = radius + Math.hypot(body.hw, body.hh);
    if (Math.hypot(body.x - x, body.y - y) <= reach) igniteBody(body, events);
  }
}

function splitShot(physics, shot, events) {
  const speed = Math.hypot(shot.vx, shot.vy);
  const base = Math.atan2(shot.vy, shot.vx);
  for (let i = 0; i < SPLIT.shards; i += 1) {
    const angle = base + (i - 1) * SPLIT.spread;
    const shard = makeCircle({
      x: shot.x, y: shot.y, r: SPLIT.radius, material: 'iron', kind: 'shard',
      shotType: 'rock', density: SHOT_TYPES.splitter.density,
    });
    shard.vx = Math.cos(angle) * speed * SPLIT.speed;
    shard.vy = Math.sin(angle) * speed * SPLIT.speed - 60;
    physics.addBody(shard);
  }
  events.push({ type: 'split', x: shot.x, y: shot.y });
}

/**
 * Advance shot fuses and triggers after the physics step. Bombs and firepots react to their
 * first real contact; the splitter too. Shots that come to rest fade out of the world.
 */
export function updateShots(physics, dt, events) {
  for (const body of physics.bodies) {
    if (body.dead || (body.kind !== 'shot' && body.kind !== 'shard')) continue;
    if (body.kind === 'shard') {
      if (body.sleeping) {
        body.restTime += dt;
        if (body.restTime > 1.2) body.dead = true;
      }
      continue;
    }
    if (body.shotType === 'bomb') {
      if (body.fuse > 0) {
        body.fuse -= dt;
        if (body.fuse <= 0) {
          body.dead = true;
          physics.applyBlast(body.x, body.y, BLAST.radius, BLAST.impulse, BLAST.damage, events);
          events.push({ type: 'explode', x: body.x, y: body.y, strength: 1 });
        }
      } else if (body.contacts > 0) {
        body.fuse = 0.05;
      }
    } else if (body.shotType === 'firepot') {
      if (body.contacts > 0) {
        body.dead = true;
        igniteNear(physics, body.x, body.y, FIRE.radius, events);
        events.push({ type: 'shatter', x: body.x, y: body.y });
      }
    } else if (body.shotType === 'splitter') {
      if (!body.splitDone && body.contacts > 0) {
        body.splitDone = true;
        body.dead = true;
        splitShot(physics, body, events);
      }
    }
    if (body.kind === 'shot' && !body.dead && body.sleeping) {
      body.restTime += dt;
      if (body.restTime > 1.5) body.dead = true;
    }
  }
}

/** Fire creeps from burning blocks to wooden neighbours close enough to catch. */
export function spreadFire(physics, dt, events) {
  const burning = [];
  const wooden = [];
  for (const body of physics.bodies) {
    if (body.dead || body.kind !== 'block') continue;
    if (body.burning) burning.push(body);
    else if (MATERIALS[body.material].burnable) wooden.push(body);
  }
  if (burning.length === 0) return;
  for (const block of wooden) {
    let near = false;
    for (const flame of burning) {
      const reach = 52 + Math.hypot(block.hw, block.hh) * 0.6;
      if (Math.hypot(block.x - flame.x, block.y - flame.y) <= reach) {
        near = true;
        break;
      }
    }
    if (near) {
      block.heat += dt;
      if (block.heat >= FIRE.spreadSeconds) igniteBody(block, events);
    } else {
      block.heat = Math.max(0, block.heat - dt);
    }
  }
}
