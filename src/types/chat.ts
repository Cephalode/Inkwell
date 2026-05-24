export interface Citation {
  documentId: string;
  documentName: string;
  pageNumber?: number;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  timestamp: number;
}

export interface ChatSession {
  id: string;
  documentId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
