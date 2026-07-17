import { getSettings, updateSetting, updateSettings } from './storage.js';
import { music } from './music.js';
import { ensureNotificationPermission } from './ui.js';
import { clearAllData } from './database.js';

export function bindSettingsPage(root = document) {
  const settings = getSettings();

  const themeToggle = root.querySelector('#toggle-theme');
  const musicToggle = root.querySelector('#toggle-music');
  const muteToggle = root.querySelector('#toggle-mute');
  const notifToggle = root.querySelector('#toggle-notifications');
  const volume = root.querySelector('#range-volume');
  const rest = root.querySelector('#input-rest');
  const exercise = root.querySelector('#input-exercise');
  const nameInput = root.querySelector('#input-name');
  const resetBtn = root.querySelector('#btn-reset-data');

  syncToggle(themeToggle, settings.theme === 'dark');
  syncToggle(musicToggle, settings.musicEnabled);
  syncToggle(muteToggle, settings.musicMuted);
  syncToggle(notifToggle, settings.notifications);

  if (volume) volume.value = settings.musicVolume;
  if (rest) rest.value = settings.defaultRestSeconds;
  if (exercise) exercise.value = settings.defaultExerciseSeconds;
  if (nameInput) nameInput.value = settings.userName || '';

  themeToggle?.addEventListener('click', async () => {
    const next = getSettings().theme === 'dark' ? 'light' : 'dark';
    await updateSetting('theme', next);
    syncToggle(themeToggle, next === 'dark');
  });

  musicToggle?.addEventListener('click', async () => {
    const next = !getSettings().musicEnabled;
    await updateSetting('musicEnabled', next);
    syncToggle(musicToggle, next);
    if (!next) music.stop();
  });

  muteToggle?.addEventListener('click', async () => {
    const next = !getSettings().musicMuted;
    await updateSetting('musicMuted', next);
    music.setMuted(next);
    syncToggle(muteToggle, next);
  });

  notifToggle?.addEventListener('click', async () => {
    const next = !getSettings().notifications;
    if (next) await ensureNotificationPermission();
    await updateSetting('notifications', next);
    syncToggle(notifToggle, next);
  });

  volume?.addEventListener('input', async () => {
    const value = Number(volume.value);
    await updateSetting('musicVolume', value);
    music.setVolume(value);
  });

  rest?.addEventListener('change', async () => {
    await updateSetting('defaultRestSeconds', Number(rest.value) || 90);
  });

  exercise?.addEventListener('change', async () => {
    await updateSetting('defaultExerciseSeconds', Number(exercise.value) || 45);
  });

  nameInput?.addEventListener('change', async () => {
    await updateSetting('userName', nameInput.value.trim());
  });

  resetBtn?.addEventListener('click', async () => {
    const ok = window.confirm('Effacer tout l\'historique, les records et la progression ?');
    if (!ok) return;
    await clearAllData();
    await updateSettings({
      theme: getSettings().theme,
      musicEnabled: getSettings().musicEnabled,
      musicVolume: getSettings().musicVolume,
      musicMuted: getSettings().musicMuted,
      notifications: getSettings().notifications
    });
    window.alert('Données réinitialisées.');
    window.location.reload();
  });
}

function syncToggle(button, on) {
  if (!button) return;
  button.classList.toggle('on', Boolean(on));
  button.setAttribute('aria-pressed', String(Boolean(on)));
}
