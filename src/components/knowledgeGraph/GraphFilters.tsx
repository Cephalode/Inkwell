import { useState } from 'react';
import { HiOutlineFunnel, HiOutlineMagnifyingGlass, HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { useKnowledgeGraphStore } from '../../store/knowledgeGraphStore';
import type { KGNodeType } from '../../types/knowledgeGraph';

const nodeTypeConfig: { key: KGNodeType; label: string; color: string; filterKey: keyof import('../../types/knowledgeGraph').KGFilters }[] = [
  { key: 'document', label: 'Documents', color: '#14b8a6', filterKey: 'showDocuments' },
  { key: 'chapter', label: 'Chapters', color: '#06b6d4', filterKey: 'showChapters' },
  { key: 'doctype', label: 'Types', color: '#3b82f6', filterKey: 'showDoctypes' },
  { key: 'tag', label: 'Tags', color: '#a855f7', filterKey: 'showTags' },
  { key: 'course', label: 'Courses', color: '#f59e0b', filterKey: 'showCourses' },
  { key: 'subject', label: 'Subjects', color: '#22c55e', filterKey: 'showSubjects' },
  { key: 'chat', label: 'Chats', color: '#6b7280', filterKey: 'showChats' },
  { key: 'topic', label: 'Roadmap topics', color: '#e8b93b', filterKey: 'showTopics' },
];

export function GraphFilters() {
  const { filters, setFilters } = useKnowledgeGraphStore();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="absolute top-4 left-4 z-10 w-64">
      <div
        className="card overflow-hidden"
        style={{
          background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
        >
          <div className="flex items-center gap-2">
            <HiOutlineFunnel className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm font-medium">Filters</span>
          </div>
          {expanded ? (
            <HiChevronUp className="w-4 h-4" style={{ opacity: 0.6 }} />
          ) : (
            <HiChevronDown className="w-4 h-4" style={{ opacity: 0.6 }} />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ opacity: 0.6 }} />
              <input
                type="text"
                placeholder="Search nodes…"
                value={filters.searchQuery}
                onChange={(e) => setFilters({ searchQuery: e.target.value })}
                className="input text-sm"
                style={{ paddingLeft: 32 }}
              />
            </div>

            {/* Divider */}
            <div className="border-t" style={{ borderColor: 'var(--color-divider)' }} />

            {/* Filter Toggles */}
            <div className="space-y-2">
              {nodeTypeConfig.map(({ key, label, color, filterKey }) => (
                <label
                  key={key}
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm transition-opacity opacity-75 group-hover:opacity-100">
                      {label}
                    </span>
                  </div>
                  {/* Toggle Switch */}
                  <button
                    role="switch"
                    aria-checked={filters[filterKey] as boolean}
                    onClick={() => setFilters({ [filterKey]: !filters[filterKey] })}
                    className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out"
                    style={{
                      background: (filters[filterKey] as boolean)
                        ? 'var(--color-accent)'
                        : 'var(--color-neutral-400)',
                    }}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full transition duration-200 ease-in-out ${
                        (filters[filterKey] as boolean) ? 'translate-x-4' : 'translate-x-0'
                      }`}
                      style={{ background: 'var(--color-neutral-900)', boxShadow: 'var(--shadow-sm)' }}
                    />
                  </button>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
