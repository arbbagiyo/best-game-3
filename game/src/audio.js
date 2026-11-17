// Every sound is synthesized: filtered noise for impacts and dust, sine thumps for
// launches, a low boom for explosions, and a slow two-oscillator pad underneath.
// No audio files, no network. The context starts on the first user gesture.
export function createAudio() {
  let context = null;
  let master = null;
  let padGain = null;
  let muted = false;
  let unlocked = false;

  function ensure() {
    // No context until the first user gesture: creating one earlier is suspended
    // by the browser and spams warnings, and staged screenshots never need sound.
    if (!unlocked) return false;
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return false;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(context.destination);
    startPad();
    return true;
  }

  function startPad() {
    padGain = context.createGain();
    padGain.gain.value = 0.045;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    padGain.connect(filter);
    filter.connect(master);
    for (const [frequency, detune] of [[110, 0], [164.8, 4], [220, -3]]) {
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      osc.connect(padGain);
      osc.start();
    }
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function noise({ seconds, frequency, type = 'lowpass', gain = 0.3, decay = 0.25 }) {
    if (!ensure()) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + decay);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now);
    source.stop(now + seconds);
  }

  function tone({ frequency, endFrequency, seconds, type = 'sine', gain = 0.25, delay = 0 }) {
    if (!ensure()) return;
    const now = context.currentTime + delay;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, now + seconds);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    osc.connect(envelope);
    envelope.connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
  }

  return {
    unlock() {
      unlocked = true;
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.9, context.currentTime, 0.02);
      return muted;
    },
    get muted() {
      return muted;
    },
    launch() {
      noise({ seconds: 0.35, frequency: 900, type: 'bandpass', gain: 0.35, decay: 0.3 });
      tone({ frequency: 160, endFrequency: 60, seconds: 0.28, gain: 0.3 });
    },
    impact(strength = 1) {
      noise({ seconds: 0.18, frequency: 500, gain: 0.22 * strength, decay: 0.16 });
      tone({ frequency: 110, endFrequency: 55, seconds: 0.14, gain: 0.18 * strength });
    },
    crumble() {
      noise({ seconds: 0.5, frequency: 700, gain: 0.3, decay: 0.45 });
    },
    explode() {
      noise({ seconds: 0.7, frequency: 240, gain: 0.6, decay: 0.6 });
      tone({ frequency: 90, endFrequency: 32, seconds: 0.55, gain: 0.5 });
    },
    shatter() {
      noise({ seconds: 0.25, frequency: 3200, type: 'highpass', gain: 0.3, decay: 0.2 });
    },
    pop() {
      tone({ frequency: 520, endFrequency: 880, seconds: 0.14, type: 'triangle', gain: 0.28 });
    },
    fire() {
      noise({ seconds: 0.4, frequency: 1400, type: 'bandpass', gain: 0.12, decay: 0.35 });
    },
    click() {
      tone({ frequency: 660, seconds: 0.07, type: 'triangle', gain: 0.16 });
    },
    star() {
      tone({ frequency: 880, seconds: 0.18, type: 'triangle', gain: 0.22 });
      tone({ frequency: 1320, seconds: 0.24, type: 'triangle', gain: 0.2, delay: 0.09 });
    },
    win() {
      [523, 659, 784, 1047].forEach((frequency, i) => {
        tone({ frequency, seconds: 0.32, type: 'triangle', gain: 0.24, delay: i * 0.13 });
      });
    },
    lose() {
      [392, 330, 262].forEach((frequency, i) => {
        tone({ frequency, seconds: 0.3, type: 'sine', gain: 0.2, delay: i * 0.16 });
      });
    },
  };
}
