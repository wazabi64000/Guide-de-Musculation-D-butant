/**
 * Short countdown beeps via Web Audio API (no MP3 dependency).
 */
let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export async function unlockBeeps() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Single beep. Higher pitch for the final beep of a sequence.
 */
export function playBeep({ frequency = 880, duration = 0.12, volume = 0.22 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}

/**
 * 3 beeps: bip… bip… bip! (last one higher)
 * Returns a promise that resolves when the sequence finishes (~3s).
 */
export function playTripleBeep({ intervalMs = 900, signal } = {}) {
  return new Promise(async (resolve) => {
    await unlockBeeps();
    const pitches = [740, 740, 1100];

    for (let i = 0; i < 3; i += 1) {
      if (signal?.aborted) {
        resolve(false);
        return;
      }
      playBeep({ frequency: pitches[i], duration: i === 2 ? 0.2 : 0.12, volume: 0.28 });
      if (i < 2) {
        await wait(intervalMs, signal);
      }
    }
    // small pause after last beep
    await wait(200, signal);
    resolve(!signal?.aborted);
  });
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true }
    );
  });
}
