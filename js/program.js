let programCache = null;

export async function loadProgram() {
  if (programCache) return programCache;
  const response = await fetch(`data/program.json?v=72`);
  if (!response.ok) throw new Error('Impossible de charger program.json');
  programCache = await response.json();
  return programCache;
}

export function getDayById(program, dayId) {
  return program.days.find((day) => day.id === dayId) || null;
}

export function getSuggestedDay(program) {
  const map = {
    0: 'jour1',
    1: 'jour1',
    2: 'jour2',
    3: 'jour3',
    4: 'jour4',
    5: 'jour5',
    6: 'jour6'
  };
  const today = new Date().getDay();
  const id = map[today] || 'jour1';
  return getDayById(program, id) || program.days[0];
}

export function isRestDay(day) {
  return Boolean(day?.isRestDay) || !day?.exercises?.length;
}

/** Nombre de séries utilisable par le timer (ignore les labels type "100 / jour"). */
export function setsCount(exercise) {
  const n = Number(exercise?.sets);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/** Secondes de repos pour le timer : tempsRepos numérique, sinon parse de `rest`. */
export function restSecondsOf(exercise, fallback = 60) {
  const direct = Number(exercise?.tempsRepos);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(exercise?.rest || '').match(/(\d+)\s*s/i);
  if (match) return Number(match[1]);
  return Number(fallback) || 60;
}

export function estimateDayDuration(day, overrides = {}) {
  const exerciseSec = Number(overrides.exercise ?? 45);
  const restSec = Number(overrides.rest ?? 75);
  let total = 0;

  day.exercises.forEach((ex) => {
    const sets = setsCount(ex);
    const work = Number(ex.tempsExercice ?? exerciseSec);
    const rest = restSecondsOf(ex, restSec);
    total += sets * work + Math.max(0, sets - 1) * rest;
  });

  return Math.round(total / 60);
}

export function remainingDuration(day, exerciseIndex, setIndex, phase, remainingSeconds, overrides = {}) {
  let total = remainingSeconds;

  const exerciseSec = Number(overrides.exercise ?? 45);
  const restSec = Number(overrides.rest ?? 75);

  for (let i = exerciseIndex; i < day.exercises.length; i += 1) {
    const ex = day.exercises[i];
    const sets = setsCount(ex);
    const work = Number(ex.tempsExercice ?? exerciseSec);
    const rest = restSecondsOf(ex, restSec);
    const startSet = i === exerciseIndex ? setIndex : 1;

    for (let s = startSet; s <= sets; s += 1) {
      if (i === exerciseIndex && s === setIndex) {
        if (phase === 'exercise') {
          // already counted in remainingSeconds
        } else if (phase === 'rest') {
          // remainingSeconds is rest, then next sets
        }
        if (phase === 'exercise') {
          if (s < sets) total += rest;
        }
      } else {
        total += work;
        if (s < sets) total += rest;
      }
    }
  }

  return Math.max(0, Math.round(total));
}

export function collectMuscles(day) {
  const set = new Set();
  day.exercises.forEach((ex) => (ex.muscles || []).forEach((m) => set.add(m)));
  return [...set];
}

export function progressKey(dayId, date = new Date()) {
  return `day:${dayId}:${date.toISOString().slice(0, 10)}`;
}

export function weekProgressKey(dayId) {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return `week:${dayId}:${monday.toISOString().slice(0, 10)}`;
}
