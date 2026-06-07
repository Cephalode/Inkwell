import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DocumentFile } from '../../types/document';
import { Flashcard } from '../../types/flashcard';
import { Quiz } from '../../types/quiz';
import { StudySession } from '../../types/progress';
import { AppSettings } from '../../types/settings';
import { ChatSession } from '../../types/chat';
import { ChapterDocument } from '../../types/document';
import { Course } from '../../types/course';

interface InkwellDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentFile & { rawBlob?: ArrayBuffer };
    indexes: { 'by-type': string; 'by-date': number };
  };
  flashcards: {
    key: string;
    value: Flashcard;
    indexes: { 'by-deck': string; 'by-document': string; 'by-review': number };
  };
  quizzes: {
    key: string;
    value: Quiz;
    indexes: { 'by-document': string };
  };
  studySessions: {
    key: string;
    value: StudySession;
    indexes: { 'by-date': number; 'by-type': string };
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  chatSessions: {
    key: string;
    value: ChatSession;
    indexes: { 'by-date': number };
  };
  chapters: {
    key: string;
    value: ChapterDocument & { rawBlob?: ArrayBuffer };
    indexes: { 'by-parent': string; 'by-date': number };
  };
  courses: {
    key: string;
    value: Course;
    indexes: { 'by-date': number };
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

        const fcStore = db.createObjectStore('flashcards', { keyPath: 'id' });
        fcStore.createIndex('by-deck', 'deck');
        fcStore.createIndex('by-document', 'documentId');
        fcStore.createIndex('by-review', 'nextReview');

        const quizStore = db.createObjectStore('quizzes', { keyPath: 'id' });
        quizStore.createIndex('by-document', 'documentId');

        const sessionStore = db.createObjectStore('studySessions', { keyPath: 'id' });
        sessionStore.createIndex('by-date', 'date');
        sessionStore.createIndex('by-type', 'type');

        db.createObjectStore('settings', { keyPath: 'ai' });

        const chatStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
        chatStore.createIndex('by-date', 'updatedAt');

        if (!db.objectStoreNames.contains('chapters')) {
          const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chapterStore.createIndex('by-parent', 'parentId');
          chapterStore.createIndex('by-date', 'createdAt');
        }
      },
    });

    // Only migrate if new DB has no documents
    const docCount = await newDB.count('documents');
    if (docCount > 0) {
      oldDB.close();
      newDB.close();
      return;
    }

    // Migrate all object stores
    const storeNames = ['documents', 'flashcards', 'quizzes', 'studySessions', 'settings', 'chatSessions'] as const;

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

  dbInstance = await openDB<InkwellDB>('inkwell', 4, {
    upgrade(db) {
      const docStore = db.createObjectStore('documents', { keyPath: 'id' });
      docStore.createIndex('by-type', 'type');
      docStore.createIndex('by-date', 'createdAt');

      const fcStore = db.createObjectStore('flashcards', { keyPath: 'id' });
      fcStore.createIndex('by-deck', 'deck');
      fcStore.createIndex('by-document', 'documentId');
      fcStore.createIndex('by-review', 'nextReview');

      const quizStore = db.createObjectStore('quizzes', { keyPath: 'id' });
      quizStore.createIndex('by-document', 'documentId');

      const sessionStore = db.createObjectStore('studySessions', { keyPath: 'id' });
      sessionStore.createIndex('by-date', 'date');
      sessionStore.createIndex('by-type', 'type');

      db.createObjectStore('settings', { keyPath: 'ai' });

      const chatStore = db.createObjectStore('chatSessions', { keyPath: 'id' });
      chatStore.createIndex('by-date', 'updatedAt');

      if (!db.objectStoreNames.contains('chapters')) {
        const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
        chapterStore.createIndex('by-parent', 'parentId');
        chapterStore.createIndex('by-date', 'createdAt');
      }
      if (!db.objectStoreNames.contains('courses')) {
        const courseStore = db.createObjectStore('courses', { keyPath: 'id' });
        courseStore.createIndex('by-date', 'createdAt');
      }
    },
  });
  return dbInstance;
}
