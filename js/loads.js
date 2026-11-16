/**
 * Charges de départ prudentes (débutant adulte 40+) + progression.
 */

export const LOAD_TIP =
  'Cette charge est une estimation prudente destinée aux adultes totalement débutants. Si elle est trop facile ou trop difficile, ajustez-la selon votre ressenti.';

/** @type {Record<string, { kg: number|null, region: 'upper'|'lower'|'core'|'none', note?: string }>} */
const DEFAULTS = {
  // Jour 1 — Full Body A
  'chest-press': { kg: 15, region: 'upper' },
  'lat-pulldown': { kg: 15, region: 'upper' },
  'leg-press': { kg: null, region: 'lower', note: 'Poids du corps' },
  'shoulder-press': { kg: 10, region: 'upper' },
  'crunch-machine': { kg: 15, region: 'core' },
  'triceps-pushdown': { kg: 10, region: 'upper' },

  // Jour 2 — Haut (Pecs / Épaules / Bras)
  'incline-press': { kg: 12, region: 'upper' },
  'pec-deck': { kg: 10, region: 'upper' },
  dips: { kg: 10, region: 'upper' },
  'lateral-raise': { kg: 5, region: 'upper' },
  'reverse-fly': { kg: 5, region: 'upper' },
  'biceps-curl': { kg: 10, region: 'upper' },
  'cable-curl': { kg: 10, region: 'upper' },
  'hammer-curl': { kg: 8, region: 'upper' },
  'db-overhead-extension': { kg: 8, region: 'upper' },

  // Jour 4 — Full Body B
  'seated-row': { kg: 15, region: 'upper' },
  'seated-row-horizontal': { kg: 15, region: 'upper' },
  pullover: { kg: 12, region: 'upper' },
  'db-rdl': { kg: null, region: 'lower', note: 'Poids du corps' },
  'leg-extension': { kg: null, region: 'lower', note: 'Poids du corps' },
  plank: { kg: null, region: 'core', note: 'Poids du corps' },

  // Jour 5 — Bas & Obliques
  'goblet-squat': { kg: null, region: 'lower', note: 'Poids du corps' },
  'leg-curl': { kg: null, region: 'lower', note: 'Poids du corps' },
  'hip-thrust': { kg: null, region: 'lower', note: 'Poids du corps' },
  'hip-abduction': { kg: null, region: 'lower', note: 'Poids du corps' },
  'seated-calf': { kg: null, region: 'lower', note: 'Poids du corps' },
  'standing-calf': { kg: null, region: 'lower', note: 'Poids du corps' },
  'russian-twist': { kg: null, region: 'core', note: 'Poids du corps' }
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
  const today = todayValue === '' || todayValue == null ? null : Number(todayValue);
  const progression =
    lastUsed != null && recommended != null && !Number.isNaN(recommended)
      ? recommended - lastUsed
      : null;

  return {
    baseKg: base.kg,
    note: base.note || null,
    region: base.region,
    recommended,
    lastUsed,
    today: Number.isNaN(today) ? null : today,
    progression,
    hasWeight: base.kg !== null || base.note
  };
}
