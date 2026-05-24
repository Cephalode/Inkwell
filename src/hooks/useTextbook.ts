import { useState, useCallback } from 'react';
import { extractPageRange, getPDFPageCount } from '../services/parsers/index';
import { chatCompletion } from '../services/ai/client';
import { TEXTBOOK_CHAT_PROMPT } from '../services/ai/prompts';

export function useTextbook() {
  const [pageCount, setPageCount] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [extractedText, setExtractedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadPDF = useCallback(async (file: File | Blob) => {
    const count = await getPDFPageCount(file);
    setPageCount(count);
    setEndPage(count);
    return count;
  }, []);

  const selectPageRange = useCallback(async (file: File | Blob | ArrayBuffer, start: number, end: number) => {
    setIsLoading(true);
    try {
      const text = await extractPageRange(file, start, end);
      setStartPage(start);
      setEndPage(end);
      setExtractedText(text);
      return text;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const askQuestion = useCallback(async (question: string): Promise<string> => {
    if (!extractedText) throw new Error('No pages selected');
    const pageRange = `pages ${startPage}-${endPage}`;
    const messages = [
      { role: 'system', content: TEXTBOOK_CHAT_PROMPT(extractedText, pageRange) },
      { role: 'user', content: question },
    ];
    return chatCompletion(messages);
  }, [extractedText, startPage, endPage]);

  return {
    pageCount, startPage, endPage, extractedText, isLoading,
    loadPDF, selectPageRange, askQuestion,
    setStartPage, setEndPage,
  };
}
