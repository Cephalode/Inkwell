import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiTrash,
  HiDocumentText,
  HiAcademicCap,
  HiDotsVertical,
  HiPencil,
  HiCollection,
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

  return (
    <Card onClick={() => onSelect(doc)} className="hover:scale-[1.02] transition-transform">
      <div className="flex items-start gap-2 sm:gap-4">
        <div className="text-2xl sm:text-3xl">{getFileIcon(doc.type)}</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-200 truncate">{doc.name}</h4>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {category ? (
              <>
                {doc.tags.map((tag) => (
                  <Badge key={tag} color={badgeColor}>{tag}</Badge>
                ))}
              </>
            ) : isClassifying ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-yellow-500/20 text-yellow-300 border-yellow-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" />
                Classifying…
              </span>
            ) : (
              <Badge color="gray">{doc.type.toUpperCase()}</Badge>
            )}
            <span className="text-xs text-slate-500">{formatFileSize(doc.size)}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {docCourses.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-cyan-400/80">
                <HiAcademicCap className="w-3 h-3" />
                {docCourses.join(', ')}
              </span>
            )}
            {subdocCount > 0 && (
              <span className="text-xs text-slate-500">
                {subdocCount} subdoc{subdocCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
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
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-700/50"
          >
            <HiDotsVertical className="w-5 h-5" />
          </button>

          {isOpen && dropdownPos && createPortal(
            <div
              ref={dropdownRef}
              className={`fixed bg-slate-800 border border-slate-700 rounded-xl shadow-lg p-1.5 z-[9999] ${
                editingTags ? 'w-64' : 'w-48'
              }`}
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {editingTags ? (
                /* Tag editor mode */
                <>
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300">
                    <HiArrowLeft
                      className="w-4 h-4 cursor-pointer hover:text-white"
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
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300 border border-slate-600"
                      >
                        {tag}
                        <HiX
                          className="w-3 h-3 cursor-pointer hover:text-red-400 transition-colors"
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
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-600 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                      autoFocus
                    />
                  </div>
                  <div className="px-3 pb-2">
                    <button
                      onClick={handleDoneTags}
                      className="w-full px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
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
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 cursor-pointer transition-colors w-full ${
                        availableCourses.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
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
                        className="absolute left-full top-0 ml-1 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-lg p-1 z-50"
                        onMouseEnter={handleCourseItemMouseEnter}
                      >
                        {availableCourses.map((course) => (
                          <button
                            key={course.id}
                            onClick={() => {
                              onMoveToCourse?.(doc.id, course.id);
                              closeDropdown();
                            }}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 cursor-pointer transition-colors w-full text-left"
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
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700 cursor-pointer transition-colors w-full text-left"
                  >
                    <HiPencil className="w-4 h-4 flex-shrink-0" />
                    <span>Edit Tags</span>
                  </button>

                  {/* Divider */}
                  <div className="my-1 border-t border-slate-700" />

                  {/* Delete */}
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors w-full text-left"
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
