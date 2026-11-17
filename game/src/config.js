// Every tuning number, colour and material in one place. The playfield is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule below depends on the screen
// size. Physics runs in pixels, with gravity in pixels per second squared.

export const FIELD = { width: 1280, height: 720, groundY: 648 };

/** The simulation's fixed step, in seconds, and how many physics substeps each step takes. */
export const STEP = 1 / 60;
export const SUBSTEPS = 2;
/** Sequential-impulse solver passes per substep. */
export const SOLVER_ITERATIONS = 10;

export const GRAVITY = 1500;
/** Hard caps so a wild collision can never fling a body off the map in one step. */
export const MAX_SPEED = 1600;
export const MAX_SPIN = 14;

/** The trebuchet's pivot and arm: the sling tip is where a shot is born. */
export const TREBUCHET = { x: 150, pivotY: 556, armLength: 84, wheelY: 648 };

/** Drag length in pixels maps to launch speed between these bounds. */
export const AIM = { minDrag: 30, maxDrag: 260, minPower: 320, maxPower: 1180 };

/** Block and defender materials: density sets mass, health sets breakage, friction grips. */
export const MATERIALS = {
  wood: { density: 0.9, health: 34, friction: 0.62, restitution: 0.02, burnable: true },
  sandstone: { density: 1.6, health: 78, friction: 0.72, restitution: 0.02, burnable: false },
  iron: { density: 2.7, health: 175, friction: 0.5, restitution: 0.05, burnable: false },
  defender: { density: 1.1, health: 1, friction: 0.8, restitution: 0.0, burnable: false },
  ground: { density: 0, health: Infinity, friction: 0.85, restitution: 0.0, burnable: false },
};

/** How much normal impulse, past the threshold, turns into one point of damage. */
export const DAMAGE = { threshold: 900, scale: 0.012, defenderThreshold: 260 };

/** Sleep: a body at rest this long, this slow, stops simulating until something wakes it. */
export const SLEEP = { linear: 25, angular: 0.5, time: 0.4, wakeSpeed: 70 };

/** The four shots. `unlock` is the first level that offers the type. */
export const SHOT_TYPES = {
  rock: { key: '1', name: 'Rock', radius: 13, density: 3.2, unlock: 1, hint: 'Heavy smash' },
  bomb: { key: '2', name: 'Bomb', radius: 14, density: 2.4, unlock: 2, hint: 'Explodes on impact' },
  splitter: { key: '3', name: 'Splitter', radius: 12, density: 2.8, unlock: 4, hint: 'Bursts into three' },
  firepot: { key: '4', name: 'Firepot', radius: 12, density: 2.2, unlock: 6, hint: 'Sets wood ablaze' },
};
export const SHOT_ORDER = ['rock', 'bomb', 'splitter', 'firepot'];

export const BLAST = { radius: 135, impulse: 620, damage: 55, defenderRadius: 165 };
export const SPLIT = { shards: 3, spread: 0.5, speed: 0.72, radius: 8 };
export const FIRE = { radius: 95, dps: 26, spreadSeconds: 1.6, lifetime: 6 };

/** Seconds of stillness before the game judges a shot settled and scores the level. */
export const SETTLE_SECONDS = 0.9;
/** A shot that flies this far out is gone for good. */
export const WORLD_BOUNDS = { left: -160, right: 1460, top: -420, bottom: 980 };

export const PALETTE = {
  skyTop: '#222a4e',
  skyMid: '#b4502e',
  skyLow: '#e8823f',
  horizon: '#f6b25c',
  sun: '#ffd98a',
  sunGlow: '#ff9d4d',
  cloud: '#f2a06a',
  duneFar: '#8a4a34',
  duneNear: '#5f3125',
  ground: '#d9a05b',
  groundDark: '#b57e42',
  groundEdge: '#8a5a2c',
  sandstone: '#e2b273',
  sandstoneDark: '#b98a4e',
  sandstoneLine: '#a87c44',
  wood: '#9c6d40',
  woodDark: '#7a5230',
  woodLine: '#66401f',
  iron: '#5c6672',
  ironDark: '#3e4650',
  ironLine: '#2c333c',
  ironRivet: '#98a2ad',
  robe: '#2e6f8e',
  robeDark: '#20506a',
  helmet: '#e8c25a',
  helmetDark: '#b8933a',
  rock: '#6d6a66',
  rockDark: '#4c4945',
  bomb: '#33393f',
  bombFuse: '#e8823f',
  firepot: '#a8432a',
  flame: '#ff9d2e',
  flameCore: '#ffe08a',
  text: '#fff6e8',
  muted: '#e8c9a0',
  panel: 'rgba(28, 18, 38, 0.86)',
  panelEdge: '#f6b25c',
  hudBar: 'rgba(28, 18, 38, 0.72)',
  good: '#8fd07a',
  warn: '#ff9d4d',
  bad: '#ff6a5e',
  aimDot: '#fff6e8',
  aimLine: 'rgba(255, 246, 232, 0.85)',
  star: '#ffd76a',
  starEmpty: 'rgba(255, 246, 232, 0.28)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'sunset-siege.progress';
