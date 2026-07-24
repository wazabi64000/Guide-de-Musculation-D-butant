/**
 * Charges de départ prudentes (débutant adulte 40+) + progression.
 */

export const LOAD_TIP =
  'Cette charge est une estimation prudente destinée aux adultes totalement débutants. Si elle est trop facile ou trop difficile, ajustez-la selon votre ressenti.';

/** @type {Record<string, { kg: number|null, region: 'upper'|'lower'|'core'|'none', note?: string }>} */
const DEFAULTS = {
  'chest-press': { kg: 10, region: 'upper' },
  'incline-press': { kg: 10, region: 'upper' },
  'pec-deck': { kg: 10, region: 'upper' },
  'cable-fly': { kg: 5, region: 'upper' },
  'db-bench-press': { kg: 8, region: 'upper' },
  'lat-pulldown': { kg: 15, region: 'upper' },
  'seated-row': { kg: 15, region: 'upper' },
  'seated-row-horizontal': { kg: 15, region: 'upper' },
  'smith-row': { kg: 15, region: 'upper' },
  pullover: { kg: 10, region: 'upper' },
  'shoulder-press': { kg: 5, region: 'upper' },
  'lateral-raise': { kg: 5, region: 'upper' },
  'reverse-fly': { kg: 5, region: 'upper' },
  'biceps-curl': { kg: 5, region: 'upper' },
  'cable-curl': { kg: 5, region: 'upper' },
  'cable-hammer-curl': { kg: 5, region: 'upper' },
  'triceps-pushdown': { kg: 5, region: 'upper' },
  dips: { kg: null, region: 'upper', note: 'Assistance maximale' },
  'leg-press': { kg: 30, region: 'lower' },
  'leg-extension': { kg: 10, region: 'lower' },
  'leg-curl': { kg: 10, region: 'lower' },
  'seated-calf': { kg: 20, region: 'lower' },
  'hip-abduction': { kg: 15, region: 'lower' },
  'hip-adduction': { kg: 15, region: 'lower' },
  'crunch-machine-mon': { kg: 10, region: 'core' },
  'crunch-machine-thu': { kg: 10, region: 'core' },
  'plank-mon': { kg: null, region: 'none', note: 'Aucune charge' },
  'plank-thu': { kg: null, region: 'none', note: 'Aucune charge' }
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
 * @param {object} opts
 * @param {number} opts.usedWeight
 * @param {string} opts.feedback
 * @param {'upper'|'lower'|'core'|'none'} opts.region
 * @param {boolean} opts.setsComplete
 * @param {boolean} opts.pain
 * @param {boolean} opts.badForm
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

  // Sécurité : jamais d'augmentation si séries incomplètes, douleur ou mauvaise technique
  if (delta > 0 && (!setsComplete || pain || badForm)) {
    delta = 0;
  }

  const next = Math.round((current + delta) * 2) / 2;
  return Math.max(0, next);
}

/**
 * Charge à proposer aujourd'hui dans le champ.
 * Priorité : recommandation adaptée > base débutant.
 */
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
