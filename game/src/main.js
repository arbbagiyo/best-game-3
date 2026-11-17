// Boot, the frame loop, and all the glue: input routing, drag aiming, screen shake, the
// campaign (progress, stars, score), and the screenshot staging. The world itself lives
// in world.js; this file only drives it and reacts to what it reports.
import {
  AIM, PALETTE, SAVE_KEY, SHOT_ORDER, STEP,
} from './config.js';
import { LEVELS } from './levels.js';
import { PHASE_AIM, PHASE_LOST, PHASE_WON, createLevel, powerForDrag } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createParticles } from './particles.js';
import {
  HUD_BUTTONS, ammoSlotRects, createBackground, drawHUD, drawScene,
} from './render.js';
import {
  drawComplete, drawFailed, drawGameComplete, drawLevelIntro, drawLevelSelect, drawPause, drawTitle,
} from './screens.js';
import { STAGES, runScriptedShot, runScriptedSolve } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();
const background = createBackground();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const staged = shotName && STAGES[shotName] ? STAGES[shotName] : null;

// --- Campaign progress (local only; never leaves the browser). ---
function loadProgress() {
  const fresh = { unlocked: 1, stars: LEVELS.map(() => 0), bestScore: 0 };
  try {
    const saved = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
    if (saved && Array.isArray(saved.stars) && saved.stars.length === LEVELS.length) {
      fresh.unlocked = Math.max(1, Math.min(LEVELS.length, saved.unlocked || 1));
      fresh.stars = saved.stars.map((s) => Math.max(0, Math.min(3, s || 0)));
      fresh.bestScore = saved.bestScore || 0;
    }
  } catch (error) {
    // A missing or blocked store just means a fresh campaign.
  }
  return fresh;
}

const progress = loadProgress();
const banked = LEVELS.map(() => 0);

function saveProgress() {
  if (staged) return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch (error) {
    // Private mode or blocked storage: the campaign just won't persist.
  }
}

function campaignScore() {
  return banked.reduce((sum, value) => sum + value, 0);
}

// --- Game state. ---
let mode = 'title';
let world = createLevel(0);
let particles = createParticles(1000);
let buttons = [];
let drag = null;
let dragMoved = false;
let aimView = { active: false, angle: 0.7, power: 700, valid: false };
let shake = 0;
let time = 0;
let introT = 0;
let completeT = 0;
let endDelay = 0;
let bankedWorld = null;
let accumulator = 0;
let muted = false;
let lastTimestamp = 0;

function startLevel(index) {
  world = createLevel(index);
  particles = createParticles(1000 + index * 77);
  mode = 'play';
  drag = null;
  aimView = { active: false, angle: 0.7, power: 700, valid: false };
  introT = 2.6;
  endDelay = 0;
  bankedWorld = null;
  accumulator = 0;
  shake = 0;
}

function firstUnfinished() {
  const index = progress.stars.findIndex((stars) => stars === 0);
  return index === -1 ? 0 : Math.min(index, progress.unlocked - 1);
}

function bankWin() {
  if (bankedWorld === world) return;
  bankedWorld = world;
  banked[world.state.levelIndex] = world.state.score;
  progress.stars[world.state.levelIndex] = Math.max(
    progress.stars[world.state.levelIndex], world.state.stars,
  );
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, world.state.levelIndex + 2));
  progress.bestScore = Math.max(progress.bestScore, campaignScore());
  saveProgress();
}

// --- Event feedback: every world event becomes particles, shake, or sound. ---
function handleEvents(events) {
  for (const event of events) {
    if (event.type === 'impact') {
      const strength = Math.min(1.6, event.strength / 1500);
      shake = Math.min(10, shake + strength * 4);
      particles.burst(event.x, event.y, Math.round(4 + strength * 8), '#d9a05b', 130 * strength);
      audio.impact(strength);
    } else if (event.type === 'break') {
      const body = event.body;
      particles.debris(body.x, body.y, PALETTE[body.material] || '#b98a4e', 8);
      particles.burst(body.x, body.y, 8, '#e8cfa0', 120);
      shake = Math.min(10, shake + 2.5);
      audio.crumble();
    } else if (event.type === 'defender') {
      particles.sparkle(event.body.x, event.body.y);
      particles.burst(event.body.x, event.body.y, 6, '#e8c25a', 110, 'spark');
      audio.pop();
    } else if (event.type === 'explode') {
      shake = 12;
      particles.burst(event.x, event.y, 26, '#ff9d2e', 320, 'flame');
      particles.burst(event.x, event.y, 18, '#d9a05b', 260);
      particles.smoke(event.x, event.y - 10);
      particles.smoke(event.x, event.y - 20);
      audio.explode();
    } else if (event.type === 'shatter') {
      particles.burst(event.x, event.y, 12, '#c65f33', 200, 'debris');
      particles.burst(event.x, event.y, 10, '#ff9d2e', 140, 'flame');
      audio.shatter();
    } else if (event.type === 'split') {
      particles.burst(event.x, event.y, 8, '#e9e2ff', 160, 'spark');
      audio.click();
    } else if (event.type === 'ignite') {
      particles.flame(event.x, event.y - 8);
      audio.fire();
    }
  }
}

let frameCount = 0;

function burningFlames() {
  for (const body of world.physics.bodies) {
    if (body.dead || !body.burning) continue;
    // Deterministic throttle: flames flicker with the frame counter, not Math.random.
    if ((frameCount + body.id) % 2 === 0) particles.flame(body.x, body.y - body.hh * 0.5);
    if ((frameCount + body.id) % 8 === 0) particles.smoke(body.x, body.y - body.hh);
  }
}

// --- Aiming: drag back from anywhere, release to fire. ---
function updateAimFromDrag() {
  if (!drag) {
    aimView.active = false;
    return;
  }
  const pullX = drag.x - input.pointer.x;
  const pullY = drag.y - input.pointer.y;
  const length = Math.hypot(pullX, pullY);
  if (length < 6) {
    aimView = { active: true, angle: 0.7, power: 700, valid: false };
    return;
  }
  const rawAngle = Math.atan2(-pullY, pullX);
  const angle = Math.max(0.09, Math.min(1.4, rawAngle));
  const valid = length >= AIM.minDrag && rawAngle > -0.25 && rawAngle < 1.55;
  aimView = { active: true, angle, power: powerForDrag(length), valid };
}

function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function pointInCircle(px, py, circle) {
  return Math.hypot(px - circle.x, py - circle.y) <= circle.r;
}

function clickedButton() {
  if (!input.pointer.justUp || dragMoved) return null;
  for (const button of buttons) {
    if (button.disabled) continue;
    if (pointInRect(input.pointer.x, input.pointer.y, button)) return button.id;
  }
  return null;
}

function handlePlayInput() {
  if (input.pressed('KeyM')) {
    muted = audio.toggleMute();
  }
  if (input.pressed('KeyP') || input.pressed('Escape')) {
    mode = 'pause';
    drag = null;
    return;
  }
  if (input.pressed('KeyR')) {
    startLevel(world.state.levelIndex);
    return;
  }
  for (const [index, type] of SHOT_ORDER.entries()) {
    if (input.pressed(`Digit${index + 1}`)) {
      world.select(type);
      audio.click();
    }
  }
  // HUD buttons and ammo slots, clicked on release without a drag.
  if (input.pointer.justUp && !dragMoved) {
    for (const button of HUD_BUTTONS) {
      if (pointInCircle(input.pointer.x, input.pointer.y, button)) {
        if (button.id === 'restart') startLevel(world.state.levelIndex);
        else if (button.id === 'pause') mode = 'pause';
        else if (button.id === 'mute') muted = audio.toggleMute();
        audio.click();
        return;
      }
    }
    for (const rect of ammoSlotRects(world)) {
      if (pointInRect(input.pointer.x, input.pointer.y, rect) && world.state.ammo[rect.type] > 0) {
        world.select(rect.type);
        audio.click();
        return;
      }
    }
  }
  if (world.state.phase !== PHASE_AIM) {
    drag = null;
    return;
  }
  if (input.pointer.justDown) {
    // A press on a HUD control is not the start of a drag.
    const onHud = HUD_BUTTONS.some((b) => pointInCircle(input.pointer.x, input.pointer.y, b))
      || ammoSlotRects(world).some((r) => pointInRect(input.pointer.x, input.pointer.y, r));
    if (!onHud) {
      drag = { x: input.pointer.x, y: input.pointer.y };
      dragMoved = false;
    }
  }
  if (drag && input.pointer.down) {
    if (Math.hypot(input.pointer.x - drag.x, input.pointer.y - drag.y) > 10) dragMoved = true;
    updateAimFromDrag();
  }
  if (drag && input.pointer.justUp) {
    if (aimView.valid && world.fire(aimView.angle, aimView.power)) {
      audio.launch();
      shake = Math.min(10, shake + 2);
    }
    drag = null;
    aimView.active = false;
  }
}

function handleMenuInput() {
  if (input.pressed('KeyM')) muted = audio.toggleMute();
  const id = clickedButton();
  if (mode === 'title') {
    if (input.pressed('Enter') || input.pressed('Space') || id === 'start') {
      audio.unlock();
      audio.click();
      startLevel(firstUnfinished());
    } else if (id === 'levels') {
      audio.click();
      mode = 'levels';
    }
  } else if (mode === 'levels') {
    if (input.pressed('Escape')) mode = 'title';
    if (id === 'back-title') {
      audio.click();
      mode = 'title';
    } else if (id && id.startsWith('level-')) {
      const index = Number(id.slice(6));
      if (index < progress.unlocked) {
        audio.click();
        startLevel(index);
      }
    }
  } else if (mode === 'pause') {
    if (input.pressed('KeyP') || input.pressed('Escape') || id === 'resume') {
      audio.click();
      mode = 'play';
    } else if (id === 'restart-level') {
      audio.click();
      startLevel(world.state.levelIndex);
    } else if (id === 'to-levels') {
      audio.click();
      mode = 'levels';
    } else if (id === 'to-title') {
      audio.click();
      mode = 'title';
    }
  } else if (mode === 'complete') {
    if (input.pressed('Enter') || id === 'next' || id === 'finish') {
      audio.click();
      if (world.state.levelIndex >= LEVELS.length - 1) {
        mode = 'gamecomplete';
      } else {
        startLevel(world.state.levelIndex + 1);
      }
    } else if (input.pressed('KeyR') || id === 'retry') {
      audio.click();
      startLevel(world.state.levelIndex);
    } else if (id === 'to-levels') {
      audio.click();
      mode = 'levels';
    }
  } else if (mode === 'failed') {
    if (input.pressed('Enter') || input.pressed('KeyR') || id === 'retry') {
      audio.click();
      startLevel(world.state.levelIndex);
    } else if (id === 'to-levels') {
      audio.click();
      mode = 'levels';
    }
  } else if (mode === 'gamecomplete') {
    if (id === 'play-again') {
      audio.click();
      startLevel(0);
    } else if (id === 'to-levels') {
      audio.click();
      mode = 'levels';
    }
  }
}

function stepWorld(dt) {
  const timeScale = world.state.slowmo > 0 ? 0.35 : 1;
  accumulator += dt * timeScale;
  let guard = 0;
  while (accumulator >= STEP && guard < 8) {
    const events = world.step(STEP);
    handleEvents(events);
    accumulator -= STEP;
    guard += 1;
  }
  if (guard >= 8) accumulator = 0;
  frameCount += 1;
  burningFlames();
  particles.step(dt);
  shake = Math.max(0, shake - dt * 26);
}

// --- Screenshot staging: drive the real game to a fixed frame, then hold it. ---
function stageShot() {
  // The collapse stage accepts staging overrides (?level=&type=&angle=&power=&hold=)
  // so the most dramatic real frame can be chosen; the defaults are the shipped shot.
  const levelOverride = shotName === 'collapse' ? Number(params.get('level') || 0) : 0;
  world = createLevel(levelOverride ? levelOverride - 1 : staged.levelIndex);
  particles = createParticles(1000 + staged.levelIndex * 77);
  introT = 0;
  if (staged.aim) {
    aimView = { active: true, angle: staged.aim.angle, power: staged.aim.power, valid: true };
  }
  if (staged.script && staged.holdSteps) {
    const holdOverride = Number(params.get('hold') || 0);
    const shot = { ...staged.script[0] };
    if (params.get('type')) shot.type = params.get('type');
    if (params.get('angle')) shot.angle = Number(params.get('angle'));
    if (params.get('power')) shot.power = Number(params.get('power'));
    runScriptedShot(world, shot, holdOverride || staged.holdSteps, handleEvents);
    particles.step(0.12);
  }
  if (staged.script && staged.settle) {
    runScriptedSolve(world, staged.script, handleEvents);
    bankWin();
    completeT = 1.6;
  }
  mode = staged.mode;
  shake = 0;
}

function render() {
  buttons = [];
  ctx.save();
  if (!staged && shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  const showScene = mode !== 'levels';
  if (showScene) {
    drawScene(ctx, background, world, particles, aimView, time);
  } else {
    ctx.drawImage(background, 0, 0);
  }
  ctx.restore();
  if (mode === 'play' || mode === 'pause') {
    drawHUD(ctx, world, campaignScore() + world.state.score, muted, time);
  }
  if (mode === 'play' && introT > 0) {
    drawLevelIntro(ctx, world, Math.min(1, introT));
  }
  if (mode === 'title') drawTitle(ctx, buttons, input.pointer, progress, time);
  else if (mode === 'levels') drawLevelSelect(ctx, buttons, input.pointer, progress);
  else if (mode === 'pause') drawPause(ctx, buttons, input.pointer);
  else if (mode === 'complete') drawComplete(ctx, buttons, input.pointer, world, completeT);
  else if (mode === 'failed') drawFailed(ctx, buttons, input.pointer, world);
  else if (mode === 'gamecomplete') drawGameComplete(ctx, buttons, input.pointer, progress, campaignScore());
}

function frame(timestamp) {
  const dt = Math.min(0.05, lastTimestamp === 0 ? 0.016 : (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;
  if (staged) {
    render();
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  time += dt;
  if (input.pointer.justDown || input.justPressed.size > 0) audio.unlock();
  if (mode === 'play') {
    handlePlayInput();
    stepWorld(dt);
    if (introT > 0) introT -= dt;
    if (world.state.phase === PHASE_WON || world.state.phase === PHASE_LOST) {
      endDelay += dt;
      if (endDelay > 0.9) {
        if (world.state.phase === PHASE_WON) {
          bankWin();
          audio.win();
          completeT = 0;
          mode = 'complete';
        } else {
          audio.lose();
          mode = 'failed';
        }
      }
    } else {
      endDelay = 0;
    }
  } else if (mode === 'complete') {
    completeT += dt;
    handleMenuInput();
    particles.step(dt);
  } else if (mode === 'failed' || mode === 'gamecomplete') {
    handleMenuInput();
    particles.step(dt);
  } else {
    handleMenuInput();
  }
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

if (staged) {
  stageShot();
  time = 0.6;
  render();
  window.__shotReady = true;
}
requestAnimationFrame(frame);
