/**
 * Bips de compte à rebours via Web Audio API (léger, sans MP3).
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

function emitTone(ctx, {
  frequency,
  start,
  duration,
  volume,
  type = 'sine',
  frequencyEnd
}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (frequencyEnd && frequencyEnd !== frequency) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(80, frequencyEnd),
      start + duration
    );
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

/**
 * Bip du compte à rebond 3 → 2 → 1 avant fin de phase.
 * @param {1|2|3} second — secondes restantes affichées
 * @param {'work'|'rest'} mode — exercice ou repos (timbre légèrement différent)
 */
export function playCountdownBeep(second, { mode = 'work', volume = 0.38 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const isGo = second === 1;
  const isRest = mode === 'rest';

  /** Fréquences type métronome gym : montée progressive, dernier bip plus aigu. */
  const profiles = {
    3: { freq: 494, dur: 0.11, vol: volume * 0.7 },
    2: { freq: 622, dur: 0.11, vol: volume * 0.82 },
    1: {
      freq: isRest ? 988 : 880,
      dur: isGo ? 0.32 : 0.14,
      vol: volume,
      freqEnd: isGo ? (isRest ? 1318 : 1174) : undefined
    }
  };

  const cfg = profiles[second] || profiles[3];

  // Fondamental
  emitTone(ctx, {
    frequency: cfg.freq,
    frequencyEnd: cfg.freqEnd,
    start: now,
    duration: cfg.dur,
    volume: cfg.vol,
    type: 'sine'
  });

  // Harmonique légère pour plus de présence
  emitTone(ctx, {
    frequency: cfg.freq * 2,
    start: now,
    duration: cfg.dur * 0.55,
    volume: cfg.vol * 0.12,
    type: 'triangle'
  });

  // Dernier bip : double impulsion « go »
  if (isGo) {
    emitTone(ctx, {
      frequency: isRest ? 784 : 698,
      start: now + 0.14,
      duration: 0.09,
      volume: cfg.vol * 0.55,
      type: 'square'
    });
    emitTone(ctx, {
      frequency: isRest ? 1174 : 1046,
      frequencyEnd: isRest ? 1568 : 1396,
      start: now + 0.24,
      duration: 0.18,
      volume: cfg.vol * 0.75,
      type: 'sine'
    });
  }
}

/** @deprecated Utiliser playCountdownBeep — conservé pour compatibilité. */
export function playBeep({ frequency = 880, duration = 0.12, volume = 0.22 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  emitTone(ctx, {
    frequency,
    start: ctx.currentTime,
    duration,
    volume
  });
}

export function playTripleBeep({ intervalMs = 700, signal } = {}) {
  return new Promise(async (resolve) => {
    await unlockBeeps();
    const steps = [3, 2, 1];
    for (let i = 0; i < steps.length; i += 1) {
      if (signal?.aborted) {
        resolve(false);
        return;
      }
      playCountdownBeep(steps[i], { volume: 0.36 });
      if (i < 2) await wait(intervalMs, signal);
    }
    await wait(150, signal);
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
