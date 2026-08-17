import { getCachedSetting } from './storage.js';

/**
 * Playlist entraînement uniquement (le repos a sa propre liste).
 * Chaque exercice de la semaine a une piste stable (cycle si + d'exercices que de pistes).
 */
const EXERCISE_TRACKS = [
  'music/exercise-1.mp3',
  'music/exercise-2.mp3',
  'music/exercise-3.mp3',
  'music/exercise-4.mp3',
  'music/exercise-5.mp3',
  'music/exercise-6.mp3',
  'music/exercise-7.mp3',
  'music/exercise-8.mp3',
  'music/exercise-9.mp3',
  'music/exercise-10.mp3'
];

/** Ordre fixe des exercices de la semaine → même musique à chaque séance. */
const EXERCISE_IDS_ORDER = [
  'military-press-mon',
  'arms-superset-mon',
  'core-mon',
  'leg-press-tue',
  'leg-extension-tue',
  'leg-curl-tue',
  'hip-thrust-tue',
  'core-tue',
  'bench-press-thu',
  'incline-press-thu',
  'dips-thu',
  'arms-superset-thu',
  'lat-pulldown-fri',
  'seated-row-fri',
  'lateral-raise-fri',
  'front-raise-fri',
  'rear-delt-fri',
  'push-ups-classic-sun',
  'push-ups-wide-sun',
  'push-ups-close-sun',
  'push-ups-incline-sun',
  'push-ups-decline-sun'
];

/** Playlist repos : change à chaque phase de repos. */
const REST_TRACKS = [
  'music/rest-1.mp3',
  'music/rest-2.mp3',
  'music/rest-3.mp3',
  'music/rest-4.mp3',
  'music/rest-5.mp3',
  'music/rest-6.mp3',
  'music/rest-7.mp3',
  'music/rest-8.mp3',
  'music/rest-9.mp3',
  'music/rest-10.mp3',
  'music/rest-11.mp3',
  'music/rest-12.mp3'
];

const FINISH_TRACK = 'music/finish.mp3';

function trackForExerciseId(exerciseId) {
  const n = EXERCISE_TRACKS.length;
  const idx = EXERCISE_IDS_ORDER.indexOf(String(exerciseId || ''));
  if (idx >= 0) return EXERCISE_TRACKS[idx % n];
  // Fallback stable si nouvel id
  let hash = 0;
  const id = String(exerciseId || 'default');
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return EXERCISE_TRACKS[hash % n];
}

function makeAudio(src) {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.loop = true;
  if (src) audio.src = src;
  return audio;
}

class MusicPlayer {
  constructor() {
    this.players = {
      exercise: makeAudio(EXERCISE_TRACKS[0]),
      rest: makeAudio(REST_TRACKS[0]),
      finish: makeAudio(FINISH_TRACK)
    };
    this.players.finish.loop = false;
    this.currentKey = null;
    this.currentSrc = null;
    this.unlocked = false;
    this.duckLevel = 1;
    this.playToken = 0;
    this.restCursor = 0;
    this.restIndex = 0;
  }

  isEnabled() {
    if (getCachedSetting('musicEnabled') === false) return false;
    if (getCachedSetting('musicMuted') === true) return false;
    return true;
  }

  targetVolume() {
    const v = Number(getCachedSetting('musicVolume'));
    const base = Number.isFinite(v) ? v : 0.55;
    return Math.min(1, Math.max(0, base * this.duckLevel));
  }

  applyVolume(key = this.currentKey) {
    const audio = key ? this.players[key] : null;
    if (!audio) return;
    audio.muted = false;
    audio.volume = this.targetVolume();
  }

  stopAll() {
    Object.entries(this.players).forEach(([key, audio]) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      audio.loop = key !== 'finish';
    });
    this.currentKey = null;
    this.currentSrc = null;
  }

  async unlock() {
    if (this.unlocked) return true;
    try {
      const audio = this.players.exercise;
      audio.volume = 0.001;
      audio.loop = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      this.unlocked = true;
      return true;
    } catch (error) {
      console.warn('Music unlock:', error);
      this.unlocked = true;
      return false;
    }
  }

  duck(on) {
    this.duckLevel = on ? 0.18 : 1;
    if (this.currentKey && this.players[this.currentKey] && !this.players[this.currentKey].paused) {
      this.applyVolume(this.currentKey);
    }
  }

  resolveSrc(key, { exerciseId } = {}) {
    if (key === 'exercise') {
      return trackForExerciseId(exerciseId);
    }
    if (key === 'rest') {
      // Nouvelle piste uniquement à l'entrée en repos (pas sur le 2e play de la même phase)
      if (this.currentKey !== 'rest') {
        this.restIndex = this.restCursor % REST_TRACKS.length;
        this.restCursor += 1;
      }
      return REST_TRACKS[this.restIndex];
    }
    if (key === 'finish') return FINISH_TRACK;
    return null;
  }

  async play(key, { loop = true, exerciseId } = {}) {
    if (!this.isEnabled() || !this.players[key]) return false;

    const src = this.resolveSrc(key, { exerciseId });
    if (!src) return false;

    const token = ++this.playToken;
    await this.unlock();
    if (token !== this.playToken) return false;

    const audio = this.players[key];

    // Même piste déjà en cours (ex. séries suivantes du même exercice)
    if (this.currentKey === key && this.currentSrc === src && !audio.paused) {
      this.duck(false);
      this.applyVolume(key);
      return true;
    }

    // Coupe les autres slots
    Object.entries(this.players).forEach(([k, el]) => {
      if (k === key) return;
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    });

    if (token !== this.playToken) return false;

    if (this.currentSrc !== src || !audio.src.includes(src.split('/').pop())) {
      audio.src = src;
    }

    this.currentKey = key;
    this.currentSrc = src;
    audio.loop = Boolean(loop);
    this.duck(false);
    this.applyVolume(key);

    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }

    try {
      await audio.play();
      if (token !== this.playToken) {
        audio.pause();
        return false;
      }
      return true;
    } catch (error) {
      console.warn('Music play failed:', key, src, error);
      return false;
    }
  }

  async stop() {
    this.playToken += 1;
    this.duck(false);
    this.stopAll();
  }

  setMuted(muted) {
    const m = Boolean(muted);
    Object.values(this.players).forEach((audio) => {
      audio.muted = m;
    });
    if (!m && this.currentKey) this.applyVolume(this.currentKey);
  }

  setVolume() {
    if (this.currentKey) this.applyVolume(this.currentKey);
  }

  isPlaying() {
    const audio = this.currentKey ? this.players[this.currentKey] : null;
    return Boolean(audio && !audio.paused);
  }
}

export const music = new MusicPlayer();
