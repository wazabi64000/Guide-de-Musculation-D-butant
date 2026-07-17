import { getCachedSetting } from './storage.js';

const TRACKS = {
  exercise: 'music/exercise.mp3',
  rest: 'music/rest.mp3',
  finish: 'music/finish.mp3'
};

function makeAudio(src) {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.loop = true;
  audio.src = src;
  return audio;
}

class MusicPlayer {
  constructor() {
    /** @type {Record<string, HTMLAudioElement>} */
    this.players = {
      exercise: makeAudio(TRACKS.exercise),
      rest: makeAudio(TRACKS.rest),
      finish: makeAudio(TRACKS.finish)
    };
    this.currentKey = null;
    this.unlocked = false;
    this.duckLevel = 1;
    this.playToken = 0;
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

  /** Hard-stop every track so nothing can overlap. */
  stopAll() {
    Object.entries(this.players).forEach(([key, audio]) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      if (key === 'finish') audio.loop = false;
      else audio.loop = true;
    });
    this.currentKey = null;
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

  /** Lower volume during countdown beeps */
  duck(on) {
    this.duckLevel = on ? 0.18 : 1;
    if (this.currentKey && this.players[this.currentKey] && !this.players[this.currentKey].paused) {
      this.applyVolume(this.currentKey);
    }
  }

  async play(key, { loop = true } = {}) {
    if (!this.isEnabled() || !this.players[key]) return false;

    const token = ++this.playToken;
    await this.unlock();
    if (token !== this.playToken) return false;

    const audio = this.players[key];

    // Same track already playing — just restore volume
    if (this.currentKey === key && !audio.paused) {
      this.duck(false);
      this.applyVolume(key);
      return true;
    }

    // Stop every other track first (prevents exercise + rest overlap)
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

    this.currentKey = key;
    audio.loop = Boolean(loop);
    this.duck(false);
    this.applyVolume(key);

    try {
      if (audio.currentTime > 0.05) audio.currentTime = 0;
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
      console.warn('Music play failed:', key, error);
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
