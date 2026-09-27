import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiTrash,
  HiDocumentText,
  HiAcademicCap,
  HiDotsVertical,
  HiPencil,
  HiCollection,
  HiFolder,
  HiArrowLeft,
  HiX,
} from 'react-icons/hi';
import Card from '../shared/Card';
import Badge from '../shared/Badge';
import { DocumentFile } from '../../types/document';
import { formatFileSize, getFileIcon } from '../../utils/fileHelpers';

const CATEGORY_COLORS: Record<string, BadgeProps['color']> = {
  Textbook: 'cyan',
  Worksheet: 'yellow',
  Exam: 'red',
  Quiz: 'red',
  Notes: 'green',
  Slides: 'purple',
  Reference: 'gray',
  Article: 'teal',
  Paper: 'teal',
  'Lab Manual': 'teal',
  Syllabus: 'purple',
  'Study Guide': 'cyan',
  Handout: 'gray',
  Diagram: 'teal',
  Code: 'green',
};

interface FileCardProps {
  doc: DocumentFile;
  isClassifying?: boolean;
  onDelete?: (id: string) => void;
  onSelect: (doc: DocumentFile) => void;
  courses: Array<{ id: string; name: string; documentIds: string[] }>;
  onMoveToCourse?: (docId: string, courseId: string) => void;
  onUpdateTags: (docId: string, tags: string[]) => void;
  folders?: Array<{ id: string; name: string }>;
  onMoveToFolder?: (docId: string, folderId: string | null) => void;
  onRename?: (docId: string, name: string) => Promise<void>;
  docCourses?: string[];
  subdocCount?: number;
}

type BadgeProps = React.ComponentProps<typeof Badge>;

export default function FileCard({
  doc,
  isClassifying,
  onDelete,
  onSelect,
  courses,
  onMoveToCourse,
  onUpdateTags,
  folders = [],
  onMoveToFolder,
  onRename,
  docCourses = [],
  subdocCount = 0,
}: FileCardProps) {
  const [category] = doc.tags;
  const badgeColor = category && CATEGORY_COLORS[category] ? CATEGORY_COLORS[category] : 'gray';

  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [courseSubmenuOpen, setCourseSubmenuOpen] = useState(false);
  const availableCourses = courses.filter(c => !c.documentIds.includes(doc.id));
  const courseSubmenuTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setEditingTags(false);
        setCourseSubmenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.right - (editingTags ? 256 : 192) });
    }
  }, [isOpen, editingTags]);

  function closeDropdown() {
    setIsOpen(false);
    setEditingTags(false);
    setCourseSubmenuOpen(false);
  }

  function openTagEditor() {
    setEditTags([...doc.tags]);
    setTagInput('');
    setEditingTags(true);
    setCourseSubmenuOpen(false);
  }

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setEditTags(editTags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }

  function handleDoneTags() {
    onUpdateTags(doc.id, editTags);
    closeDropdown();
  }

  function handleCourseSubmenuEnter() {
    if (courseSubmenuTimeout.current) clearTimeout(courseSubmenuTimeout.current);
    setCourseSubmenuOpen(true);
  }

  function handleCourseSubmenuLeave() {
    courseSubmenuTimeout.current = setTimeout(() => {
      setCourseSubmenuOpen(false);
    }, 150);
  }

  const handleCourseItemMouseEnter = () => {
    if (courseSubmenuTimeout.current) clearTimeout(courseSubmenuTimeout.current);
  };

  function handleDelete() {
    onDelete?.(doc.id);
    closeDropdown();
  }

  // Inline preview players (audio/video docs): pause every other media element
  // when one starts, so cards don't play over each other.
  function handleMediaPlay(e: React.SyntheticEvent<HTMLMediaElement>) {
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => {
      if (el !== e.currentTarget) el.pause();
    });
  }

  const hasInlinePlayer = doc.type === 'audio' || doc.type === 'video';
  const mediaSrc = `/api/documents/${doc.id}/download`;

  // Inline rename (Drive-style) — PATCHes name, falls back silently on error.
  const [renamingDoc, setRenamingDoc] = useState(false);
  const [renameDocValue, setRenameDocValue] = useState('');
  function startRenameDoc() {
    setRenameDocValue(doc.name);
    setRenamingDoc(true);
    closeDropdown();
  }
  async function commitRenameDoc() {
    setRenamingDoc(false);
    const name = renameDocValue.trim();
    if (name && name !== doc.name && onRename) {
      try { await onRename(doc.id, name); } catch (err) { console.error('Rename failed:', err); }
    }
  }

  return (
    <Card onClick={() => onSelect(doc)}>
      <div className="flex items-start gap-2 sm:gap-4">
        <div className="text-2xl sm:text-3xl">{getFileIcon(doc.type)}</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm truncate">{doc.name}</h4>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {category ? (
              <>
                {doc.tags.map((tag) => (
                  <Badge key={tag} color={badgeColor}>{tag}</Badge>
                ))}
              </>
            ) : isClassifying ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium border animate-pulse"
                style={{
                  background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                  color: 'var(--color-warning)',
                  borderColor: 'color-mix(in srgb, var(--color-warning) 35%, transparent)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: 'var(--color-warning)' }}
                />
                Classifying…
              </span>
            ) : (
              <Badge color="gray">{doc.type.toUpperCase()}</Badge>
            )}
            <span className="text-xs" style={{ opacity: 0.5 }}>{formatFileSize(doc.size)}</span>
          </div>
          <p className="text-xs mt-2" style={{ opacity: 0.5 }}>
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {docCourses.length > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--color-accent-700)' }}
              >
                <HiAcademicCap className="w-3 h-3" />
                {docCourses.join(', ')}
              </span>
            )}
            {subdocCount > 0 && (
              <span className="text-xs" style={{ opacity: 0.5 }}>
                {subdocCount} subdoc{subdocCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {hasInlinePlayer && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              {doc.type === 'audio' ? (
                <audio controls preload="none" src={mediaSrc} onPlay={handleMediaPlay} className="w-full h-8" />
              ) : (
                <video
                  controls
                  preload="none"
                  src={mediaSrc}
                  onPlay={handleMediaPlay}
                  title={doc.name}
                  className="w-full bg-black"
                  style={{ aspectRatio: '16 / 9', borderRadius: 'var(--radius-md)' }}
                />
              )}
            </div>
          )}
          {renamingDoc ? (
            <input
              value={renameDocValue}
              onChange={(e) => setRenameDocValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRenameDoc();
                if (e.key === 'Escape') setRenamingDoc(false);
              }}
              onBlur={commitRenameDoc}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm px-1.5 py-1 mt-1"
              style={{ border: '1px solid var(--color-accent)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)' }}
              autoFocus
            />
          ) : null}
        </div>
        {/* Ellipsis menu */}
        <div className="flex-shrink-0">
          <button
            ref={triggerRef}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
              if (isOpen) {
                setEditingTags(false);
                setCourseSubmenuOpen(false);
              }
            }}
            className="transition-colors p-1 opacity-50 hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
            style={{ borderRadius: 'var(--radius-md)' }}
          >
            <HiDotsVertical className="w-5 h-5" />
          </button>

          {isOpen && dropdownPos && createPortal(
            <div
              ref={dropdownRef}
              className={`card fixed p-1.5 z-[9999] ${
                editingTags ? 'w-64' : 'w-48'
              }`}
              style={{ top: dropdownPos.top, left: dropdownPos.left, boxShadow: 'var(--shadow-md)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {editingTags ? (
                /* Tag editor mode */
                <>
                  <div className="flex items-center gap-2 px-3 py-2 text-sm">
                    <HiArrowLeft
                      className="w-4 h-4 cursor-pointer opacity-60 hover:opacity-100"
                      onClick={() => {
                        setEditingTags(false);
                      }}
                    />
                    <span className="font-medium">Edit Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-3 py-2">
                    {editTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs border"
                        style={{
                          background: 'var(--color-neutral-200)',
                          borderColor: 'var(--color-neutral-300)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        {tag}
                        <HiX
                          className="w-3 h-3 cursor-pointer transition-colors hover:text-[var(--color-danger)]"
                          onClick={() => removeTag(tag)}
                        />
                      </span>
                    ))}
                  </div>
                  <div className="px-3 pb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder="New tag…"
                      className="input text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="px-3 pb-2">
                    <button
                      onClick={handleDoneTags}
                      className="btn btn-primary w-full"
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                /* Normal menu mode */
                <>
                  {/* Move to Course */}
                  <div
                    className="relative"
                    onMouseEnter={handleCourseSubmenuEnter}
                    onMouseLeave={handleCourseSubmenuLeave}
                  >
                    <div
                      className={`flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] cursor-pointer transition-colors w-full ${
                        availableCourses.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{ borderRadius: 'var(--radius-md)' }}
                      onClick={
                        availableCourses.length > 0
                          ? () => setCourseSubmenuOpen(!courseSubmenuOpen)
                          : undefined
                      }
                    >
                      <HiCollection className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">Move to Course</span>
                      {availableCourses.length > 0 && (
                        <svg
                          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${
                            courseSubmenuOpen ? 'rotate-90' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>

                    {/* Course submenu */}
                    {courseSubmenuOpen && availableCourses.length > 0 && (
                      <div
                        className="card absolute left-full top-0 ml-1 w-48 p-1 z-50"
                        style={{ boxShadow: 'var(--shadow-md)' }}
                        onMouseEnter={handleCourseItemMouseEnter}
                      >
                        {availableCourses.map((course) => (
                          <button
                            key={course.id}
                            onClick={() => {
                              onMoveToCourse?.(doc.id, course.id);
                              closeDropdown();
                            }}
                            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] cursor-pointer transition-colors w-full text-left"
                            style={{ borderRadius: 'var(--radius-md)' }}
                          >
                            <HiDocumentText className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{course.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Edit Tags */}
                  <button
                    onClick={openTagEditor}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] cursor-pointer transition-colors w-full text-left"
                    style={{ borderRadius: 'var(--radius-md)' }}
                  >
                    <HiPencil className="w-4 h-4 flex-shrink-0" />
                    <span>Edit Tags</span>
                  </button>

                  {/* Rename */}
                  {onRename && (
                    <button
                      onClick={startRenameDoc}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] cursor-pointer transition-colors w-full text-left"
                      style={{ borderRadius: 'var(--radius-md)' }}
                    >
                      <HiPencil className="w-4 h-4 flex-shrink-0" />
                      <span>Rename</span>
                    </button>
                  )}

                  {/* Move to Folder */}
                  {folders.length > 0 && (
                    <>
                      {folders
                        .filter((f) => f.id !== doc.folderId)
                        .map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              onMoveToFolder?.(doc.id, f.id);
                              closeDropdown();
                            }}
                            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] cursor-pointer transition-colors w-full text-left"
                            style={{ borderRadius: 'var(--radius-md)' }}
                          >
                            <HiFolder className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">Move to {f.name}</span>
                          </button>
                        ))}
                      {doc.folderId && (
                        <button
                          onClick={() => {
                            onMoveToFolder?.(doc.id, null);
                            closeDropdown();
                          }}
                          className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] cursor-pointer transition-colors w-full text-left"
                          style={{ borderRadius: 'var(--radius-md)', opacity: 0.7 }}
                        >
                          <HiFolder className="w-4 h-4 flex-shrink-0" />
                          <span>Remove from folder</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* Divider */}
                  <div className="my-1" style={{ borderTop: '1px solid var(--color-divider)' }} />

                  {/* Delete */}
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] cursor-pointer transition-colors w-full text-left"
                    style={{ color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}
                  >
                    <HiTrash className="w-4 h-4 flex-shrink-0" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
            , document.body)}
        </div>
      </div>
    </Card>
  );
}
