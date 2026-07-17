export class Timer {
  constructor({ onTick, onComplete, onEndingBeep } = {}) {
    this.onTick = onTick || (() => {});
    this.onComplete = onComplete || (() => {});
    this.onEndingBeep = onEndingBeep || (() => {});
    this.duration = 0;
    this.remaining = 0;
    this.running = false;
    this.paused = false;
    this.rafId = null;
    this.lastTs = 0;
    this.beepedSeconds = new Set();
    this.completed = false;
  }

  start(seconds) {
    this.stop(false);
    this.duration = Math.max(1, Number(seconds) || 1);
    this.remaining = this.duration;
    this.running = true;
    this.paused = false;
    this.completed = false;
    this.beepedSeconds = new Set();
    this.lastTs = performance.now();
    this.onTick(this.getState());
    this.loop();
  }

  loop() {
    if (!this.running || this.paused) return;

    const now = performance.now();
    const delta = (now - this.lastTs) / 1000;
    this.lastTs = now;
    this.remaining = Math.max(0, this.remaining - delta);

    const ceil = Math.ceil(this.remaining);
    if (ceil >= 1 && ceil <= 3 && this.duration > 5 && !this.beepedSeconds.has(ceil)) {
      this.beepedSeconds.add(ceil);
      this.onEndingBeep(ceil, this.getState());
    }

    this.onTick(this.getState());

    if (this.remaining <= 0) {
      this.running = false;
      if (!this.completed) {
        this.completed = true;
        this.onComplete(this.getState());
      }
      return;
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.lastTs = performance.now();
    this.loop();
  }

  toggle() {
    if (!this.running) return;
    if (this.paused) this.resume();
    else this.pause();
  }

  stop(resetCompleted = true) {
    this.running = false;
    this.paused = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (resetCompleted) this.completed = false;
  }

  /** End current phase once (safe against double fire). */
  finish() {
    if (this.completed) return;
    this.stop(false);
    this.remaining = 0;
    this.completed = true;
    this.onTick(this.getState());
    this.onComplete(this.getState());
  }

  skip() {
    this.finish();
  }

  getState() {
    const progress = this.duration > 0 ? 1 - this.remaining / this.duration : 1;
    return {
      duration: this.duration,
      remaining: this.remaining,
      progress: Math.min(1, Math.max(0, progress)),
      running: this.running,
      paused: this.paused
    };
  }
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m} min ${s > 0 ? `${s}s` : ''}`.trim();
  return `${s}s`;
}
