import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { StudySession } from '../../types/progress';

interface ActivityHeatmapProps {
  sessions: StudySession[];
}

const CELL_SIZE = 11;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const ROWS = 7; // Sun–Sat

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const INTENSITY_COLORS = [
  'bg-slate-800/60',     // 0 — no activity
  'bg-teal-900/80',      // 1 — low
  'bg-teal-700',         // 2 — medium-low
  'bg-teal-500',         // 3 — medium-high
  'bg-cyan-400',         // 4 — high
];

interface TooltipData {
  date: string;
  count: number;
  minutes: number;
  x: number;
  y: number;
}

export default function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // ---------- derive year grid ----------
  const { weeks, monthMarkers, dayData } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfRange = new Date(year, 11, 31); // always go to Dec 31 (future dates just empty)

    // Shift startOfYear back to the preceding Sunday
    const startDow = startOfYear.getDay(); // 0=Sun
    const gridStart = new Date(startOfYear);
    gridStart.setDate(gridStart.getDate() - startDow);

    // Aggregate session data by date string "YYYY-MM-DD"
    const agg: Record<string, { count: number; minutes: number }> = {};
    for (const s of sessions) {
      const d = new Date(s.date);
      // Only count sessions from the current year
      if (d.getFullYear() !== year) continue;
      const key = d.toISOString().split('T')[0];
      if (!agg[key]) agg[key] = { count: 0, minutes: 0 };
      agg[key].count += 1;
      agg[key].minutes += Math.round(s.duration / 60);
    }

    // Collect all non-zero minute values for quantile thresholds
    const nonZeroMinutes = Object.values(agg)
      .map((v) => v.minutes)
      .filter((m) => m > 0)
      .sort((a, b) => a - b);

    // Build thresholds using quantiles (p25, p50, p75) with fixed fallbacks
    const thresholds = [0, 0, 0, 0]; // boundaries for levels 1-4
    if (nonZeroMinutes.length > 0) {
      const q = (p: number) => {
        const idx = Math.floor(nonZeroMinutes.length * p);
        return nonZeroMinutes[Math.min(idx, nonZeroMinutes.length - 1)];
      };
      thresholds[0] = q(0.25);
      thresholds[1] = q(0.50);
      thresholds[2] = q(0.75);
    } else {
      thresholds[0] = 15;
      thresholds[1] = 30;
      thresholds[2] = 60;
    }

    function getLevel(minutes: number): number {
      if (minutes === 0) return 0;
      if (minutes <= thresholds[0]) return 1;
      if (minutes <= thresholds[1]) return 2;
      if (minutes <= thresholds[2]) return 3;
      return 4;
    }

    // Build week columns
    const weekCols: { date: string; level: number; minutes: number; count: number }[][] = [];
    const markers: { label: string; col: number }[] = [];

    let cursor = new Date(gridStart);
    let colIndex = 0;
    let lastMonth = -1;

    while (cursor <= endOfRange || colIndex === 0) {
      const week: typeof weekCols[number] = [];
      for (let dow = 0; dow < 7; dow++) {
        const dateStr = cursor.toISOString().split('T')[0];
        const info = agg[dateStr];
        week.push({
          date: dateStr,
          level: getLevel(info ? info.minutes : 0),
          minutes: info ? info.minutes : 0,
          count: info ? info.count : 0,
        });

        // Month marker detection — if this is the 1st of a month and a Sunday (dow 0)
        // we mark the column; otherwise mark the first column where a new month appears
        if (dow === 0 && cursor.getMonth() !== lastMonth) {
          markers.push({ label: MONTH_LABELS[cursor.getMonth()], col: colIndex });
          lastMonth = cursor.getMonth();
        }

        cursor.setDate(cursor.getDate() + 1);
      }
      weekCols.push(week);
      colIndex++;

      // Safety: stop after filling the year
      if (cursor.getFullYear() > year && colIndex > 53) break;
    }

    return {
      weeks: weekCols,
      monthMarkers: markers,
      dayData: agg,
    };
  }, [sessions]);

  // ---------- auto-scroll to right on mount ----------
  useEffect(() => {
    if (anchorRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [weeks]);

  // ---------- tooltip helpers ----------
  const handleMouseEnter = useCallback(
    (date: string, count: number, minutes: number, e: React.MouseEvent<HTMLDivElement>) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const containerRect = scrollRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      setTooltip({
        date,
        count,
        minutes,
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top,
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  const totalWeeks = weeks.length;
  const gridWidth = totalWeeks * CELL_STEP;

  const year = new Date().getFullYear();

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-slate-200">Study Activity</h4>
        <span className="text-xs text-slate-500">{year}</span>
      </div>

      {/* Scrollable grid container */}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
        style={{ paddingBottom: 4 }}
      >
        {/* Month labels row */}
        <div className="relative" style={{ width: gridWidth, height: 16 }}>
          {monthMarkers.map((m) => (
            <span
              key={`${m.label}-${m.col}`}
              className="absolute text-[10px] text-slate-500 leading-none"
              style={{ left: m.col * CELL_STEP }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="relative" style={{ width: gridWidth, height: ROWS * CELL_STEP }}>
          {weeks.map((week, wi) =>
            week.map((day, dow) => {
              // Only render cells that are within the current year or today's range
              return (
                <div
                  key={`${wi}-${dow}`}
                  className={`absolute rounded-[2px] transition-colors ${INTENSITY_COLORS[day.level]}`}
                  style={{
                    left: wi * CELL_STEP,
                    top: dow * CELL_STEP,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                  }}
                  onMouseEnter={(e) => handleMouseEnter(day.date, day.count, day.minutes, e)}
                  onMouseLeave={handleMouseLeave}
                />
              );
            }),
          )}
          {/* Invisible anchor at the end for scroll-to */}
          <div ref={anchorRef} className="absolute" style={{ left: gridWidth - 1, top: 0 }} />
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap
              bg-slate-900 border border-slate-600 shadow-lg"
            style={{
              left: tooltip.x,
              top: tooltip.y - 32,
              transform: 'translateX(-50%)',
            }}
          >
            <span className="text-slate-200 font-medium">{tooltip.date}</span>
            <span className="text-slate-400 ml-2">
              {tooltip.count} session{tooltip.count !== 1 ? 's' : ''} · {tooltip.minutes} min
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
        <span>Less</span>
        {INTENSITY_COLORS.map((c, i) => (
          <div key={i} className={`w-3 h-3 rounded-[2px] ${c}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
