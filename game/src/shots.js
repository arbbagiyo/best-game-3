// Deterministic screenshot staging. Every shot drives the real game: the same world
// stepping, the same rendering, no special-case drawing. The physics has no randomness,
// so a scripted shot fired for a fixed number of steps always lands on the same frame.
import { STEP } from './config.js';

export const STAGES = {
  title: { levelIndex: 0, mode: 'title' },
  play: { levelIndex: 1, mode: 'play', aim: { angle: 0.62, power: 1060 } },
  collapse: {
    levelIndex: 7, mode: 'play',
    script: [{ type: 'bomb', angle: 28, power: 1060 }],
    holdSteps: 130,
  },
  complete: {
    levelIndex: 1, mode: 'complete',
    script: [
      { type: 'bomb', angle: 48, power: 1060 },
      { type: 'rock', angle: 58, power: 1060 },
      { type: 'rock', angle: 38, power: 1060 },
    ],
    settle: true,
  },
};

/** Fire one scripted shot and step a fixed number of fixed steps, returning all events. */
export function runScriptedShot(world, shot, steps, onEvents) {
  world.select(shot.type);
  world.fire((shot.angle * Math.PI) / 180, shot.power);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP);
    if (onEvents) onEvents(events);
    if (world.state.phase !== 'flying') break;
  }
}

/** Fire scripted shots one by one, waiting for each to settle, until the level is won. */
export function runScriptedSolve(world, script, onEvents) {
  const maxSteps = Math.round(9 / STEP);
  for (const shot of script) {
    runScriptedShot(world, shot, maxSteps, onEvents);
    if (world.state.phase === 'won' || world.state.phase === 'lost') break;
  }
}
