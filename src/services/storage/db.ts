import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DocumentFile } from '../../types/document';
import { Flashcard } from '../../types/flashcard';
import { Quiz } from '../../types/quiz';
import { StudySession } from '../../types/progress';
import { AppSettings } from '../../types/settings';
import { ChatSession } from '../../types/chat';

interface StudyForgeDB extends DBSchema {
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
}

let dbInstance: IDBPDatabase<StudyForgeDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<StudyForgeDB>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<StudyForgeDB>('studyforge', 1, {
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
    },
  });
  return dbInstance;
}
