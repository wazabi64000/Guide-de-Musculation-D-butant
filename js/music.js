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
    this.currentKey = null;
    this.fadeTimer = null;
    this.unlocked = false;
    this.available = {};

    Object.entries(TRACKS).forEach(([key, src]) => {
      this.probe(key, src);
    });

    this.audio.addEventListener('ended', () => {
      if (this.currentKey === 'exercise' || this.currentKey === 'rest') {
        this.audio.currentTime = 0;
        this.audio.play().catch(() => {});
      }
    });
  }

  probe(key, src) {
    const test = new Audio();
    test.preload = 'metadata';
    test.src = src;
    test.addEventListener('canplaythrough', () => {
      this.available[key] = true;
    });
    test.addEventListener('error', () => {
      this.available[key] = false;
    });
  }

  unlock() {
    if (this.unlocked) return Promise.resolve();
    this.unlocked = true;
    this.audio.volume = 0;
    const playAttempt = this.audio.play().then(() => {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.applyVolume();
    }).catch(() => {
      this.applyVolume();
    });
    // Never block the UI if autoplay hangs
    return Promise.race([
      playAttempt,
      new Promise((resolve) => setTimeout(resolve, 400))
    ]);
  }

  isEnabled() {
    return getCachedSetting('musicEnabled') && !getCachedSetting('musicMuted');
  }

  applyVolume(target = null) {
    const volume = target ?? Number(getCachedSetting('musicVolume') ?? 0.55);
    this.audio.volume = Math.min(1, Math.max(0, volume));
  }

  async fadeTo(volume, duration = 400) {
    const start = this.audio.volume;
    const end = Math.min(1, Math.max(0, volume));
    const steps = 12;
    const stepTime = duration / steps;
    clearInterval(this.fadeTimer);

    return new Promise((resolve) => {
      let i = 0;
      this.fadeTimer = setInterval(() => {
        i += 1;
        const t = i / steps;
        this.audio.volume = start + (end - start) * t;
        if (i >= steps) {
          clearInterval(this.fadeTimer);
          this.audio.volume = end;
          resolve();
        }
      }, stepTime);
    });
  }

  async play(key, { loop = false, fade = true } = {}) {
    if (!this.isEnabled()) return;
    if (this.available[key] === false) return;
    if (!TRACKS[key]) return;

    await this.unlock();

    if (this.currentKey === key && !this.audio.paused) {
      this.applyVolume();
      return;
    }

    if (fade && !this.audio.paused) {
      await this.fadeTo(0, 250);
    }

    this.currentKey = key;
    this.audio.loop = loop;
    this.audio.src = TRACKS[key];

    try {
      this.audio.currentTime = 0;
      if (fade) this.audio.volume = 0;
      else this.applyVolume();
      await this.audio.play();
      if (fade) {
        const target = Number(getCachedSetting('musicVolume') ?? 0.55);
        await this.fadeTo(target, 450);
      }
    } catch {
      // Missing file or autoplay restriction: continue silently
    }
  }

  async stop({ fade = true } = {}) {
    if (this.audio.paused) return;
    if (fade) await this.fadeTo(0, 300);
    this.audio.pause();
    this.audio.currentTime = 0;
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
}

export const music = new MusicPlayer();
