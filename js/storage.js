import {
  getAllSettings,
  getSetting,
  setSetting
} from './database.js';

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  musicEnabled: true,
  musicVolume: 0.55,
  musicMuted: false,
  musicAutoplay: true,
  defaultRestSeconds: 75,
  defaultExerciseSeconds: 40,
  notifications: true,
  userName: ''
};

let cache = { ...DEFAULT_SETTINGS };
let ready = false;

export async function initStorage() {
  const stored = await getAllSettings();
  cache = { ...DEFAULT_SETTINGS, ...stored };
  applyTheme(cache.theme);
  ready = true;
  return cache;
}

export function getSettings() {
  return { ...cache };
}

export function getCachedSetting(key) {
  return cache[key];
}

export async function updateSetting(key, value) {
  cache[key] = value;
  await setSetting(key, value);
  if (key === 'theme') applyTheme(value);
  window.dispatchEvent(new CustomEvent('settings:changed', { detail: { key, value } }));
  return cache[key];
}

export async function updateSettings(partial) {
  const entries = Object.entries(partial);
  for (const [key, value] of entries) {
    cache[key] = value;
    await setSetting(key, value);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'theme')) {
    applyTheme(partial.theme);
  }
  window.dispatchEvent(new CustomEvent('settings:changed', { detail: { bulk: true } }));
  return getSettings();
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}

export async function ensureSetting(key, fallback) {
  const value = await getSetting(key, undefined);
  if (value === undefined) {
    await setSetting(key, fallback);
    cache[key] = fallback;
    return fallback;
  }
  cache[key] = value;
  return value;
}

export function isStorageReady() {
  return ready;
}
