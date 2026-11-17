// A small rigid-body engine for oriented rectangles and circles: gravity, SAT collision with
// face clipping, sequential-impulse solving with friction and restitution, sleep, and damage
// from impact impulses. No browser in here: the same code runs the game and the Node tests.
//
// Bodies are plain data so a world can be cloned with JSON. Units are pixels; mass is density
// times area over 1000, so a plank weighs about 2 and a stone block about 6.
import { DAMAGE, GRAVITY, MATERIALS, MAX_SPEED, MAX_SPIN, SLEEP, WORLD_BOUNDS } from './config.js';

const SLOP = 0.5;
const BAUMGARTE = 0.2;
const CORRECTION = 0.4;
const REST_VELOCITY = 60;
const CRUSH_PENETRATION = 5;

let nextBodyId = 1;

function computeMass(body) {
  if (body.staticBody) {
    body.mass = 0;
    body.invMass = 0;
    body.inertia = 0;
    body.invInertia = 0;
    return;
  }
  const material = MATERIALS[body.material];
  const density = body.densityOverride ?? material.density;
  const area = body.shape === 'circle' ? Math.PI * body.r * body.r : body.hw * 2 * body.hh * 2;
  body.mass = (density * area) / 1000;
  body.invMass = 1 / body.mass;
  body.inertia = body.shape === 'circle'
    ? (body.mass * body.r * body.r) / 2
    : (body.mass * (body.hw * body.hw * 4 + body.hh * body.hh * 4)) / 12;
  body.invInertia = 1 / body.inertia;
}

export function makeBox(spec) {
  const body = {
    id: nextBodyId,
    kind: spec.kind ?? 'block',
    shape: 'box',
    material: spec.material ?? 'sandstone',
    x: spec.x, y: spec.y, angle: spec.angle ?? 0,
    vx: 0, vy: 0, av: 0,
    hw: spec.w / 2, hh: spec.h / 2, r: 0,
    staticBody: spec.staticBody ?? false,
    health: 0, maxHealth: 0,
    sleeping: spec.sleeping ?? false, sleepTime: 0,
    dead: false, burning: false, burnTime: 0, heat: 0,
    stepImpulse: 0, crush: 0, contacts: 0,
    seed: spec.seed ?? 0,
  };
  nextBodyId += 1;
  body.health = MATERIALS[body.material].health;
  body.maxHealth = body.health;
  computeMass(body);
  return body;
}

export function makeCircle(spec) {
  const body = {
    id: nextBodyId,
    kind: spec.kind ?? 'defender',
    shape: 'circle',
    material: spec.material ?? 'defender',
    x: spec.x, y: spec.y, angle: 0,
    vx: 0, vy: 0, av: 0,
    hw: 0, hh: 0, r: spec.r,
    staticBody: false,
    health: 0, maxHealth: 0,
    sleeping: false, sleepTime: 0,
    dead: false, burning: false, burnTime: 0, heat: 0,
    stepImpulse: 0, crush: 0, contacts: 0,
    seed: spec.seed ?? 0,
    shotType: spec.shotType ?? null,
    densityOverride: spec.density ?? null,
    fuse: spec.fuse ?? 0,
    splitDone: false,
    restTime: 0,
  };
  nextBodyId += 1;
  body.health = MATERIALS[body.material].health;
  body.maxHealth = body.health;
  computeMass(body);
  return body;
}

export function resetBodyIds() {
  nextBodyId = 1;
}

function cornersOf(body) {
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  const { hw, hh } = body;
  return [
    { x: body.x + (-hw * c - -hh * s), y: body.y + (-hw * s + -hh * c) },
    { x: body.x + (hw * c - -hh * s), y: body.y + (hw * s + -hh * c) },
    { x: body.x + (hw * c - hh * s), y: body.y + (hw * s + hh * c) },
    { x: body.x + (-hw * c - hh * s), y: body.y + (-hw * s + hh * c) },
  ];
}

function axesOf(body) {
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  return [{ x: c, y: s }, { x: -s, y: c }];
}

function project(corners, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of corners) {
    const d = p.x * axis.x + p.y * axis.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

function aabbOf(body) {
  if (body.shape === 'circle') {
    return { minX: body.x - body.r, maxX: body.x + body.r, minY: body.y - body.r, maxY: body.y + body.r };
  }
  const corners = cornersOf(body);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

function clipSegment(points, nx, ny, offset) {
  // Keep the part of the segment on the near side of the plane n.p <= offset.
  const out = [];
  if (points.length === 0) return out;
  let prev = points[points.length - 1];
  let prevDist = prev.x * nx + prev.y * ny - offset;
  for (const point of points) {
    const dist = point.x * nx + point.y * ny - offset;
    if (dist <= 0) {
      if (prevDist > 0) {
        const t = prevDist / (prevDist - dist);
        out.push({ x: prev.x + (point.x - prev.x) * t, y: prev.y + (point.y - prev.y) * t });
      }
      out.push(point);
    } else if (prevDist <= 0) {
      const t = prevDist / (prevDist - dist);
      out.push({ x: prev.x + (point.x - prev.x) * t, y: prev.y + (point.y - prev.y) * t });
    }
    prev = point;
    prevDist = dist;
  }
  return out;
}

/** Box-box manifold by SAT plus reference/incident face clipping (Box2D Lite style). */
function collideBoxes(a, b, contacts) {
  const cornersA = cornersOf(a);
  const cornersB = cornersOf(b);
  const axesA = axesOf(a);
  const axesB = axesOf(b);
  let bestPen = Infinity;
  let bestAxis = null;
  let bestFromA = true;
  const axes = [
    { axis: axesA[0], fromA: true }, { axis: axesA[1], fromA: true },
    { axis: axesB[0], fromA: false }, { axis: axesB[1], fromA: false },
  ];
  for (const { axis, fromA } of axes) {
    const pa = project(cornersA, axis);
    const pb = project(cornersB, axis);
    const pen = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (pen < -0.5) return;
    if (pen < bestPen) {
      bestPen = pen;
      bestAxis = axis;
      bestFromA = fromA;
    }
  }
  // The normal points from A to B.
  const centre = { x: b.x - a.x, y: b.y - a.y };
  let nx = bestAxis.x;
  let ny = bestAxis.y;
  if (nx * centre.x + ny * centre.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  const ref = bestFromA ? a : b;
  const inc = bestFromA ? b : a;
  const refNormal = bestFromA ? { x: nx, y: ny } : { x: -nx, y: -ny };
  // Reference face: the face of `ref` most facing refNormal. Incident face: the most
  // anti-parallel face of `inc`.
  const refCorners = bestFromA ? cornersA : cornersB;
  const incCorners = bestFromA ? cornersB : cornersA;
  let refIndex = 0;
  let refBest = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    const d = refCorners[i].x * refNormal.x + refCorners[i].y * refNormal.y;
    if (d > refBest) {
      refBest = d;
      refIndex = i;
    }
  }
  const refFace = [refCorners[refIndex], refCorners[(refIndex + 1) % 4]];
  const tangent = { x: refFace[1].x - refFace[0].x, y: refFace[1].y - refFace[0].y };
  const tangentLen = Math.hypot(tangent.x, tangent.y) || 1;
  tangent.x /= tangentLen;
  tangent.y /= tangentLen;
  let incIndex = 0;
  let incBest = Infinity;
  for (let i = 0; i < 4; i += 1) {
    const d = incCorners[i].x * refNormal.x + incCorners[i].y * refNormal.y;
    if (d < incBest) {
      incBest = d;
      incIndex = i;
    }
  }
  let segment = [incCorners[incIndex], incCorners[(incIndex + 1) % 4]];
  const refOffset = refFace[0].x * refNormal.x + refFace[0].y * refNormal.y;
  const sideA = refFace[0].x * tangent.x + refFace[0].y * tangent.y;
  const sideB = refFace[1].x * tangent.x + refFace[1].y * tangent.y;
  const lo = Math.min(sideA, sideB);
  const hi = Math.max(sideA, sideB);
  segment = clipSegment(segment, tangent.x, tangent.y, hi);
  segment = clipSegment(segment, -tangent.x, -tangent.y, -lo);
  for (const point of segment) {
    const separation = point.x * refNormal.x + point.y * refNormal.y - refOffset;
    if (separation <= 0.5) {
      contacts.push({
        a, b, px: point.x, py: point.y, nx, ny,
        pen: Math.max(0, -separation), jn: 0, jt: 0,
        massN: 0, massT: 0, bias: 0, restitution: 0, friction: 0,
      });
    }
  }
}

function collideCircleBox(circle, box, contacts) {
  const c = Math.cos(-box.angle);
  const s = Math.sin(-box.angle);
  const dx = circle.x - box.x;
  const dy = circle.y - box.y;
  const localX = dx * c - dy * s;
  const localY = dx * s + dy * c;
  const clampedX = Math.max(-box.hw, Math.min(box.hw, localX));
  const clampedY = Math.max(-box.hh, Math.min(box.hh, localY));
  let nx;
  let ny;
  let pen;
  if (clampedX === localX && clampedY === localY) {
    // Centre inside the box: push out along the smallest exit.
    const exitX = box.hw - Math.abs(localX);
    const exitY = box.hh - Math.abs(localY);
    if (exitX < exitY) {
      nx = localX >= 0 ? 1 : -1;
      ny = 0;
      pen = exitX + circle.r;
    } else {
      nx = 0;
      ny = localY >= 0 ? 1 : -1;
      pen = exitY + circle.r;
    }
    const wc = Math.cos(box.angle);
    const ws = Math.sin(box.angle);
    const worldNx = nx * wc - ny * ws;
    const worldNy = nx * ws + ny * wc;
    contacts.push({
      a: box, b: circle, px: circle.x, py: circle.y,
      nx: worldNx, ny: worldNy, pen, jn: 0, jt: 0,
      massN: 0, massT: 0, bias: 0, restitution: 0, friction: 0,
    });
    return;
  }
  const diffX = localX - clampedX;
  const diffY = localY - clampedY;
  const distSq = diffX * diffX + diffY * diffY;
  if (distSq >= (circle.r + 0.5) * (circle.r + 0.5)) return;
  const dist = Math.sqrt(distSq) || 0.0001;
  const localNx = diffX / dist;
  const localNy = diffY / dist;
  const wc = Math.cos(box.angle);
  const ws = Math.sin(box.angle);
  const worldNx = localNx * wc - localNy * ws;
  const worldNy = localNx * ws + localNy * wc;
  const worldClosestX = box.x + clampedX * wc - clampedY * ws;
  const worldClosestY = box.y + clampedX * ws + clampedY * wc;
  contacts.push({
    a: box, b: circle, px: worldClosestX, py: worldClosestY,
    nx: worldNx, ny: worldNy, pen: circle.r - dist, jn: 0, jt: 0,
    massN: 0, massT: 0, bias: 0, restitution: 0, friction: 0,
  });
}

function collideCircles(a, b, contacts) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  const radii = a.r + b.r;
  if (distSq >= (radii + 0.5) * (radii + 0.5)) return;
  const dist = Math.sqrt(distSq) || 0.0001;
  contacts.push({
    a, b,
    px: a.x + (dx / dist) * a.r, py: a.y + (dy / dist) * a.r,
    nx: dx / dist, ny: dy / dist, pen: radii - dist, jn: 0, jt: 0,
    massN: 0, massT: 0, bias: 0, restitution: 0, friction: 0,
  });
}

function applyImpulse(body, jx, jy, px, py) {
  if (body.invMass === 0 || body.sleeping) return;
  body.vx += jx * body.invMass;
  body.vy += jy * body.invMass;
  const rx = px - body.x;
  const ry = py - body.y;
  body.av += body.invInertia * (rx * jy - ry * jx);
}

// Sleeping bodies are immovable for the solver: infinite mass until something wakes them.
function effInvMass(body) {
  return body.invMass === 0 || body.sleeping ? 0 : body.invMass;
}

function effInvInertia(body) {
  return body.invMass === 0 || body.sleeping ? 0 : body.invInertia;
}

function wakeBody(body) {
  if (body.staticBody) return;
  body.sleeping = false;
  body.sleepTime = 0;
}

export function createPhysics() {
  const bodies = [];
  const contacts = [];

  function addBody(body) {
    bodies.push(body);
    return body;
  }

  function detectContacts() {
    contacts.length = 0;
    for (const body of bodies) body.contacts = 0;
    const boxes = [];
    for (const body of bodies) {
      if (body.dead) continue;
      boxes.push({ body, aabb: aabbOf(body) });
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.body.invMass === 0 && b.body.invMass === 0) continue;
        if (a.aabb.maxX < b.aabb.minX || b.aabb.maxX < a.aabb.minX
          || a.aabb.maxY < b.aabb.minY || b.aabb.maxY < a.aabb.minY) continue;
        const before = contacts.length;
        if (a.body.shape === 'box' && b.body.shape === 'box') collideBoxes(a.body, b.body, contacts);
        else if (a.body.shape === 'circle' && b.body.shape === 'box') collideCircleBox(a.body, b.body, contacts);
        else if (a.body.shape === 'box' && b.body.shape === 'circle') collideCircleBox(b.body, a.body, contacts);
        else collideCircles(a.body, b.body, contacts);
        if (contacts.length > before) {
          a.body.contacts += 1;
          b.body.contacts += 1;
        }
      }
    }
  }

  function prepareContacts(dt) {
    for (const contact of contacts) {
      const { a, b } = contact;
      const matA = MATERIALS[a.material];
      const matB = MATERIALS[b.material];
      contact.friction = Math.sqrt(matA.friction * matB.friction);
      contact.restitution = Math.max(matA.restitution, matB.restitution);
      const rax = contact.px - a.x;
      const ray = contact.py - a.y;
      const rbx = contact.px - b.x;
      const rby = contact.py - b.y;
      const rnA = rax * contact.ny - ray * contact.nx;
      const rnB = rbx * contact.ny - rby * contact.nx;
      const tx = -contact.ny;
      const ty = contact.nx;
      const rtA = rax * ty - ray * tx;
      const rtB = rbx * ty - rby * tx;
      const rvx = (b.vx - b.av * rby) - (a.vx - a.av * ray);
      const rvy = (b.vy + b.av * rbx) - (a.vy + a.av * rax);
      const vn = rvx * contact.nx + rvy * contact.ny;
      contact.bias = (BAUMGARTE / dt) * Math.max(0, contact.pen - SLOP);
      if (vn < -REST_VELOCITY) contact.bias -= contact.restitution * vn;
      contact.jn = 0;
      contact.jt = 0;
      // A fast awake body wakes a sleeping neighbour it touches. Wake first, so the
      // masses below reflect the woken state instead of treating it as immovable.
      const speedA = Math.hypot(a.vx, a.vy);
      const speedB = Math.hypot(b.vx, b.vy);
      if (a.sleeping && speedB > SLEEP.wakeSpeed) wakeBody(a);
      if (b.sleeping && speedA > SLEEP.wakeSpeed) wakeBody(b);
      contact.invMassA = effInvMass(a);
      contact.invMassB = effInvMass(b);
      const denomN = contact.invMassA + contact.invMassB + effInvInertia(a) * rnA * rnA + effInvInertia(b) * rnB * rnB;
      const denomT = contact.invMassA + contact.invMassB + effInvInertia(a) * rtA * rtA + effInvInertia(b) * rtB * rtB;
      // Both sides immovable (two sleeping bodies at rest): the contact does nothing.
      contact.massN = denomN > 0 ? 1 / denomN : 0;
      contact.massT = denomT > 0 ? 1 / denomT : 0;
    }
  }

  function solveVelocities() {
    for (const contact of contacts) {
      const { a, b } = contact;
      const rax = contact.px - a.x;
      const ray = contact.py - a.y;
      const rbx = contact.px - b.x;
      const rby = contact.py - b.y;
      const rvx = (b.vx - b.av * rby) - (a.vx - a.av * ray);
      const rvy = (b.vy + b.av * rbx) - (a.vy + a.av * rax);
      const vn = rvx * contact.nx + rvy * contact.ny;
      let lambda = (contact.bias - vn) * contact.massN;
      const oldJn = contact.jn;
      contact.jn = Math.max(0, oldJn + lambda);
      lambda = contact.jn - oldJn;
      applyImpulse(a, -lambda * contact.nx, -lambda * contact.ny, contact.px, contact.py);
      applyImpulse(b, lambda * contact.nx, lambda * contact.ny, contact.px, contact.py);
      const tx = -contact.ny;
      const ty = contact.nx;
      const rvx2 = (b.vx - b.av * rby) - (a.vx - a.av * ray);
      const rvy2 = (b.vy + b.av * rbx) - (a.vy + a.av * rax);
      const vt = rvx2 * tx + rvy2 * ty;
      let lambdaT = -vt * contact.massT;
      const maxFriction = contact.friction * contact.jn;
      const oldJt = contact.jt;
      contact.jt = Math.max(-maxFriction, Math.min(maxFriction, oldJt + lambdaT));
      lambdaT = contact.jt - oldJt;
      applyImpulse(a, -lambdaT * tx, -lambdaT * ty, contact.px, contact.py);
      applyImpulse(b, lambdaT * tx, lambdaT * ty, contact.px, contact.py);
    }
  }

  function correctPositions() {
    for (const contact of contacts) {
      const { a, b } = contact;
      const totalInv = contact.invMassA + contact.invMassB;
      if (totalInv === 0) continue;
      const push = CORRECTION * Math.max(0, contact.pen - SLOP);
      if (push <= 0) continue;
      const shareA = contact.invMassA / totalInv;
      const shareB = contact.invMassB / totalInv;
      a.x -= contact.nx * push * shareA;
      a.y -= contact.ny * push * shareA;
      b.x += contact.nx * push * shareB;
      b.y += contact.ny * push * shareB;
    }
  }

  function step(dt, iterations, events) {
    // Fresh per-step tallies for every body, asleep or awake: damage reads them below.
    for (const body of bodies) {
      body.stepImpulse = 0;
      body.crush = 0;
    }
    // Forces and integration for awake bodies.
    for (const body of bodies) {
      if (body.dead || body.staticBody || body.sleeping) continue;
      body.vy += GRAVITY * dt;
      body.vx *= 0.9995;
      body.vy *= 0.9995;
      body.av *= 0.995;
      // Creep damping: slow bodies lose energy fast, so a block resting on a tilted
      // neighbour settles instead of sliding forever at a few pixels per second.
      // A body touching something also gets rolling resistance: a rock rolling along
      // the ground must stop on its own instead of holding the turn hostage. Bodies
      // in free flight keep pure ballistics, so the trajectory preview stays true.
      const creep = Math.hypot(body.vx, body.vy);
      const creepLimit = body.contacts > 0 ? 120 : 50;
      if (creep < creepLimit) {
        const drain = Math.exp(-5 * dt);
        body.vx *= drain;
        body.vy *= drain;
      }
      if (Math.abs(body.av) < 0.5) {
        body.av *= Math.exp(-5 * dt);
      } else if (body.contacts > 0 && body.shape === 'circle' && Math.abs(body.av) < 3) {
        body.av *= Math.exp(-3 * dt);
      }
      const speed = Math.hypot(body.vx, body.vy);
      if (speed > MAX_SPEED) {
        body.vx = (body.vx / speed) * MAX_SPEED;
        body.vy = (body.vy / speed) * MAX_SPEED;
      }
      if (body.av > MAX_SPIN) body.av = MAX_SPIN;
      if (body.av < -MAX_SPIN) body.av = -MAX_SPIN;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.angle += body.av * dt;
    }
    detectContacts();
    prepareContacts(dt);
    for (let i = 0; i < iterations; i += 1) solveVelocities();
    correctPositions();
    // Damage and crush from this step's impulses, then sleep bookkeeping.
    for (const contact of contacts) {
      if (contact.jn > 0) {
        if (contact.jn > contact.a.stepImpulse) contact.a.stepImpulse = contact.jn;
        if (contact.jn > contact.b.stepImpulse) contact.b.stepImpulse = contact.jn;
        if (contact.a.kind === 'defender' && contact.pen > CRUSH_PENETRATION) contact.a.crush = 1;
        if (contact.b.kind === 'defender' && contact.pen > CRUSH_PENETRATION) contact.b.crush = 1;
      }
    }
    for (const body of bodies) {
      if (body.dead || body.staticBody) continue;
      if (body.kind === 'block' || body.kind === 'defender') {
        const over = body.stepImpulse - (body.kind === 'defender' ? DAMAGE.defenderThreshold : DAMAGE.threshold);
        if (over > 0 && body.kind === 'block') {
          body.health -= over * DAMAGE.scale;
        }
        if (body.kind === 'defender' && (over > 0 || body.crush)) {
          body.health = 0;
        }
      }
      if (body.burning) {
        body.burnTime -= dt;
        body.health -= 26 * dt;
        if (body.burnTime <= 0) body.burning = false;
      }
      if (body.health <= 0 && !body.dead && body.kind !== 'shot' && body.kind !== 'shard') {
        body.dead = true;
        events.push({ type: body.kind === 'defender' ? 'defender' : 'break', body });
      }
      // Sleep: still bodies rest; unsupported bodies wake.
      if (body.sleeping) {
        if (body.contacts === 0) wakeBody(body);
        continue;
      }
      const speed = Math.hypot(body.vx, body.vy);
      if (speed < SLEEP.linear && Math.abs(body.av) < SLEEP.angular && body.contacts > 0) {
        body.sleepTime += dt;
        if (body.sleepTime >= SLEEP.time) {
          body.sleeping = true;
          body.vx = 0;
          body.vy = 0;
          body.av = 0;
        }
      } else {
        body.sleepTime = 0;
      }
      // Out of the world.
      if (body.x < WORLD_BOUNDS.left || body.x > WORLD_BOUNDS.right
        || body.y < WORLD_BOUNDS.top || body.y > WORLD_BOUNDS.bottom) {
        body.dead = true;
        events.push({ type: 'lost', body });
      }
    }
    // Loud impacts for sound and dust: only the hardest contact per pair region counts.
    let hardest = null;
    for (const contact of contacts) {
      if (contact.jn > 700 && (hardest === null || contact.jn > hardest.jn)) hardest = contact;
    }
    if (hardest !== null) {
      events.push({ type: 'impact', x: hardest.px, y: hardest.py, strength: hardest.jn });
    }
  }

  function applyBlast(x, y, radius, impulse, damage, events) {
    for (const body of bodies) {
      if (body.dead || body.staticBody) continue;
      const dx = body.x - x;
      const dy = body.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + (body.shape === 'circle' ? body.r : Math.hypot(body.hw, body.hh))) continue;
      const falloff = Math.max(0, 1 - dist / radius);
      const kick = impulse * (0.35 + 0.65 * falloff) * body.invMass * 2.4;
      const nx = dist === 0 ? 0 : dx / dist;
      const ny = dist === 0 ? -1 : dy / dist;
      wakeBody(body);
      body.vx += nx * kick;
      body.vy += ny * kick - 90 * falloff;
      body.av += ((body.id % 5) - 2) * falloff * 1.5;
      if (body.kind === 'block') {
        body.health -= damage * falloff;
        if (body.health <= 0 && !body.dead) {
          body.dead = true;
          events.push({ type: 'break', body });
        }
      } else if (body.kind === 'defender') {
        body.health = 0;
        body.dead = true;
        events.push({ type: 'defender', body });
      }
    }
  }

  function wakeNear(x, y, radius) {
    for (const body of bodies) {
      if (body.dead || body.staticBody || !body.sleeping) continue;
      if (Math.hypot(body.x - x, body.y - y) <= radius) wakeBody(body);
    }
  }

  return { bodies, addBody, step, applyBlast, wakeNear, wakeBody, detectContacts };
}
