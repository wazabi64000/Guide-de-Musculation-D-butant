import { initStorage, getSettings, getCachedSetting } from './storage.js';
import {
  saveSession,
  setProgress,
  getProgress,
  getAllProgress,
  upsertRecord,
  getNote,
  saveNote,
  getLoad,
  saveLoad
} from './database.js';
import {
  LOAD_TIP,
  FEEDBACK_OPTIONS,
  getDefaultLoad,
  formatKg,
  formatDelta,
  nextRecommendedWeight,
  resolveTodayWeight,
  buildLoadSummary
} from './loads.js';
import { loadProgram, getDayById, getSuggestedDay, estimateDayDuration, collectMuscles, weekProgressKey } from './program.js';
import { computeStats, renderHistoryList, renderRecords, drawWeeklyChart } from './stats.js';
import { bindSettingsPage } from './settings.js';
import { buildNav, getQueryParam, navigate, currentPage } from './router.js';
import { music } from './music.js';
import { Timer, formatTime, formatDuration } from './timer.js';
import { playBeep, unlockBeeps } from './beep.js';
import { initWakeLock } from './wake.js';
import {
  $,
  clear,
  el,
  greetingForNow,
  quoteOfDay,
  muscleChips,
  createImageWithFallback,
  enterFullscreen,
  exitFullscreen,
  estimateCalories,
  formatDateFR,
  formatRestLabel,
  todayKey,
  requestNotify
} from './ui.js';

const CIRCUMFERENCE = 2 * Math.PI * 90;

let program = null;
let sessionController = null;

export async function boot() {
  await initStorage();
  program = await loadProgram();
  initWakeLock();

  document.body.appendChild(buildNav());
  registerServiceWorker();

  const page = currentPage();
  if (page === 'home') await renderHome();
  if (page === 'programme') await renderProgramme();
  if (page === 'historique') await renderHistorique();
  if (page === 'statistiques') await renderStatistiques();
  if (page === 'parametres') bindSettingsPage();

  const dayParam = getQueryParam('day');
  const start = getQueryParam('start');
  if (dayParam && (page === 'programme' || start === '1')) {
    const day = getDayById(program, dayParam);
    if (day) openDayView(day);
  }

  window.addEventListener('settings:changed', () => {
    music.setMuted(getCachedSetting('musicMuted'));
    music.setVolume(getCachedSetting('musicVolume'));
  });
}

async function renderHome() {
  const stats = await computeStats(program);
  const settings = getSettings();
  const suggested = getSuggestedDay(program);
  const name = settings.userName ? `, ${settings.userName}` : '';

  $('#greeting').textContent = `${greetingForNow()}${name}`;
  $('#quote').textContent = quoteOfDay(program.quotes);

  $('#stat-sessions').textContent = String(stats.sessionCount);
  $('#stat-time').textContent = formatDuration(stats.totalSeconds);
  $('#stat-calories').textContent = `${stats.calories} kcal`;
  $('#stat-progress').textContent = `${stats.progression}%`;

  const last = stats.lastSession;
  const lastEl = $('#last-session');
  if (last) {
    const day = getDayById(program, last.dayId);
    lastEl.textContent = `${day ? day.name : 'Séance'} · ${formatDateFR(last.date)} · ${formatDuration(last.durationSeconds || 0)}`;
  } else {
    lastEl.textContent = 'Aucune séance pour le moment';
  }

  $('#program-label').textContent = `${program.meta.title}`;
  const level = program.meta.level ? `Débutant · ` : '';
  const goal = program.meta.goal === 'hypertrophie'
    ? `${level}Hypertrophie · repos adaptés (1–2 min 30)`
    : program.meta.subtitle;
  $('#program-sub').textContent = `${suggested.name} — ${suggested.focus} · ~${suggested.duration} min · ${goal}`;

  const fill = $('#home-progress-fill');
  if (fill) fill.style.width = `${stats.progression}%`;

  $('#btn-start')?.addEventListener('click', () => {
    music.unlock().catch(() => {});
    unlockBeeps().catch(() => {});
    navigate('programme', { day: suggested.id, start: '1' });
  });

  $('#btn-open-program')?.addEventListener('click', () => navigate('programme'));
}

async function renderProgramme() {
  const list = $('#day-list');
  if (!list) return;
  clear(list);

  const progress = await getAllProgress();

  program.days.forEach((day, index) => {
    const done = Boolean(progress[weekProgressKey(day.id)]);
    const muscles = collectMuscles(day);
    const card = el('button', {
      className: `day-card fade-in ${done ? 'done' : 'pending'}`,
      type: 'button',
      style: `--day-color:${day.color}`,
      onClick: () => openDayView(day)
    }, [
      el('div', { className: 'day-card-header' }, [
        el('div', {}, [
          el('div', { className: 'day-name', text: day.name }),
          el('div', { className: 'day-focus', text: day.focus })
        ]),
        done
          ? el('span', { className: 'badge done badge-pop', text: 'Terminé ✓' })
          : el('span', { className: 'badge', text: `${day.exercises.length} exercices` })
      ]),
      el('div', { className: 'meta-row' }, [
        el('span', { text: `⏱ ${day.duration} min` }),
        el('span', { text: `~${estimateDayDuration(day, {
          exercise: getCachedSetting('defaultExerciseSeconds'),
          rest: getCachedSetting('defaultRestSeconds')
        })} min chrono` })
      ]),
      muscleChips(muscles.slice(0, 5))
    ]);
    card.style.animationDelay = `${index * 0.05}s`;
    list.appendChild(card);
  });
}

function openDayView(day) {
  const panel = $('#day-detail');
  const list = $('#day-list');
  if (!panel) {
    startSession(day);
    return;
  }

  list?.classList.add('hidden');
  panel.classList.remove('hidden');
  clear(panel);

  panel.appendChild(
    el('div', { className: 'card fade-in' }, [
      el('button', {
        className: 'btn btn-ghost',
        type: 'button',
        text: '← Retour',
        onClick: () => {
          panel.classList.add('hidden');
          list?.classList.remove('hidden');
        }
      }),
      el('h2', { className: 'greeting', style: 'font-size:1.7rem;margin-top:1rem', text: `${day.name}` }),
      el('p', { className: 'card-text', text: `${day.focus} · ${day.exercises.length} exercices · ${day.duration} min` }),
      el('div', { className: 'progress-bar', style: 'margin:1rem 0' }, [
        el('div', { className: 'progress-fill', id: 'day-session-progress', style: 'width:0%' })
      ]),
      el('button', {
        className: 'btn btn-primary',
        type: 'button',
        text: 'Commencer la séance',
        onClick: async () => {
          try {
            await music.unlock();
            await unlockBeeps();
          } catch {
            /* continue */
          }
          startSession(day);
        }
      })
    ])
  );

  const exerciseList = el('div', { className: 'exercise-list', style: 'margin-top:1rem' });
  day.exercises.forEach((exercise, index) => {
    exerciseList.appendChild(renderExerciseCard(day, exercise, index));
  });
  panel.appendChild(exerciseList);

  if (getQueryParam('start') === '1') {
    startSession(day);
  }
}

function renderExerciseCard(day, exercise, index) {
  const card = el('article', { className: 'exercise-card fade-in' });
  const body = el('div', { className: 'exercise-body' });
  const defaults = getDefaultLoad(exercise.id);

  const weightInput = el('input', {
    type: 'number',
    min: '0',
    step: '0.5',
    placeholder: defaults.kg === null ? (defaults.note || '—') : 'kg',
    id: `weight-${exercise.id}`,
    'aria-describedby': `load-meta-${exercise.id}`
  });
  if (defaults.kg === null && defaults.note) {
    weightInput.disabled = true;
  }

  const notesInput = el('textarea', {
    placeholder: 'Notes',
    id: `notes-${exercise.id}`
  });

  const metaBox = el('div', {
    className: 'load-meta',
    id: `load-meta-${exercise.id}`
  });

  const tipBtn = el('button', {
    className: 'load-tip-btn',
    type: 'button',
    title: LOAD_TIP,
    'aria-label': 'Information sur la charge recommandée',
    text: 'ⓘ',
    onClick: (event) => {
      event.preventDefault();
      window.alert(LOAD_TIP);
    }
  });

  getNote(exercise.id).then((note) => {
    notesInput.value = note || '';
  });

  getLoad(exercise.id).then((saved) => {
    const today = resolveTodayWeight(exercise.id, saved);
    if (today.value != null) {
      weightInput.value = String(today.value);
    }
    renderLoadMeta(metaBox, exercise.id, saved, weightInput.value);
  });

  weightInput.addEventListener('input', async () => {
    const saved = await getLoad(exercise.id);
    renderLoadMeta(metaBox, exercise.id, saved, weightInput.value);
  });

  body.append(
    el('div', { className: 'exercise-name', text: `${index + 1}. ${exercise.name}` }),
    muscleChips(exercise.muscles),
    el('div', { className: 'meta-row' }, [
      el('span', { text: `${exercise.sets} × ${exercise.isHold ? `${exercise.tempsExercice}s` : exercise.reps}` }),
      el('span', { text: `Repos ${formatRestLabel(exercise.tempsRepos)}` }),
      exercise.kind ? el('span', { text: exercise.kind }) : null
    ]),
    exercise.restNote
      ? el('p', { className: 'card-text', style: 'margin:0.35rem 0 0;font-size:0.85rem;opacity:0.85', text: exercise.restNote })
      : null,
    detail('Description', exercise.description),
    detail('Comment faire', exercise.howTo),
    detail('Respiration', exercise.breathing),
    detail('Erreurs à éviter', exercise.mistakes),
    el('div', { className: 'field-row' }, [
      el('div', { className: 'field' }, [
        el('label', { className: 'load-label-row' }, [
          'Charge (kg) ',
          tipBtn
        ]),
        weightInput,
        metaBox
      ]),
      el('div', { className: 'field' }, [el('label', { text: 'Notes' }), notesInput])
    ]),
    el('label', { className: 'check-row' }, [
      el('input', { type: 'checkbox', id: `done-${exercise.id}` }),
      el('span', { text: 'Exercice terminé' })
    ]),
    el('div', { className: 'session-actions', style: 'grid-template-columns:1fr 1fr' }, [
      el('button', {
        className: 'btn btn-primary',
        type: 'button',
        text: 'Démarrer',
        onClick: async () => {
          try {
            await music.unlock();
            await unlockBeeps();
          } catch {
            /* continue */
          }
          startSession(day, index);
        }
      }),
      el('button', {
        className: 'btn btn-secondary',
        type: 'button',
        text: 'Suivant',
        onClick: () => {
          const next = day.exercises[index + 1];
          if (!next) return;
          document.getElementById(`weight-${next.id}`)?.closest('.exercise-card')?.scrollIntoView({ behavior: 'smooth' });
        }
      })
    ])
  );

  notesInput.addEventListener('change', () => saveNote(exercise.id, notesInput.value));

  card.append(createImageWithFallback(exercise.image, exercise.name), body);
  return card;
}

function renderLoadMeta(container, exerciseId, saved, todayRaw) {
  if (!container) return;
  clear(container);
  const summary = buildLoadSummary(exerciseId, saved, todayRaw);

  if (summary.note && summary.baseKg === null) {
    container.appendChild(
      el('p', { className: 'load-meta-line', text: `Charge recommandée : ${summary.note}` })
    );
    return;
  }

  container.append(
    el('p', {
      className: 'load-meta-line',
      text: `Charge recommandée : ${formatKg(summary.recommended)} kg`
    }),
    el('p', {
      className: 'load-meta-line muted',
      text: `Dernière séance : ${summary.lastUsed != null ? `${formatKg(summary.lastUsed)} kg` : '—'}`
    }),
    el('p', {
      className: 'load-meta-line muted',
      text: `Aujourd'hui : ${summary.today != null && !Number.isNaN(summary.today) ? `${formatKg(summary.today)} kg` : '—'}`
    }),
    el('p', {
      className: 'load-meta-line muted',
      text: `Progression : ${formatDelta(summary.progression)}`
    })
  );
}

/**
 * Feedback ressenti après un exercice (adapte la prochaine charge).
 */
function askLoadFeedback(exercise, { setsComplete = true } = {}) {
  const defaults = getDefaultLoad(exercise.id);
  if (defaults.kg === null) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const existing = document.getElementById('load-feedback-modal');
    existing?.remove();

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.getElementById('load-feedback-modal')?.remove();
      resolve(value);
    };

    const weightInput = document.getElementById(`weight-${exercise.id}`);
    const usedWeight = Number(weightInput?.value || defaults.kg || 0);

    const painBox = el('input', { type: 'checkbox', id: 'load-feedback-pain' });
    const formBox = el('input', { type: 'checkbox', id: 'load-feedback-form' });

    const modal = el('div', {
      id: 'load-feedback-modal',
      className: 'load-feedback-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Ressenti de charge'
    });

    const panel = el('div', { className: 'card load-feedback-card' }, [
      el('h2', { className: 'card-title', text: 'Comment était cette charge ?' }),
      el('p', {
        className: 'card-text',
        text: `${exercise.name} · ${formatKg(usedWeight)} kg`
      }),
      el(
        'div',
        { className: 'load-feedback-options' },
        FEEDBACK_OPTIONS.map((opt) =>
          el('button', {
            className: 'btn btn-secondary load-feedback-btn',
            type: 'button',
            text: opt.label,
            onClick: async () => {
              const pain = Boolean(painBox.checked);
              const badForm = Boolean(formBox.checked);
              const next = nextRecommendedWeight({
                usedWeight,
                feedback: opt.id,
                region: defaults.region,
                setsComplete,
                pain,
                badForm
              });

              const prev = (await getLoad(exercise.id)) || {};
              const firstUsed =
                prev.firstUsed != null ? Number(prev.firstUsed) : usedWeight;

              await saveLoad(exercise.id, {
                lastUsed: usedWeight,
                firstUsed,
                nextRecommended: next,
                lastFeedback: opt.id,
                pain,
                badForm
              });

              const meta = document.getElementById(`load-meta-${exercise.id}`);
              const saved = await getLoad(exercise.id);
              renderLoadMeta(meta, exercise.id, saved, weightInput?.value);
              finish({ feedback: opt.id, next });
            }
          })
        )
      ),
      el('label', { className: 'check-row' }, [
        painBox,
        el('span', { text: 'Douleur ressentie' })
      ]),
      el('label', { className: 'check-row' }, [
        formBox,
        el('span', { text: 'Mauvaise technique' })
      ]),
      el('button', {
        className: 'btn btn-ghost',
        type: 'button',
        text: 'Passer',
        style: 'width:100%;margin-top:0.5rem',
        onClick: () => finish(null)
      })
    ]);

    modal.appendChild(panel);
    document.body.appendChild(modal);

    // Auto-passer après 12s pour ne jamais bloquer la séance
    window.setTimeout(() => finish(null), 12000);
  });
}

function detail(title, text) {
  return el('div', { className: 'detail-block' }, [
    el('h4', { text: title }),
    el('p', { text })
  ]);
}

async function renderHistorique() {
  const stats = await computeStats(program);
  renderHistoryList($('#history-list'), stats.sessions, program);
}

async function renderStatistiques() {
  const stats = await computeStats(program);
  $('#stat-total-time').textContent = formatDuration(stats.totalSeconds);
  $('#stat-total-sessions').textContent = String(stats.sessionCount);
  $('#stat-total-calories').textContent = `${stats.calories} kcal`;
  $('#stat-progression').textContent = `${stats.progression}%`;
  drawWeeklyChart($('#stats-chart'), stats.last7);
  renderRecords($('#records-list'), stats.records, program);
  window.addEventListener('resize', () => drawWeeklyChart($('#stats-chart'), stats.last7));
}

function startSession(day, startIndex = 0) {
  try {
    if (sessionController) {
      sessionController.destroy();
      sessionController = null;
    }
    $('#session-overlay')?.remove();
    $('#completion-modal')?.remove();
    sessionController = createSessionController(day, startIndex);
    sessionController.start();
  } catch (error) {
    console.error('Impossible de démarrer la séance:', error);
    window.alert('Impossible de démarrer la séance. Recharge la page (Ctrl+F5).');
  }
}

function createSessionController(day, startIndex = 0) {
  ensureSessionOverlay();
  const overlay = $('#session-overlay');
  const phaseEl = $('#timer-phase');
  const timeEl = $('#timer-time');
  const subEl = $('#timer-sub');
  const nameEl = $('#session-exercise-name');
  const progressEl = $('#session-progress-fill');
  const remainEl = $('#session-remaining');
  const ring = $('#timer-progress');
  const setDoneBtn = $('#btn-set-done');

  if (!overlay || !phaseEl || !timeEl || !subEl || !nameEl || !progressEl || !remainEl || !ring) {
    throw new Error('Interface de séance incomplète');
  }

  let exerciseIndex = Math.max(0, Number(startIndex) || 0);
  let setIndex = 1;
  /** @type {'work'|'rest'} */
  let mode = 'work';
  let startedAt = Date.now();
  let completedExercises = new Set();
  let loads = {};
  let destroyed = false;
  let finishing = false;
  let busy = false;
  let countdownToken = 0;
  /** @type {'between-sets'|'between-exercises'} */
  let restKind = 'between-sets';

  const settings = getSettings();

  const timer = new Timer({
    onTick: (state) => {
      timeEl.textContent = formatTime(state.remaining);
      ring.style.strokeDasharray = String(CIRCUMFERENCE);
      ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - state.progress));
      updateRemaining(state.remaining);
    },
    onEndingBeep: (second) => {
      playBeep({
        frequency: second === 1 ? 980 : 700,
        duration: 0.1,
        volume: 0.18
      });
      if (mode === 'rest') {
        subEl.textContent = second === 1 ? 'Série suivante…' : `Reprise dans ${second}s`;
      } else {
        subEl.textContent = second === 1 ? 'Série bientôt finie' : `Encore ${second}s`;
      }
    },
    onComplete: () => {
      if (destroyed || finishing || busy) return;
      if (mode === 'work') void advanceAfterWork();
      else void advanceAfterRest();
    }
  });

  function currentExercise() {
    return day.exercises[exerciseIndex] || null;
  }

  function workSeconds(ex) {
    return Number(ex.tempsExercice ?? settings.defaultExerciseSeconds ?? 45);
  }

  function restSeconds(ex) {
    return Number(ex.tempsRepos ?? settings.defaultRestSeconds ?? program?.meta?.defaultRestSeconds ?? 90);
  }

  function afterExerciseRestSeconds() {
    return Number(program?.meta?.restAfterExerciseSeconds ?? 90);
  }

  function updateProgress() {
    const total = day.exercises.reduce((s, ex) => s + Number(ex.sets || 3), 0);
    let done = 0;
    for (let i = 0; i < exerciseIndex; i += 1) done += Number(day.exercises[i].sets || 3);
    done += Math.max(0, setIndex - 1);
    if (mode === 'rest') done += 1;
    progressEl.style.width = `${Math.min(100, Math.round((done / Math.max(1, total)) * 100))}%`;
  }

  function updateRemaining(current = 0) {
    let seconds = Number(current) || 0;
    const betweenExercises = afterExerciseRestSeconds();
    for (let i = exerciseIndex; i < day.exercises.length; i += 1) {
      const ex = day.exercises[i];
      const sets = Number(ex.sets || 3);
      const startSet = i === exerciseIndex ? setIndex : 1;
      for (let s = startSet; s <= sets; s += 1) {
        if (i === exerciseIndex && s === setIndex) {
          if (mode === 'work') {
            if (s < sets) seconds += restSeconds(ex);
            else if (i < day.exercises.length - 1) seconds += betweenExercises;
          } else if (mode === 'rest') {
            // current rest already in `current`
            if (restKind === 'between-exercises') {
              seconds += workSeconds(ex);
              // full remaining sets of next exercises handled below via continue + later loops
            } else {
              seconds += workSeconds(ex);
              if (s < sets) seconds += restSeconds(ex);
              if (s === sets && i < day.exercises.length - 1) seconds += betweenExercises;
            }
          }
          continue;
        }
        seconds += workSeconds(ex);
        if (s < sets) seconds += restSeconds(ex);
        else if (i < day.exercises.length - 1) seconds += betweenExercises;
      }
    }
    remainEl.textContent = `Restant ~ ${formatDuration(seconds)}`;
  }

  function sleep(ms, token) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(token === countdownToken), ms);
    });
  }

  async function runCountdown(label) {
    const token = ++countdownToken;
    timer.stop();
    music.duck(true);
    if (setDoneBtn) setDoneBtn.classList.add('hidden');
    phaseEl.textContent = 'Prêt';
    ring.classList.remove('rest');
    ring.style.strokeDashoffset = String(CIRCUMFERENCE);

    for (let n = 3; n >= 1; n -= 1) {
      if (destroyed || finishing || token !== countdownToken) {
        music.duck(false);
        return false;
      }
      timeEl.textContent = String(n);
      subEl.textContent = label;
      playBeep({
        frequency: n === 1 ? 1100 : 780,
        duration: n === 1 ? 0.2 : 0.1,
        volume: 0.28
      });
      const ok = await sleep(1000, token);
      if (!ok || destroyed || finishing) {
        music.duck(false);
        return false;
      }
    }

    music.duck(false);
    return !(destroyed || finishing) && token === countdownToken;
  }

  async function startWorkPhase() {
    if (destroyed || finishing) return;
    const exercise = currentExercise();
    if (!exercise) {
      await finishSession(true);
      return;
    }

    busy = true;
    mode = 'work';
    nameEl.textContent = exercise.name;
    setSessionBackground(exercise);
    updateProgress();

    const sets = Number(exercise.sets || 3);
    const label = exercise.isHold
      ? `Série ${setIndex}/${sets} — maintien`
      : `Série ${setIndex}/${sets} — ${exercise.reps} reps`;

    await music.play('exercise', { loop: true, setIndex });
    const ok = await runCountdown(label);
    if (!ok) {
      busy = false;
      return;
    }

    phaseEl.textContent = 'Exercice';
    subEl.textContent = label;
    ring.classList.remove('rest');
    if (setDoneBtn) {
      setDoneBtn.classList.remove('hidden');
      setDoneBtn.textContent = 'Série terminée → Repos';
    }
    // Reprend l'exercice après le countdown (le repos a pu être coupé)
    await music.stop();
    await music.play('exercise', { loop: true, setIndex });
    timer.start(workSeconds(exercise));
    updateRemaining(workSeconds(exercise));
    busy = false;
  }

  async function startRestPhase(kind = 'between-sets') {
    if (destroyed || finishing) return;
    const exercise = currentExercise();
    if (!exercise && kind === 'between-sets') {
      await finishSession(true);
      return;
    }

    busy = true;
    mode = 'rest';
    restKind = kind;

    const sets = Number(exercise?.sets || 3);
    let rest;
    let label;
    let nextName = '';

    if (kind === 'between-exercises') {
      rest = afterExerciseRestSeconds();
      const next = day.exercises[exerciseIndex];
      nextName = next?.name || 'exercice suivant';
      nameEl.textContent = nextName;
      if (next) setSessionBackground(next);
      label = `Repos ${formatRestLabel(rest)} — prochain : ${nextName}`;
      phaseEl.textContent = 'Repos exercice';
    } else {
      rest = restSeconds(exercise);
      nameEl.textContent = exercise.name;
      setSessionBackground(exercise);
      label = `Repos ${formatRestLabel(rest)} — puis série ${setIndex}/${sets}`;
      phaseEl.textContent = 'Repos';
    }

    updateProgress();

    // Coupe l'exercice avant le repos pour éviter le chevauchement
    await music.stop();
    await music.play('rest', { loop: true });
    const ok = await runCountdown(label);
    if (!ok) {
      busy = false;
      return;
    }

    phaseEl.textContent = kind === 'between-exercises' ? 'Repos entre exercices' : 'Repos';
    subEl.textContent = label;
    ring.classList.add('rest');
    if (setDoneBtn) setDoneBtn.classList.add('hidden');
    await music.play('rest', { loop: true });
    timer.start(rest);
    updateRemaining(rest);
    busy = false;
  }

  function markExerciseDone(exercise) {
    completedExercises.add(exercise.id);
    const weightInput = document.getElementById(`weight-${exercise.id}`);
    const weight = Number(weightInput?.value || loads[exercise.id] || 0);
    if (weight > 0) {
      loads[exercise.id] = weight;
      upsertRecord(exercise.id, weight);
      getLoad(exercise.id).then((prev) => {
        const base = getDefaultLoad(exercise.id);
        return saveLoad(exercise.id, {
          lastUsed: weight,
          firstUsed: prev?.firstUsed != null ? prev.firstUsed : weight,
          nextRecommended:
            prev?.nextRecommended != null ? prev.nextRecommended : base.kg
        });
      }).catch(() => {});
    }
    const doneBox = document.getElementById(`done-${exercise.id}`);
    if (doneBox) doneBox.checked = true;
  }

  async function advanceAfterWork() {
    if (busy || destroyed || finishing) return;
    busy = true;
    timer.stop();

    const exercise = currentExercise();
    if (!exercise) {
      busy = false;
      await finishSession(true);
      return;
    }

    const sets = Number(exercise.sets || 3);

    if (setIndex < sets) {
      // Repos court entre séries
      setIndex += 1;
      busy = false;
      await startRestPhase('between-sets');
      return;
    }

    // Séries terminées → enchaîne tout de suite (feedback non bloquant)
    markExerciseDone(exercise);
    const finishedExercise = exercise;
    exerciseIndex += 1;
    setIndex = 1;
    busy = false;

    // Feedback charge pendant le repos / avant la fin — ne bloque pas la fluidité
    const feedbackPromise = askLoadFeedback(finishedExercise, { setsComplete: true });

    if (exerciseIndex >= day.exercises.length) {
      await feedbackPromise;
      if (destroyed || finishing) return;
      await finishSession(true);
      return;
    }

    void feedbackPromise;
    await startRestPhase('between-exercises');
  }

  async function advanceAfterRest() {
    if (busy || destroyed || finishing) return;
    if (restKind === 'between-exercises') {
      await startWorkPhase();
      return;
    }
    // Après repos entre séries → série suivante (setIndex déjà incrémenté)
    await startWorkPhase();
  }

  async function finishSession(completed) {
    if (finishing || destroyed) return;
    finishing = true;
    busy = true;
    countdownToken += 1;
    timer.stop();
    if (setDoneBtn) setDoneBtn.classList.add('hidden');
    await music.stop();
    void music.play('finish', { loop: false });

    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    const calories = estimateCalories(durationSeconds / 60, program.meta.caloriesPerMinute);

    try {
      await saveSession({
        date: new Date().toISOString(),
        dayId: day.id,
        dayName: day.name,
        focus: day.focus,
        durationSeconds,
        plannedMinutes: day.duration,
        exercisesCompleted: completedExercises.size,
        exerciseTotal: day.exercises.length,
        calories,
        loads,
        notes: '',
        completed: Boolean(completed)
      });

      if (completed && completedExercises.size >= day.exercises.length) {
        await setProgress(weekProgressKey(day.id), {
          date: todayKey(),
          completed: true
        });
      }
    } catch (error) {
      console.error(error);
    }

    if (getCachedSetting('notifications')) {
      requestNotify('Séance terminée', `${day.name} · ${formatDuration(durationSeconds)}`);
    }

    overlay.classList.remove('active');
    overlay.removeEventListener('click', onOverlayClick);
    document.body.style.overflow = '';
    await exitFullscreen();
    showCompletionModal(day, durationSeconds, calories);
  }

  async function exitToExercises(savePartial) {
    if (destroyed) return;
    countdownToken += 1;
    timer.stop();
    await music.stop();

    if (savePartial) {
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
      if (durationSeconds > 5) {
        try {
          await saveSession({
            date: new Date().toISOString(),
            dayId: day.id,
            dayName: day.name,
            focus: day.focus,
            durationSeconds,
            plannedMinutes: day.duration,
            exercisesCompleted: completedExercises.size,
            exerciseTotal: day.exercises.length,
            calories: estimateCalories(durationSeconds / 60, program.meta.caloriesPerMinute),
            loads,
            notes: '',
            completed: false
          });
        } catch (error) {
          console.error(error);
        }
      }
    }

    destroyed = true;
    finishing = true;
    overlay.removeEventListener('click', onOverlayClick);
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    await exitFullscreen();
    overlay.remove();
    sessionController = null;
    openDayView(day);
  }

  const onOverlayClick = (event) => {
    const btn = event.target.closest('button');
    if (!btn || destroyed || finishing) return;

    switch (btn.id) {
      case 'btn-set-done':
        if (busy || mode !== 'work') return;
        void advanceAfterWork();
        break;
      case 'btn-pause':
        if (busy) return;
        timer.toggle();
        btn.textContent = timer.getState().paused ? 'Reprendre' : 'Pause';
        break;
      case 'btn-skip':
        if (busy) {
          countdownToken += 1;
          music.duck(false);
          const exercise = currentExercise();
          if (mode === 'rest') {
            if (!exercise && restKind !== 'between-exercises') break;
            const secs = restKind === 'between-exercises'
              ? afterExerciseRestSeconds()
              : restSeconds(exercise);
            phaseEl.textContent = restKind === 'between-exercises' ? 'Repos entre exercices' : 'Repos';
            subEl.textContent = restKind === 'between-exercises'
              ? `Repos ${formatRestLabel(secs)} — ${exercise?.name || 'suivant'}`
              : `Repos ${formatRestLabel(secs)} — série ${setIndex}/${exercise.sets}`;
            ring.classList.add('rest');
            if (setDoneBtn) setDoneBtn.classList.add('hidden');
            void music.play('rest', { loop: true });
            timer.start(secs);
            busy = false;
          } else {
            if (!exercise) break;
            phaseEl.textContent = 'Exercice';
            subEl.textContent = `Série ${setIndex}/${exercise.sets}`;
            ring.classList.remove('rest');
            if (setDoneBtn) setDoneBtn.classList.remove('hidden');
            void music.play('exercise', { loop: true, setIndex });
            timer.start(workSeconds(exercise));
            busy = false;
          }
        } else {
          timer.skip();
        }
        break;
      case 'btn-back-exercises':
      case 'btn-close-session':
        void exitToExercises(true);
        break;
      case 'btn-stop':
        void finishSession(false);
        break;
      case 'btn-restart':
        countdownToken += 1;
        timer.stop();
        exerciseIndex = Math.max(0, Number(startIndex) || 0);
        setIndex = 1;
        mode = 'work';
        completedExercises = new Set();
        startedAt = Date.now();
        finishing = false;
        busy = false;
        $('#btn-pause').textContent = 'Pause';
        void startWorkPhase();
        break;
      default:
        break;
    }
  };

  return {
    start() {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      $('#session-day-title').textContent = `${day.name} — ${day.focus}`;
      overlay.addEventListener('click', onOverlayClick);

      const exercise = currentExercise();
      if (exercise) {
        nameEl.textContent = exercise.name;
        setSessionBackground(exercise);
      }

      mode = 'work';
      setIndex = 1;
      void enterFullscreen(overlay);
      void (async () => {
        await music.unlock();
        await unlockBeeps();
        await startWorkPhase();
      })();
    },
    destroy() {
      destroyed = true;
      finishing = true;
      countdownToken += 1;
      timer.stop();
      void music.stop();
      overlay.removeEventListener('click', onOverlayClick);
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  };
}

function setSessionBackground(exercise) {
  const panelImg = $('#session-exercise-img');
  const path = String(exercise?.image || '').replace(/^\//, '');
  const url = path ? `${path}?v=9` : '';

  if (!panelImg) return;

  if (!url) {
    panelImg.removeAttribute('src');
    panelImg.alt = 'Image manquante';
    return;
  }

  panelImg.alt = exercise?.name || 'Exercice';
  panelImg.src = url;
  panelImg.onerror = () => {
    panelImg.style.opacity = '0.3';
  };
  panelImg.onload = () => {
    panelImg.style.opacity = '1';
  };
}

function ensureSessionOverlay() {
  $('#session-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'session-overlay';
  overlay.className = 'session-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Séance en cours');

  overlay.innerHTML = `
    <div class="session-header">
      <div>
        <div class="brand-sub" id="session-day-title">Séance</div>
        <strong id="session-exercise-name">Exercice</strong>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center">
        <button class="btn btn-secondary" type="button" id="btn-back-exercises">← Exercices</button>
        <button class="btn btn-ghost" type="button" id="btn-close-session" aria-label="Fermer">✕</button>
      </div>
    </div>
    <div class="session-image-panel">
      <img id="session-exercise-img" alt="Illustration de l'exercice" width="1200" height="750" />
    </div>
    <div class="session-main">
      <div class="timer-wrap">
        <svg class="timer-svg" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="timer-track" cx="100" cy="100" r="90"></circle>
          <circle id="timer-progress" class="timer-progress" cx="100" cy="100" r="90"
            stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}"></circle>
        </svg>
        <div class="timer-center">
          <div class="timer-phase" id="timer-phase">Exercice</div>
          <div class="timer-time" id="timer-time">00:00</div>
          <div class="timer-sub" id="timer-sub">Série 1</div>
        </div>
      </div>
      <div class="session-progress-block">
        <div class="progress-bar"><div class="progress-fill" id="session-progress-fill"></div></div>
        <p class="card-text session-remaining" id="session-remaining">Restant ~ 0 min</p>
        <button class="btn btn-primary hidden" type="button" id="btn-set-done">Série terminée → Repos</button>
      </div>
    </div>
    <div class="session-footer">
      <div class="session-actions">
        <button class="btn btn-secondary" type="button" id="btn-pause">Pause</button>
        <button class="btn btn-secondary" type="button" id="btn-skip">Passer</button>
        <button class="btn btn-secondary" type="button" id="btn-restart">Recommencer</button>
        <button class="btn btn-danger" type="button" id="btn-stop">Terminer</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function showCompletionModal(day, durationSeconds, calories) {
  const existing = $('#completion-modal');
  existing?.remove();

  const modal = el('div', {
    id: 'completion-modal',
    className: 'session-overlay active',
    style: 'z-index:90;place-items:center;display:grid'
  }, [
    el('div', { className: 'card fade-in-scale', style: 'width:min(420px,92vw);text-align:center' }, [
      el('div', { className: 'badge done badge-pop', text: 'Séance enregistrée' }),
      el('h2', { className: 'greeting', style: 'font-size:1.8rem;margin:1rem 0', text: 'Bravo !' }),
      el('p', { className: 'card-text', text: `${day.name} — ${day.focus}` }),
      el('p', { className: 'stat-value', style: 'margin:1rem 0', text: formatDuration(durationSeconds) }),
      el('p', { className: 'card-text', text: `${calories} kcal estimées` }),
      el('div', { style: 'display:grid;gap:0.75rem;margin-top:1.25rem' }, [
        el('button', {
          className: 'btn btn-primary',
          type: 'button',
          text: '← Retour aux exercices',
          onClick: () => {
            modal.remove();
            openDayView(day);
          }
        }),
        el('button', {
          className: 'btn btn-secondary',
          type: 'button',
          text: 'Voir l\'historique',
          onClick: () => navigate('historique')
        }),
        el('button', {
          className: 'btn btn-ghost',
          type: 'button',
          text: 'Programme de la semaine',
          onClick: () => {
            modal.remove();
            navigate('programme');
          }
        })
      ])
    ])
  ]);

  document.body.appendChild(modal);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Force clients onto the new SW as soon as it activates
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js?v=41');
      await registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    } catch {
      /* offline or unsupported */
    }
  });
}

boot().catch((error) => {
  console.error(error);
  const root = document.querySelector('.app-shell') || document.body;
  const box = document.createElement('div');
  box.className = 'card';
  box.textContent = `Erreur de chargement : ${error.message}`;
  root.prepend(box);
});
