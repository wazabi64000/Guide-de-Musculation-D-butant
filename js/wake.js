/** Keep the screen on while the app is in the foreground (Screen Wake Lock API). */

let wakeLock = null;
let enabled = true;

async function requestWakeLock() {
  if (!enabled) return null;
  if (!('wakeLock' in navigator)) return null;
  if (document.visibilityState !== 'visible') return null;

  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
    return wakeLock;
  } catch {
    wakeLock = null;
    return null;
  }
}

export async function enableWakeLock() {
  enabled = true;
  return requestWakeLock();
}

export async function disableWakeLock() {
  enabled = false;
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

export function initWakeLock() {
  void requestWakeLock();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled) {
      void requestWakeLock();
    }
  });

  // Some browsers release the lock after user gestures stop; re-request on interaction.
  ['pointerdown', 'touchstart', 'keydown'].forEach((type) => {
    document.addEventListener(
      type,
      () => {
        if (enabled && !wakeLock && document.visibilityState === 'visible') {
          void requestWakeLock();
        }
      },
      { passive: true }
    );
  });
}

export function isWakeLockActive() {
  return Boolean(wakeLock);
}
