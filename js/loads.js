/**
 * Charges de départ prudentes (débutant adulte 40+) + progression.
 */

export const LOAD_TIP =
  'Cette charge est une estimation prudente destinée aux adultes totalement débutants. Si elle est trop facile ou trop difficile, ajustez-la selon votre ressenti.';

/** @type {Record<string, { kg: number|null, region: 'upper'|'lower'|'core'|'none', note?: string }>} */
const DEFAULTS = {
  // Jour 1 — Full Body A
  'fb-a-bench': { kg: 10, region: 'upper' },
  'fb-a-lat-pulldown': { kg: 15, region: 'upper' },
  'fb-a-leg-press': { kg: 30, region: 'lower' },
  'fb-a-military': { kg: 5, region: 'upper' },
  'fb-a-woodchopper': { kg: 10, region: 'core' },
  'fb-a-dips': { kg: null, region: 'upper', note: 'Assistance maximale ou poids du corps' },

  // Jour 2 — Haut (Pecs / Épaules)
  'up-b-incline': { kg: 10, region: 'upper' },
  'up-b-cable-fly': { kg: 8, region: 'upper' },
  'up-b-lat-raise': { kg: 5, region: 'upper' },
  'up-b-rear-delt': { kg: 5, region: 'upper' },
  'up-b-curl': { kg: 10, region: 'upper' },
  'up-b-triceps': { kg: 10, region: 'upper' },

  // Jour 4 — Full Body B
  'fb-b-rdl': { kg: 12, region: 'lower' },
  'fb-b-row': { kg: 15, region: 'upper' },
  'fb-b-cable-lat': { kg: 5, region: 'upper' },
  'fb-b-lunge': { kg: 8, region: 'lower' },
  'fb-b-side-plank': { kg: null, region: 'core', note: 'Poids du corps' },
  'fb-b-push-close': { kg: null, region: 'none', note: 'Poids du corps' },

  // Jour 5 — Bas & Obliques / Cardio
  'low-c-leg-ext': { kg: 10, region: 'lower' },
  'low-c-leg-curl': { kg: 10, region: 'lower' },
  'low-c-calf-press': { kg: 30, region: 'lower' },
  'low-c-russian': { kg: 5, region: 'core' },
  'low-c-leg-raise': { kg: null, region: 'core', note: 'Poids du corps' },
  'low-c-cardio': { kg: null, region: 'none', note: 'Cardio — pas de charge' }
};

export const FEEDBACK_OPTIONS = [
  { id: 'very_easy', label: '😀 Très facile' },
  { id: 'easy', label: '🙂 Facile' },
  { id: 'ok', label: '😐 Correct' },
  { id: 'hard', label: '🥵 Difficile' },
  { id: 'impossible', label: '❌ Impossible' }
];

export function getDefaultLoad(exerciseId) {
  return DEFAULTS[exerciseId] || { kg: null, region: 'upper' };
}

export function formatKg(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ',');
}

export function formatDelta(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (n === 0) return '0 kg';
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatKg(n)} kg`;
}

/**
 * Calcule la prochaine charge recommandée.
 */
export function nextRecommendedWeight({
  usedWeight,
  feedback,
  region,
  setsComplete = true,
  pain = false,
  badForm = false
}) {
  if (usedWeight === null || usedWeight === undefined || region === 'none') {
    return null;
  }

  const current = Math.max(0, Number(usedWeight) || 0);
  let delta = 0;

  if (feedback === 'very_easy') {
    delta = region === 'lower' ? 5 : 2.5;
  } else if (feedback === 'easy') {
    delta = region === 'lower' ? 2.5 : 1;
  } else if (feedback === 'ok') {
    delta = 0;
  } else if (feedback === 'hard') {
    delta = -2.5;
  } else if (feedback === 'impossible') {
    delta = -5;
  }

  if (delta > 0 && (!setsComplete || pain || badForm)) {
    delta = 0;
  }

  const next = Math.round((current + delta) * 2) / 2;
  return Math.max(0, next);
}

export function resolveTodayWeight(exerciseId, saved) {
  const base = getDefaultLoad(exerciseId);
  if (base.kg === null) {
    return { value: null, note: base.note || null, region: base.region };
  }
  if (saved?.nextRecommended != null && !Number.isNaN(Number(saved.nextRecommended))) {
    return { value: Number(saved.nextRecommended), note: null, region: base.region };
  }
  return { value: Number(base.kg), note: null, region: base.region };
}

export function buildLoadSummary(exerciseId, saved, todayValue) {
  const base = getDefaultLoad(exerciseId);
  const recommended =
    saved?.nextRecommended != null ? Number(saved.nextRecommended) : base.kg;
  const lastUsed = saved?.lastUsed != null ? Number(saved.lastUsed) : null;
  const firstUsed = saved?.firstUsed != null ? Number(saved.firstUsed) : null;
  const today = todayValue != null && todayValue !== '' ? Number(todayValue) : recommended;
  const progression =
    firstUsed != null && today != null && !Number.isNaN(today)
      ? today - firstUsed
      : firstUsed != null && recommended != null
        ? recommended - firstUsed
        : null;

  return {
    baseKg: base.kg,
    note: base.note || null,
    region: base.region,
    recommended,
    lastUsed,
    today,
    firstUsed,
    progression,
    hasWeight: base.kg !== null || base.note
  };
}
