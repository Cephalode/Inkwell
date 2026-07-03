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
      // Note: Legacy StudyForge object stores (studySessions, flashcards, quizzes,
      // chatSessions, courses, chapters) were removed when the app migrated from
      // IndexedDB to Postgres. Any orphaned stores left in older user DBs are
      // harmless and intentionally not cleaned up here (they reference store names
      // that no longer exist in the InkwellDB schema union).
    },
    blocked() {
      console.warn('IndexedDB open blocked — closing stale connections');
      dbInstance?.close();
      dbInstance = null;
    },
  });
  return dbInstance;
}
