// The game's rules and state, with no drawing and no browser in it: the level's fortress,
// the ammunition, aiming and firing, settling, winning and losing, score and stars. step()
// advances fixed steps and returns what happened as events, so the caller can react with
// particles and sound without the world knowing about them. State is plain data, so a whole
// world can be snapshotted and restored: the screenshot staging searches shots that way.
import {
  AIM, FIELD, GRAVITY, SETTLE_SECONDS, SHOT_ORDER, SOLVER_ITERATIONS, STEP, SUBSTEPS, TREBUCHET,
} from './config.js';
import { LEVELS } from './levels.js';
import { buildFortress, defendersStanding, destructionFraction } from './fortress.js';
import { createPhysics, resetBodyIds } from './physics.js';
import { launchShot, spreadFire, updateShots } from './projectiles.js';

export const PHASE_AIM = 'aim';
export const PHASE_FLYING = 'flying';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

function slingTip(angle) {
  return {
    x: TREBUCHET.x + Math.cos(angle) * TREBUCHET.armLength,
    y: TREBUCHET.pivotY - Math.sin(angle) * TREBUCHET.armLength,
  };
}

/** The launch speed for a drag of `length` pixels. */
export function powerForDrag(length) {
  const t = Math.max(0, Math.min(1, (length - AIM.minDrag) / (AIM.maxDrag - AIM.minDrag)));
  return AIM.minPower + t * (AIM.maxPower - AIM.minPower);
}

/** Where a shot launched from the sling with this angle and power will be after t seconds. */
export function trajectoryPoint(angle, power, t) {
  const tip = slingTip(angle);
  return {
    x: tip.x + Math.cos(angle) * power * t,
    y: tip.y - Math.sin(angle) * power * t + 0.5 * GRAVITY * t * t,
  };
}

export function createLevel(levelIndex) {
  const level = LEVELS[levelIndex];
  resetBodyIds();
  const physics = createPhysics();
  const fortress = buildFortress(physics, level, levelIndex * 1000);
  const ammo = {};
  for (const type of SHOT_ORDER) ammo[type] = level.shots[type] ?? 0;
  const state = {
    levelIndex,
    phase: PHASE_AIM,
    ammo,
    selected: SHOT_ORDER.find((type) => ammo[type] > 0) ?? 'rock',
    shotsUsed: 0,
    score: 0,
    elapsed: 0,
    stillTime: 0,
    slowmo: 0,
    armKick: 0,
    aim: { active: false, angle: 0.7, power: 700, valid: false },
    wonAt: 0,
    stars: 0,
    winBonus: 0,
  };

  function shotsLeft() {
    return SHOT_ORDER.reduce((sum, type) => sum + state.ammo[type], 0);
  }

  function liveShots() {
    for (const body of physics.bodies) {
      if (!body.dead && (body.kind === 'shot' || body.kind === 'shard')) return true;
    }
    return false;
  }

  function worldStill() {
    for (const body of physics.bodies) {
      if (body.dead || body.staticBody || body.sleeping) continue;
      if (Math.hypot(body.vx, body.vy) > 40 || Math.abs(body.av) > 0.6) return false;
    }
    return true;
  }

  /** Freeze every resting body: called when a shot settles so nothing creeps or rocks. */
  function freezeWorld() {
    for (const body of physics.bodies) {
      if (body.dead || body.staticBody) continue;
      if (body.contacts > 0) {
        body.sleeping = true;
        body.vx = 0;
        body.vy = 0;
        body.av = 0;
        body.sleepTime = 1;
      }
    }
  }

  function destruction() {
    return destructionFraction(fortress);
  }

  function judge() {
    if (defendersStanding(fortress) === 0) {
      state.phase = PHASE_WON;
      state.wonAt = state.elapsed;
      state.winBonus = shotsLeft() * 250;
      state.score += state.winBonus;
      state.stars = state.shotsUsed <= level.par ? 3 : state.shotsUsed <= level.par + 2 ? 2 : 1;
    } else if (shotsLeft() === 0) {
      state.phase = PHASE_LOST;
    } else {
      state.phase = PHASE_AIM;
    }
    state.stillTime = 0;
  }

  function fire(angle, power) {
    if (state.phase !== PHASE_AIM || state.ammo[state.selected] <= 0) return false;
    const tip = slingTip(angle);
    launchShot(physics, state.selected, tip.x, tip.y, Math.cos(angle) * power, -Math.sin(angle) * power);
    state.ammo[state.selected] -= 1;
    state.shotsUsed += 1;
    state.phase = PHASE_FLYING;
    state.stillTime = 0;
    state.armKick = 1;
    if (state.ammo[state.selected] <= 0) {
      state.selected = SHOT_ORDER.find((type) => state.ammo[type] > 0) ?? state.selected;
    }
    return true;
  }

  function step(dt) {
    const events = [];
    state.elapsed += dt;
    if (state.armKick > 0) state.armKick = Math.max(0, state.armKick - dt * 2.4);
    if (state.slowmo > 0) state.slowmo = Math.max(0, state.slowmo - dt);
    const sub = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i += 1) {
      physics.step(sub, SOLVER_ITERATIONS, events);
      updateShots(physics, sub, events);
      spreadFire(physics, sub, events);
    }
    for (const event of events) {
      if (event.type === 'defender') {
        state.score += 500;
        if (defendersStanding(fortress) === 0 && state.phase === PHASE_FLYING) state.slowmo = 1.0;
      } else if (event.type === 'break') {
        state.score += 25;
      }
    }
    // Prune the dead so the body list stays short.
    for (let i = physics.bodies.length - 1; i >= 0; i -= 1) {
      if (physics.bodies[i].dead) physics.bodies.splice(i, 1);
    }
    if (state.phase === PHASE_FLYING) {
      if (!liveShots() && worldStill()) {
        state.stillTime += dt;
        if (state.stillTime >= SETTLE_SECONDS && state.slowmo <= 0) {
          freezeWorld();
          judge();
        }
      } else {
        state.stillTime = 0;
      }
      // Failsafe: a shot never holds the game hostage. After 8 seconds, freeze
      // whatever is left rocking and judge the level as it stands.
      state.flyingTime = (state.flyingTime ?? 0) + dt;
      if (state.flyingTime > 8 && !liveShots() && state.slowmo <= 0) {
        freezeWorld();
        judge();
      }
    } else {
      state.flyingTime = 0;
    }
    if (state.phase === PHASE_AIM) {
      // A teetering block can fall after the world settled: re-judge if the outcome
      // changed under the player (last defender crushed, or no shots left).
      if (defendersStanding(fortress) === 0) {
        freezeWorld();
        judge();
      } else if (shotsLeft() === 0 && worldStill()) {
        judge();
      }
    }
    return events;
  }

  /** A deep snapshot of everything the search needs to rewind. */
  function snapshot() {
    return JSON.stringify({
      bodies: physics.bodies,
      ammo: state.ammo,
      selected: state.selected,
      shotsUsed: state.shotsUsed,
      score: state.score,
      elapsed: state.elapsed,
      phase: state.phase,
      stillTime: state.stillTime,
    });
  }

  function restore(data) {
    const parsed = JSON.parse(data);
    physics.bodies.length = 0;
    for (const body of parsed.bodies) physics.bodies.push(body);
    fortress.blocks = physics.bodies.filter((body) => body.kind === 'block');
    fortress.defenders = physics.bodies.filter((body) => body.kind === 'defender');
    state.ammo = parsed.ammo;
    state.selected = parsed.selected;
    state.shotsUsed = parsed.shotsUsed;
    state.score = parsed.score;
    state.elapsed = parsed.elapsed;
    state.phase = parsed.phase;
    state.stillTime = parsed.stillTime;
    state.slowmo = 0;
    state.armKick = 0;
    state.flyingTime = 0;
  }

  return {
    state, physics, fortress, level,
    fire, step, snapshot, restore, shotsLeft, liveShots,
    defendersLeft: () => defendersStanding(fortress),
    destruction,
    select(type) {
      if (state.ammo[type] > 0) state.selected = type;
    },
  };
}

/** Fixed-step driver: advance `world` by whole STEPs, honouring slow motion. */
export function advanceWorld(world, dt, timeScale) {
  const scaled = dt * timeScale;
  let remaining = scaled;
  const events = [];
  while (remaining >= STEP) {
    events.push(...world.step(STEP));
    remaining -= STEP;
  }
  return events;
}

export { FIELD };
