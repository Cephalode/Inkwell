import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DocumentFile } from '../../types/document';
import { AppSettings } from '../../types/settings';

interface InkwellDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentFile & { rawBlob?: ArrayBuffer };
    indexes: { 'by-type': string; 'by-date': number };
  };
  settings: {
    key: string;
    value: AppSettings;
  };
}

let dbInstance: IDBPDatabase<InkwellDB> | null = null;

/**
 * One-time migration from old 'studyforge' IndexedDB to new 'inkwell' DB.
 * If 'inkwell' DB is empty/fresh but 'studyforge' DB exists, copy all data over.
 */
async function migrateFromStudyForge(): Promise<void> {
  try {
    // Check if old DB exists by trying to open it
    const oldDB = await openDB('studyforge', 1).catch(() => null);
    if (!oldDB) return;

    // Check if new DB already has data by counting documents
    const newDB = await openDB<InkwellDB>('inkwell', 3, {
      upgrade(db) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('by-type', 'type');
        docStore.createIndex('by-date', 'createdAt');

        db.createObjectStore('settings', { keyPath: 'ai' });
      },
    });

    // Only migrate if new DB has no documents
    const docCount = await newDB.count('documents');
    if (docCount > 0) {
      oldDB.close();
      newDB.close();
      return;
    }

    // Migrate relevant object stores (skip flashcards/quizzes which are removed)
    const storeNames = ['documents', 'settings'] as const;

    for (const storeName of storeNames) {
      try {
        // Check if old DB has this store
        if (!oldDB.objectStoreNames.contains(storeName)) continue;
        const allRecords = await oldDB.getAll(storeName);
        if (allRecords.length === 0) continue;

        const tx = newDB.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const record of allRecords) {
          await store.put(record);
        }
        await tx.done;
      } catch {
        // Skip stores that don't exist in old DB
      }
    }

    oldDB.close();
    newDB.close();

    // Delete old DB after successful migration
    await indexedDB.deleteDatabase('studyforge');
    console.log('✅ Migrated data from StudyForge to Inkwell DB');
  } catch (err) {
    // Non-critical — just log and continue
    console.warn('IndexedDB migration skipped:', err);
  }
}

export async function getDB(): Promise<IDBPDatabase<InkwellDB>> {
  if (dbInstance) return dbInstance;

  // Run migration before opening the new DB for normal use
  await migrateFromStudyForge();

  dbInstance = await openDB<InkwellDB>('inkwell', 7, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('by-type', 'type');
        docStore.createIndex('by-date', 'createdAt');

        db.createObjectStore('settings', { keyPath: 'ai' });
      }
      // Version 5: remove studySessions object store (no longer used)
      if (oldVersion < 5 && db.objectStoreNames.contains('studySessions')) {
        db.deleteObjectStore('studySessions');
      }
      // Version 6: remove flashcards and quizzes object stores (no longer used)
      if (oldVersion < 6) {
        if (db.objectStoreNames.contains('flashcards')) {
          db.deleteObjectStore('flashcards');
        }
        if (db.objectStoreNames.contains('quizzes')) {
          db.deleteObjectStore('quizzes');
        }
      }
      // Version 7: remove chatSessions, chapters, courses object stores (migrated to Postgres)
      if (oldVersion < 7) {
        if (db.objectStoreNames.contains('chatSessions')) db.deleteObjectStore('chatSessions');
        if (db.objectStoreNames.contains('courses')) db.deleteObjectStore('courses');
        if (db.objectStoreNames.contains('chapters')) db.deleteObjectStore('chapters');
      }
    },
    blocked() {
      console.warn('IndexedDB open blocked — closing stale connections');
      dbInstance?.close();
      dbInstance = null;
    },
  });
  return dbInstance;
}
