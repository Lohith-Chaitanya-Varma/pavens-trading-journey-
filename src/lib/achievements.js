const DATABASE = 'pavens-trading-achievements-v1';
const STORE = 'achievements';
const LOCAL_STORAGE_KEY = 'pavens-trading-achievements-backup-v1';
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this browser environment.'));
    }
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage (IndexedDB) is currently unavailable.'));
  });
}

async function withStore(mode, work) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => {
        reject(new Error(e.target?.error?.message || 'Achievement storage could not be updated.'));
      };
    });
  } finally {
    database.close();
  }
}

export function assertAchievement(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Achievement data is required.');
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    throw new Error('Achievement must have a valid identifier.');
  }
  if (typeof value.title !== 'string' || !value.title.trim()) {
    throw new Error('Achievement title cannot be empty.');
  }
  if (typeof value.date !== 'string' || !value.date.trim()) {
    throw new Error('Achievement date is required.');
  }
  if (typeof value.description !== 'string') {
    throw new Error('Achievement description must be text.');
  }
  if (value.imageData && typeof value.imageData !== 'string') {
    throw new Error('Achievement image must be a valid data URL or string.');
  }
}

export async function listAchievements() {
  try {
    const records = await withStore('readonly', (store) => store.getAll());
    if (Array.isArray(records) && records.length) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
      } catch {}
      return records
        .filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string')
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }
  } catch (err) {
    console.warn('IndexedDB unavailable, checking localStorage fallback:', err);
  }

  try {
    const backup = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    if (Array.isArray(backup)) {
      return backup
        .filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string')
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }
  } catch {}
  return [];
}

export async function saveAchievement(value) {
  assertAchievement(value);
  let savedInIdb = false;
  try {
    await withStore('readwrite', (store) => store.put(value));
    savedInIdb = true;
  } catch (err) {
    console.warn('Could not save to IndexedDB, using localStorage fallback:', err);
  }

  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const filtered = Array.isArray(existing) ? existing.filter((item) => item.id !== value.id) : [];
    filtered.push(value);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch (lsErr) {
    if (!savedInIdb) {
      throw new Error('Storage quota exceeded. Please choose a smaller image.');
    }
  }
  return value;
}

export async function removeAchievement(id) {
  if (typeof id !== 'string' || !id) {
    throw new Error('The achievement could not be identified for removal.');
  }
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch {}

  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    if (Array.isArray(existing)) {
      const filtered = existing.filter((item) => item.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch {}
}

export function readAchievementImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error('Please select an image file.'));
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
      return reject(new Error('Unsupported file format. Please choose a JPG, PNG, or WebP image.'));
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return reject(new Error(`File size (${sizeMb} MB) exceeds the 3 MB limit for browser storage.`));
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode image data.'));
      }
    };
    reader.onerror = () => reject(new Error('The selected image file could not be read.'));
    reader.readAsDataURL(file);
  });
}
