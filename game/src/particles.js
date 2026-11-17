// Dust, debris, sparks, smoke and flame: short-lived points and shards spawned by game
// events, integrated with the same gravity as the world so they belong to the scene.
import { FIELD, GRAVITY } from './config.js';
import { createRandom } from './rng.js';

export function createParticles(seed) {
  const random = createRandom(seed);
  const list = [];

  function add(x, y, vx, vy, life, size, color, kind, gravity = 1) {
    if (list.length > 420) list.shift();
    list.push({
      x, y, vx, vy, life, maxLife: life, size, color, kind, gravity,
      angle: random() * Math.PI * 2, spin: (random() - 0.5) * 8,
    });
  }

  return {
    list,
    burst(x, y, count, color, speed, kind = 'dust') {
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const power = speed * (0.3 + random() * 0.7);
        add(x, y, Math.cos(angle) * power, Math.sin(angle) * power - speed * 0.35,
          0.5 + random() * 0.7, 2 + random() * 4, color, kind);
      }
    },
    debris(x, y, color, count = 6) {
      for (let i = 0; i < count; i += 1) {
        add(x + (random() - 0.5) * 20, y + (random() - 0.5) * 12,
          (random() - 0.5) * 320, -60 - random() * 260,
          0.8 + random() * 0.9, 3 + random() * 5, color, 'debris');
      }
    },
    flame(x, y) {
      add(x + (random() - 0.5) * 22, y + (random() - 0.5) * 8,
        (random() - 0.5) * 24, -40 - random() * 60,
        0.35 + random() * 0.35, 4 + random() * 6,
        random() < 0.5 ? '#ff9d2e' : '#ffd23e', 'flame', 0);
    },
    smoke(x, y) {
      add(x + (random() - 0.5) * 16, y,
        (random() - 0.5) * 30, -50 - random() * 40,
        0.9 + random() * 0.7, 6 + random() * 7, '#6b5a4a', 'smoke', -0.12);
    },
    sparkle(x, y) {
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * Math.PI * 2;
        add(x, y, Math.cos(angle) * 90, Math.sin(angle) * 90 - 40,
          0.5 + random() * 0.3, 2.5, '#ffd23e', 'spark', 0.25);
      }
    },
    step(dt) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        p.vy += GRAVITY * p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
        if (p.kind === 'debris' && p.y > FIELD.groundY - 2) {
          p.y = FIELD.groundY - 2;
          p.vy *= -0.35;
          p.vx *= 0.6;
        }
        if (p.kind === 'smoke') p.size += dt * 9;
      }
    },
    clear() {
      list.length = 0;
    },
  };
}
