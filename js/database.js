const DB_NAME = 'muscu-tracker';
const DB_VERSION = 1;
const STORES = {
  sessions: 'sessions',
  settings: 'settings',
  progress: 'progress',
  records: 'records',
  notes: 'notes'
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.sessions)) {
        const sessions = db.createObjectStore(STORES.sessions, {
          keyPath: 'id',
          autoIncrement: true
        });
        sessions.createIndex('byDate', 'date', { unique: false });
        sessions.createIndex('byDayId', 'dayId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.progress)) {
        db.createObjectStore(STORES.progress, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.records)) {
        db.createObjectStore(STORES.records, { keyPath: 'exerciseId' });
      }

      if (!db.objectStoreNames.contains(STORES.notes)) {
        db.createObjectStore(STORES.notes, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    return {
      store: transaction.objectStore(storeName),
      done: new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      })
    };
  });
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSetting(key, fallback = null) {
  const { store } = await tx(STORES.settings);
  const result = await req(store.get(key));
  return result ? result.value : fallback;
}

export async function setSetting(key, value) {
  const { store, done } = await tx(STORES.settings, 'readwrite');
  store.put({ key, value });
  await done;
}

export async function getAllSettings() {
  const { store } = await tx(STORES.settings);
  const rows = await req(store.getAll());
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function saveSession(session) {
  const { store, done } = await tx(STORES.sessions, 'readwrite');
  const id = await req(store.add(session));
  await done;
  return id;
}

export async function getSessions() {
  const { store } = await tx(STORES.sessions);
  const sessions = await req(store.getAll());
  return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function getProgress(key, fallback = null) {
  const { store } = await tx(STORES.progress);
  const result = await req(store.get(key));
  return result ? result.value : fallback;
}

export async function setProgress(key, value) {
  const { store, done } = await tx(STORES.progress, 'readwrite');
  store.put({ key, value });
  await done;
}

export async function getAllProgress() {
  const { store } = await tx(STORES.progress);
  const rows = await req(store.getAll());
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getRecord(exerciseId) {
  const { store } = await tx(STORES.records);
  return req(store.get(exerciseId));
}

export async function getAllRecords() {
  const { store } = await tx(STORES.records);
  return req(store.getAll());
}

export async function upsertRecord(exerciseId, weight, date = new Date().toISOString()) {
  const current = await getRecord(exerciseId);
  if (current && Number(current.weight) >= Number(weight)) {
    return current;
  }

  const record = { exerciseId, weight: Number(weight), date };
  const { store, done } = await tx(STORES.records, 'readwrite');
  store.put(record);
  await done;
  return record;
}

export async function saveNote(id, note) {
  const { store, done } = await tx(STORES.notes, 'readwrite');
  store.put({ id, note, updatedAt: new Date().toISOString() });
  await done;
}

export async function getNote(id) {
  const { store } = await tx(STORES.notes);
  const result = await req(store.get(id));
  return result ? result.note : '';
}

export async function clearAllData() {
  const db = await openDB();
  const names = [STORES.sessions, STORES.progress, STORES.records, STORES.notes];
  await Promise.all(
    names.map(
      (name) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(name, 'readwrite');
          transaction.objectStore(name).clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        })
    )
  );
}

export { STORES, openDB };
