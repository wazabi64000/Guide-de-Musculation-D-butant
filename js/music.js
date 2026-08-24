import { getCachedSetting } from './storage.js';

/** Playlist unique : enchaînement continu + boucle (exercice et repos). */
let SESSION_TRACKS = [];
let SESSION_LABELS = [];
let SESSION_LOOP = true;
let playlistPromise = null;

async function loadPlaylist() {
  if (!playlistPromise) {
    playlistPromise = fetch('music/playlist.json?v=73')
      .then((res) => (res.ok ? res.json() : { session: [] }))
      .then((data) => {
        SESSION_TRACKS = Array.isArray(data?.session) ? data.session.filter(Boolean) : [];
        SESSION_LABELS = Array.isArray(data?.labels) ? data.labels : [];
        SESSION_LOOP = data?.loop !== false;
        return SESSION_TRACKS;
      })
      .catch(() => {
        SESSION_TRACKS = [];
        SESSION_LABELS = [];
        return [];
      });
  }
  return playlistPromise;
}

function makeAudio() {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.loop = false;
  return audio;
}

class MusicPlayer {
  constructor() {
    this.audio = makeAudio();
    this.currentSrc = null;
    this.unlocked = false;
    this.duckLevel = 1;
    this.playToken = 0;
    this.sessionCursor = 0;
    this.sessionActive = false;
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

  nextSrc() {
    if (!SESSION_TRACKS.length) return null;
    if (SESSION_LOOP && this.sessionCursor >= SESSION_TRACKS.length) {
      this.sessionCursor = 0;
    }
    const src = SESSION_TRACKS[this.sessionCursor % SESSION_TRACKS.length];
    this.sessionCursor += 1;
    return src;
  }

  bindChain(token) {
    this.audio.onended = () => {
      if (token !== this.playToken || !this.sessionActive) return;
      void this.chainNext(token);
    };
  }

  async chainNext(token) {
    if (!this.isEnabled() || token !== this.playToken || !this.sessionActive) return;
    if (!SESSION_TRACKS.length) return;

    if (SESSION_LOOP && this.sessionCursor >= SESSION_TRACKS.length) {
      this.sessionCursor = 0;
    }

    for (let attempt = 0; attempt < SESSION_TRACKS.length; attempt += 1) {
      const src = this.nextSrc();
      if (!src) return;
      const ok = await this.playSrc(src, token);
      if (ok) return;
    }
  }

  async playSrc(src, token) {
    if (!this.isEnabled() || !src || token !== this.playToken) return false;

    if (this.currentSrc !== src || !this.audio.src.includes(src.split('/').pop())) {
      this.audio.src = src;
    }
    this.currentSrc = src;
    this.audio.loop = false;
    this.duck(false);
    this.applyVolume();
    this.bindChain(token);

    try {
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }

    try {
      await this.audio.play();
      if (token !== this.playToken) {
        this.audio.pause();
        return false;
      }
      return true;
    } catch (error) {
      console.warn('Music play failed:', src, error);
      return false;
    }
  }

  stopPlayback() {
    try {
      this.audio.onended = null;
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.currentSrc = null;
  }

  async unlock() {
    await loadPlaylist();
    if (this.unlocked) return true;
    try {
      const src = SESSION_TRACKS[0];
      if (!src) {
        this.unlocked = true;
        return false;
      }
      this.audio.src = src;
      this.audio.volume = 0.001;
      await this.audio.play();
      this.audio.pause();
      this.audio.currentTime = 0;
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
    if (!this.audio.paused) this.applyVolume();
  }

  /** Démarre la playlist séance (ne coupe pas si déjà en cours). */
  async startSession() {
    if (!this.isEnabled()) return false;
    await loadPlaylist();
    if (!SESSION_TRACKS.length) return false;

    if (this.sessionActive && !this.audio.paused) {
      return true;
    }

    const token = ++this.playToken;
    await this.unlock();
    if (token !== this.playToken) return false;

    this.sessionActive = true;

    for (let attempt = 0; attempt < SESSION_TRACKS.length; attempt += 1) {
      const src = this.nextSrc();
      if (!src) return false;
      const ok = await this.playSrc(src, token);
      if (ok) return true;
    }
    return false;
  }

  /** Recommence la playlist depuis le début (bouton Recommencer). */
  async restartSession() {
    this.playToken += 1;
    this.stopPlayback();
    this.sessionCursor = 0;
    this.sessionActive = false;
    return this.startSession();
  }

  /** Fin de séance — coupe tout. */
  async stop() {
    this.playToken += 1;
    this.sessionActive = false;
    this.duck(false);
    this.stopPlayback();
  }

  togglePause(paused) {
    if (!this.sessionActive) return;
    if (paused) {
      try {
        this.audio.pause();
      } catch {
        /* ignore */
      }
    } else {
      this.audio.play().catch(() => {});
    }
  }

  setMuted(muted) {
    this.audio.muted = Boolean(muted);
    if (!muted) this.applyVolume();
  }

  setVolume() {
    this.applyVolume();
  }

  isPlaying() {
    return Boolean(this.sessionActive && !this.audio.paused);
  }

  async getPlaylistInfo() {
    await loadPlaylist();
    return {
      sessionCount: SESSION_TRACKS.length,
      labels: SESSION_LABELS
    };
  }

  reloadPlaylist() {
    playlistPromise = null;
    SESSION_TRACKS = [];
    SESSION_LABELS = [];
    return loadPlaylist();
  }

  /** @deprecated Compatibilité — utilise startSession. */
  async play(key) {
    if (key === 'exercise' || key === 'session') return this.startSession();
    return false;
  }
}

export const music = new MusicPlayer();
