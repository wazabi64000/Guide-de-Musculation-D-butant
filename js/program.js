let programCache = null;

export async function loadProgram() {
  if (programCache) return programCache;
  const response = await fetch(`data/program.json?v=41`);
  if (!response.ok) throw new Error('Impossible de charger program.json');
  programCache = await response.json();
  return programCache;
}

export function getDayById(program, dayId) {
  return program.days.find((day) => day.id === dayId) || null;
}

export function getSuggestedDay(program) {
  const map = {
    1: 'lundi',
    2: 'mardi',
    4: 'jeudi',
    5: 'vendredi'
  };
  const today = new Date().getDay();
  const id = map[today] || 'lundi';
  return getDayById(program, id) || program.days[0];
}

export function estimateDayDuration(day, overrides = {}) {
  const exerciseSec = Number(overrides.exercise ?? 45);
  const restSec = Number(overrides.rest ?? 75);
  let total = 0;

  day.exercises.forEach((ex) => {
    const sets = Number(ex.sets || 3);
    const work = Number(ex.tempsExercice ?? exerciseSec);
    const rest = Number(ex.tempsRepos ?? restSec);
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
    const sets = Number(ex.sets || 3);
    const work = Number(ex.tempsExercice ?? exerciseSec);
    const rest = Number(ex.tempsRepos ?? restSec);
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
  day.exercises.forEach((ex) => ex.muscles.forEach((m) => set.add(m)));
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
