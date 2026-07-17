import { getCachedSetting } from './storage.js';

const TRACKS = {
  exercise: 'music/exercise.mp3',
  rest: 'music/rest.mp3',
  finish: 'music/finish.mp3'
};

class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.playsInline = true;
    this.currentKey = null;
    this.unlocked = false;
    this.duckLevel = 1;
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

  applyVolume() {
    this.audio.muted = false;
    this.audio.volume = this.targetVolume();
  }

  async unlock() {
    if (this.unlocked) return true;
    try {
      this.audio.src = TRACKS.exercise;
      this.audio.loop = true;
      this.audio.volume = 0.001;
      await this.audio.play();
      this.audio.pause();
      this.audio.currentTime = 0;
      this.unlocked = true;
      this.applyVolume();
      return true;
    } catch (error) {
      console.warn('Music unlock:', error);
      this.unlocked = true;
      return false;
    }
  }

  /** Lower volume during countdown beeps */
  duck(on) {
    this.duckLevel = on ? 0.2 : 1;
    if (!this.audio.paused) this.applyVolume();
  }

  async play(key, { loop = true } = {}) {
    if (!this.isEnabled() || !TRACKS[key]) return false;
    await this.unlock();

    const same = this.currentKey === key && this.audio.src.includes(`${key}.mp3`);
    if (same && !this.audio.paused) {
      this.duck(false);
      this.applyVolume();
      return true;
    }

    this.currentKey = key;
    this.audio.loop = Boolean(loop);
    this.audio.src = TRACKS[key];

    try {
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }

    try {
      this.duck(false);
      this.applyVolume();
      await this.audio.play();
      return true;
    } catch (error) {
      console.warn('Music play failed:', key, error);
      return false;
    }
  }

  async stop() {
    this.duck(false);
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.currentKey = null;
  }

  setMuted(muted) {
    this.audio.muted = Boolean(muted);
    if (!muted) this.applyVolume();
  }

  setVolume() {
    this.applyVolume();
  }

  isPlaying() {
    return !this.audio.paused;
  }
}

export const music = new MusicPlayer();
