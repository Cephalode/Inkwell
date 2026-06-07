import { useEffect, useRef, useCallback } from 'react';
import { usePomodoroStore } from '../store/pomodoroStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProgressStore } from '../store/progressStore';
import { saveStudySession } from '../services/storage/progressStore';
import { generateUUID } from '../utils/uuid';

export function usePomodoro() {
  const {
    isRunning, phase, timeRemaining, sessionsCompleted,
    start, pause, reset, tick, setPhase, setTimeRemaining, completeSession,
  } = usePomodoroStore();
  const settings = useSettingsStore((s) => s.settings.pomodoro);
  const addSession = useProgressStore((s) => s.addSession);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        tick();
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, tick]);

  useEffect(() => {
    if (timeRemaining === 0 && isRunning) {
      completeSession();
      const session = {
        id: generateUUID(),
        type: 'pomodoro' as const,
        duration: phase === 'work' ? settings.workDuration * 60 : settings.breakDuration * 60,
        date: Date.now(),
      };
      addSession(session);
      saveStudySession(session);

      // Switch phase
      if (phase === 'work') {
        const isLongBreak = (sessionsCompleted + 1) % settings.sessionsBeforeLongBreak === 0;
        setPhase(isLongBreak ? 'longBreak' : 'break');
        setTimeRemaining((isLongBreak ? settings.longBreakDuration : settings.breakDuration) * 60);
      } else {
        setPhase('work');
        setTimeRemaining(settings.workDuration * 60);
      }
      start();
    }
  }, [timeRemaining, isRunning]);

  const startWork = useCallback(() => {
    setPhase('work');
    setTimeRemaining(settings.workDuration * 60);
    start();
  }, [settings, setPhase, setTimeRemaining, start]);

  return { isRunning, phase, timeRemaining, sessionsCompleted, start, pause, reset, startWork };
}
