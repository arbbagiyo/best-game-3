// Pointer and keyboard, normalized to field coordinates. The game polls this each frame;
// `justDown`/`justUp`/`justPressed` are consumed by endFrame() so a click or keypress is
// seen exactly once. Pointer capture keeps a drag alive outside the canvas edge.
import { FIELD } from './config.js';

export function createInput(canvas) {
  const input = {
    pointer: { x: 0, y: 0, down: false, justDown: false, justUp: false, downX: 0, downY: 0 },
    keys: new Set(),
    justPressed: new Set(),
  };

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    const pos = toField(event);
    input.pointer.x = pos.x;
    input.pointer.y = pos.y;
    input.pointer.downX = pos.x;
    input.pointer.downY = pos.y;
    input.pointer.down = true;
    input.pointer.justDown = true;
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    const pos = toField(event);
    input.pointer.x = pos.x;
    input.pointer.y = pos.y;
  });
  function release(event) {
    const pos = toField(event);
    input.pointer.x = pos.x;
    input.pointer.y = pos.y;
    if (input.pointer.down) input.pointer.justUp = true;
    input.pointer.down = false;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    input.keys.add(event.code);
    input.justPressed.add(event.code);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.pointer.down = false;
  });

  input.pressed = (code) => input.justPressed.has(code);
  input.endFrame = () => {
    input.pointer.justDown = false;
    input.pointer.justUp = false;
    input.justPressed.clear();
  };
  return input;
}
