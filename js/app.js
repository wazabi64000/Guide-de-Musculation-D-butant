import { initStorage, getSettings, getCachedSetting } from './storage.js';
import {
  saveSession,
  setProgress,
  getProgress,
  getAllProgress,
  upsertRecord,
  getNote,
  saveNote
} from './database.js';
import { loadProgram, getDayById, getSuggestedDay, estimateDayDuration, collectMuscles, weekProgressKey } from './program.js';
import { computeStats, renderHistoryList, renderRecords, drawWeeklyChart } from './stats.js';
import { bindSettingsPage } from './settings.js';
import { buildNav, getQueryParam, navigate, currentPage } from './router.js';
import { music } from './music.js';
import { Timer, formatTime, formatDuration } from './timer.js';
import { playBeep, unlockBeeps } from './beep.js';
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
  todayKey,
  requestNotify
} from './ui.js';

const CIRCUMFERENCE = 2 * Math.PI * 90;

let program = null;
let sessionController = null;

export async function boot() {
  await initStorage();
  program = await loadProgram();

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
  $('#program-sub').textContent = `${suggested.name} — ${suggested.focus} · ~${suggested.duration} min`;

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

  const weightInput = el('input', {
    type: 'number',
    min: '0',
    step: '0.5',
    placeholder: 'kg',
    id: `weight-${exercise.id}`
  });
  const notesInput = el('textarea', {
    placeholder: 'Notes',
    id: `notes-${exercise.id}`
  });

  getNote(exercise.id).then((note) => {
    notesInput.value = note || '';
  });

  body.append(
    el('div', { className: 'exercise-name', text: `${index + 1}. ${exercise.name}` }),
    muscleChips(exercise.muscles),
    el('div', { className: 'meta-row' }, [
      el('span', { text: `${exercise.sets} séries` }),
      el('span', { text: exercise.isHold ? `${exercise.tempsExercice}s maintien` : `${exercise.reps} reps` }),
      el('span', { text: `Repos ${exercise.tempsRepos}s` })
    ]),
    detail('Description', exercise.description),
    detail('Comment faire', exercise.howTo),
    detail('Respiration', exercise.breathing),
    detail('Erreurs à éviter', exercise.mistakes),
    el('div', { className: 'field-row' }, [
      el('div', { className: 'field' }, [el('label', { text: 'Charge (kg)' }), weightInput]),
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
    // Remove stale overlay so controls/DOM are always fresh
    $('#session-overlay')?.remove();
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
  let countdownTimer = null;
  let inCountdown = false;
  let countdownResolve = null;

  const settings = getSettings();

  const timer = new Timer({
    onTick: (state) => {
      if (inCountdown) return;
      timeEl.textContent = formatTime(state.remaining);
      ring.style.strokeDasharray = String(CIRCUMFERENCE);
      ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - state.progress));
      updateRemaining(state.remaining);
    },
    onEndingBeep: (second) => {
      playBeep({
        frequency: second === 1 ? 1100 : 740,
        duration: second === 1 ? 0.2 : 0.12,
        volume: 0.3
      });
      subEl.textContent = second === 1 ? 'Go !' : `Fin dans ${second}…`;
    },
    onComplete: () => {
      if (destroyed || finishing || inCountdown) return;
      if (mode === 'work') afterWorkComplete();
      else afterRestComplete();
    }
  });

  function currentExercise() {
    return day.exercises[exerciseIndex] || null;
  }

  function workSeconds(ex) {
    return Number(ex.tempsExercice ?? settings.defaultExerciseSeconds ?? 45);
  }

  function restSeconds(ex) {
    return Number(ex.tempsRepos ?? settings.defaultRestSeconds ?? 75);
  }

  function updateProgress() {
    const total = day.exercises.reduce((s, ex) => s + Number(ex.sets || 3), 0);
    let done = 0;
    for (let i = 0; i < exerciseIndex; i += 1) done += Number(day.exercises[i].sets || 3);
    done += Math.max(0, setIndex - 1);
    if (mode === 'rest') done += 1;
    const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
    progressEl.style.width = `${pct}%`;
    const dayFill = $('#day-session-progress');
    if (dayFill) dayFill.style.width = `${pct}%`;
  }

  function updateRemaining(current = 0) {
    let seconds = Number(current) || 0;
    for (let i = exerciseIndex; i < day.exercises.length; i += 1) {
      const ex = day.exercises[i];
      const sets = Number(ex.sets || 3);
      const startSet = i === exerciseIndex ? setIndex : 1;
      for (let s = startSet; s <= sets; s += 1) {
        if (i === exerciseIndex && s === setIndex) {
          if (mode === 'work') {
            if (s < sets) seconds += 3 + restSeconds(ex) + 3;
          } else if (mode === 'rest') {
            seconds += 3 + workSeconds(ex);
            if (s < sets) seconds += 3 + restSeconds(ex);
          }
          continue;
        }
        seconds += 3 + workSeconds(ex);
        if (s < sets) seconds += 3 + restSeconds(ex);
      }
    }
    remainEl.textContent = `Restant ~ ${formatDuration(seconds)}`;
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }
    if (countdownResolve) {
      const resolve = countdownResolve;
      countdownResolve = null;
      resolve('aborted');
    }
    inCountdown = false;
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      countdownResolve = resolve;
      countdownTimer = setTimeout(() => {
        countdownTimer = null;
        countdownResolve = null;
        resolve('ok');
      }, ms);
    });
  }

  /** Compte à rebours 3-2-1 avec bips. Retourne false si annulé. */
  async function countdown(label) {
    clearCountdown();
    timer.stop();
    inCountdown = true;
    if (setDoneBtn) setDoneBtn.classList.add('hidden');
    phaseEl.textContent = 'Prêt';
    ring.classList.remove('rest');
    ring.style.strokeDashoffset = String(CIRCUMFERENCE);

    for (let n = 3; n >= 1; n -= 1) {
      if (destroyed || finishing) {
        inCountdown = false;
        return false;
      }
      timeEl.textContent = String(n);
      subEl.textContent = label;
      playBeep({
        frequency: n === 1 ? 1100 : 740,
        duration: n === 1 ? 0.22 : 0.12,
        volume: 0.32
      });
      const result = await sleep(1000);
      if (result === 'aborted' || destroyed || finishing) {
        inCountdown = false;
        return false;
      }
    }

    inCountdown = false;
    return !(destroyed || finishing);
  }

  async function startWork() {
    const exercise = currentExercise();
    if (!exercise) {
      finishSession(true);
      return;
    }

    mode = 'work';
    nameEl.textContent = exercise.name;
    setSessionBackground(exercise);
    updateProgress();

    const sets = Number(exercise.sets || 3);
    const label = exercise.isHold
      ? `Série ${setIndex}/${sets} — maintien`
      : `Série ${setIndex}/${sets} — ${exercise.reps} reps`;

    const ok = await countdown(label);
    if (!ok) return;

    phaseEl.textContent = 'Exercice';
    subEl.textContent = label;
    ring.classList.remove('rest');
    if (setDoneBtn) {
      setDoneBtn.classList.remove('hidden');
      setDoneBtn.textContent = 'Série terminée → Repos';
    }
    // Await play so autoplay/volume issues surface; force audible volume
    await music.play('exercise', { loop: true, fade: false });
    timer.start(workSeconds(exercise));
    updateRemaining(workSeconds(exercise));
  }

  async function startRest() {
    const exercise = currentExercise();
    if (!exercise) {
      finishSession(true);
      return;
    }

    mode = 'rest';
    nameEl.textContent = exercise.name;
    setSessionBackground(exercise);
    updateProgress();

    const sets = Number(exercise.sets || 3);
    const rest = restSeconds(exercise);
    const label = `Repos ${rest}s — prochaine série ${setIndex}/${sets}`;

    const ok = await countdown(label);
    if (!ok) return;

    phaseEl.textContent = 'Repos';
    subEl.textContent = label;
    ring.classList.add('rest');
    if (setDoneBtn) setDoneBtn.classList.add('hidden');
    await music.play('rest', { loop: true, fade: false });
    timer.start(rest);
    updateRemaining(rest);
  }

  function markExerciseDone(exercise) {
    completedExercises.add(exercise.id);
    const weightInput = document.getElementById(`weight-${exercise.id}`);
    const weight = Number(weightInput?.value || loads[exercise.id] || 0);
    if (weight > 0) {
      loads[exercise.id] = weight;
      upsertRecord(exercise.id, weight);
    }
    const doneBox = document.getElementById(`done-${exercise.id}`);
    if (doneBox) doneBox.checked = true;
  }

  function afterWorkComplete() {
    const exercise = currentExercise();
    if (!exercise) return;
    const sets = Number(exercise.sets || 3);

    if (setIndex < sets) {
      // Série finie → repos, puis série suivante
      setIndex += 1;
      void startRest();
    } else {
      // Toutes les séries de cet exercice sont faites
      markExerciseDone(exercise);
      exerciseIndex += 1;
      setIndex = 1;
      if (exerciseIndex >= day.exercises.length) finishSession(true);
      else void startWork();
    }
  }

  function afterRestComplete() {
    // Repos fini → 3 bips puis série suivante (déjà géré dans startWork)
    void startWork();
  }

  async function finishSession(completed) {
    if (finishing || destroyed) return;
    finishing = true;
    clearCountdown();
    timer.stop();
    if (setDoneBtn) setDoneBtn.classList.add('hidden');
    void music.play('finish', { loop: false, fade: false });

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
    await exitFullscreen();
    showCompletionModal(day, durationSeconds, calories);
  }

  const onOverlayClick = (event) => {
    const btn = event.target.closest('button');
    if (!btn || destroyed || finishing) return;

    switch (btn.id) {
      case 'btn-set-done':
        if (inCountdown || mode !== 'work') return;
        timer.stop();
        afterWorkComplete();
        break;
      case 'btn-pause':
        if (inCountdown) return;
        timer.toggle();
        btn.textContent = timer.getState().paused ? 'Reprendre' : 'Pause';
        break;
      case 'btn-skip':
        if (inCountdown) {
          clearCountdown();
          // Skip countdown: jump into current mode timer
          const exercise = currentExercise();
          if (!exercise) break;
          if (mode === 'rest') {
            phaseEl.textContent = 'Repos';
            subEl.textContent = `Repos ${restSeconds(exercise)}s — série ${setIndex}/${exercise.sets}`;
            ring.classList.add('rest');
            if (setDoneBtn) setDoneBtn.classList.add('hidden');
            void music.play('rest', { loop: true });
            timer.start(restSeconds(exercise));
          } else {
            phaseEl.textContent = 'Exercice';
            subEl.textContent = `Série ${setIndex}/${exercise.sets}`;
            ring.classList.remove('rest');
            if (setDoneBtn) setDoneBtn.classList.remove('hidden');
            void music.play('exercise', { loop: true });
            timer.start(workSeconds(exercise));
          }
        } else {
          timer.skip();
        }
        break;
      case 'btn-stop':
      case 'btn-close-session':
        finishSession(false);
        break;
      case 'btn-restart':
        clearCountdown();
        timer.stop();
        exerciseIndex = Math.max(0, Number(startIndex) || 0);
        setIndex = 1;
        mode = 'work';
        completedExercises = new Set();
        startedAt = Date.now();
        finishing = false;
        $('#btn-pause').textContent = 'Pause';
        void startWork();
        break;
      default:
        break;
    }
  };

  return {
    start() {
      // Afficher l'écran immédiatement (ne pas attendre la musique)
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

      // Unlock + start music as soon as session opens (still in click stack if sync enough)
      void (async () => {
        await music.unlock();
        await unlockBeeps();
        // Start exercise music during first countdown so audio keeps playing
        await music.play('exercise', { loop: true, fade: false });
        void enterFullscreen(overlay);
        void startWork();
      })();
    },
    destroy() {
      destroyed = true;
      clearCountdown();
      timer.stop();
      void music.stop({ fade: false });
      overlay.removeEventListener('click', onOverlayClick);
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  };
}

function setSessionBackground(exercise) {
  const bg = $('#session-bg');
  const panelImg = $('#session-exercise-img');
  const path = String(exercise?.image || '').replace(/^\//, '');
  const url = path ? `${path}?v=9` : '';

  if (bg) {
    if (!url) {
      bg.style.backgroundImage = 'none';
    } else {
      const preload = new Image();
      preload.onload = () => {
        bg.style.backgroundImage = `url("${url}")`;
      };
      preload.onerror = () => {
        bg.style.backgroundImage = 'none';
      };
      preload.src = url;
    }
  }

  if (panelImg) {
    if (!url) {
      panelImg.removeAttribute('src');
      panelImg.alt = 'Image manquante';
    } else {
      panelImg.alt = exercise?.name || 'Exercice';
      panelImg.src = url;
      panelImg.onerror = () => {
        panelImg.style.opacity = '0.3';
      };
      panelImg.onload = () => {
        panelImg.style.opacity = '1';
      };
    }
  }
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
    <div class="session-bg" id="session-bg" aria-hidden="true"></div>
    <div class="session-header">
      <div>
        <div class="brand-sub" id="session-day-title">Séance</div>
        <strong id="session-exercise-name">Exercice</strong>
      </div>
      <button class="btn btn-ghost" type="button" id="btn-close-session" aria-label="Fermer">✕</button>
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
      el('div', { className: 'badge done badge-pop', text: 'Badge obtenu' }),
      el('h2', { className: 'greeting', style: 'font-size:1.8rem;margin:1rem 0', text: 'Séance terminée' }),
      el('p', { className: 'card-text', text: `${day.name} — ${day.focus}` }),
      el('p', { className: 'stat-value', style: 'margin:1rem 0', text: formatDuration(durationSeconds) }),
      el('p', { className: 'card-text', text: `${calories} kcal estimées` }),
      el('div', { style: 'display:grid;gap:0.75rem;margin-top:1.25rem' }, [
        el('button', {
          className: 'btn btn-primary',
          type: 'button',
          text: 'Voir l\'historique',
          onClick: () => navigate('historique')
        }),
        el('button', {
          className: 'btn btn-secondary',
          type: 'button',
          text: 'Retour au programme',
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
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      // Force update so image/path fixes are not stuck in an old cache
      await Promise.all(regs.map((reg) => reg.update()));
      await navigator.serviceWorker.register(`sw.js?v=4`);
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
