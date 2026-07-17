import { getCachedSetting } from './storage.js';

const TRACKS = {
  exercise: 'music/exercise.mp3',
  rest: 'music/rest.mp3',
  finish: 'music/finish.mp3',
  countdown: 'music/countdown.mp3'
};

class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.playsInline = true;
    this.currentKey = null;
    this.fadeTimer = null;
    this.unlocked = false;
    this.playToken = 0;
  }

  isEnabled() {
    // Default ON if settings not loaded yet
    const enabled = getCachedSetting('musicEnabled');
    const muted = getCachedSetting('musicMuted');
    if (enabled === false) return false;
    if (muted === true) return false;
    return true;
  }

  targetVolume() {
    const v = Number(getCachedSetting('musicVolume'));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
  }

  applyVolume(volume = this.targetVolume()) {
    this.audio.muted = false;
    this.audio.volume = Math.min(1, Math.max(0, volume));
  }

  /**
   * Must be called from a user gesture (click).
   * Preloads exercise track so later plays are allowed.
   */
  async unlock() {
    if (this.unlocked && !this.audio.paused) {
      return true;
    }

    try {
      // Prime with the exercise track under the user gesture
      if (!this.audio.src || !this.audio.src.includes('exercise.mp3')) {
        this.audio.src = TRACKS.exercise;
        this.currentKey = 'exercise';
      }
      this.audio.loop = true;
      this.audio.volume = 0.001;
      await this.audio.play();
      this.audio.pause();
      this.audio.currentTime = 0;
      this.applyVolume();
      this.unlocked = true;
      return true;
    } catch (error) {
      console.warn('Music unlock failed:', error);
      this.unlocked = true; // still allow later attempts
      this.applyVolume();
      return false;
    }
  }

  clearFade() {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  fadeTo(volume, duration = 350) {
    this.clearFade();
    const start = this.audio.volume;
    const end = Math.min(1, Math.max(0, volume));
    if (duration <= 0) {
      this.audio.volume = end;
      return Promise.resolve();
    }

    const steps = 10;
    const stepTime = duration / steps;

    return new Promise((resolve) => {
      let i = 0;
      this.fadeTimer = setInterval(() => {
        i += 1;
        const t = i / steps;
        this.audio.volume = start + (end - start) * t;
        if (i >= steps) {
          this.clearFade();
          this.audio.volume = end;
          resolve();
        }
      }, stepTime);
    });
  }

  async play(key, { loop = true, fade = true } = {}) {
    if (!this.isEnabled()) {
      console.info('Music disabled in settings');
      return false;
    }
    if (!TRACKS[key]) return false;

    const token = ++this.playToken;
    await this.unlock();
    if (token !== this.playToken) return false;

    // Already playing this track
    if (this.currentKey === key && !this.audio.paused) {
      this.applyVolume();
      return true;
    }

    this.clearFade();
    this.currentKey = key;
    this.audio.loop = Boolean(loop);

    const nextSrc = TRACKS[key];
    const absolute = new URL(nextSrc, window.location.href).href;
    if (this.audio.src !== absolute) {
      this.audio.src = nextSrc;
    }

    try {
      this.audio.currentTime = 0;
    } catch {
      /* ignore seek errors while loading */
    }

    try {
      if (fade) this.audio.volume = 0.001;
      else this.applyVolume();

      await this.audio.play();

      if (token !== this.playToken) return false;

      if (fade) {
        await this.fadeTo(this.targetVolume(), 400);
      } else {
        this.applyVolume();
      }

      // Safety: never leave silent
      if (this.audio.volume < 0.05 && this.isEnabled()) {
        this.applyVolume();
      }

      return true;
    } catch (error) {
      console.warn('Music play failed:', key, error);
      // Retry once without fade
      try {
        this.applyVolume();
        await this.audio.play();
        return true;
      } catch (retryError) {
        console.warn('Music retry failed:', retryError);
        return false;
      }
    }
  }

  async stop({ fade = false } = {}) {
    this.playToken += 1;
    this.clearFade();
    if (this.audio.paused) {
      this.currentKey = null;
      return;
    }
    if (fade) await this.fadeTo(0, 200);
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.currentKey = null;
    this.applyVolume();
  }

  setMuted(muted) {
    this.audio.muted = Boolean(muted);
    if (!muted) this.applyVolume();
  }

  setVolume(volume) {
    this.applyVolume(volume);
  }

  isPlaying() {
    return !this.audio.paused;
  }
}

export const music = new MusicPlayer();
