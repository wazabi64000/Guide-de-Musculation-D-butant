import { getCachedSetting } from './storage.js';

/** Une piste d'exercice par série (cycle si plus de séries que de pistes). */
const EXERCISE_TRACKS = [
  'music/exercise-1.mp3',
  'music/exercise-2.mp3',
  'music/exercise-3.mp3',
  'music/exercise-4.mp3'
];

/** Playlist repos : change à chaque phase de repos. */
const REST_TRACKS = [
  'music/rest-1.mp3',
  'music/rest-2.mp3',
  'music/rest-3.mp3',
  'music/rest-4.mp3',
  'music/rest-5.mp3'
];

const FINISH_TRACK = 'music/finish.mp3';

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

  resolveSrc(key, { setIndex } = {}) {
    if (key === 'exercise') {
      const n = EXERCISE_TRACKS.length;
      const i = Math.max(0, (Number(setIndex) || 1) - 1) % n;
      return EXERCISE_TRACKS[i];
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

  async play(key, { loop = true, setIndex } = {}) {
    if (!this.isEnabled() || !this.players[key]) return false;

    const src = this.resolveSrc(key, { setIndex });
    if (!src) return false;

    const token = ++this.playToken;
    await this.unlock();
    if (token !== this.playToken) return false;

    const audio = this.players[key];

    // Même piste déjà en cours
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
