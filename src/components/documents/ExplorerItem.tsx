// ExplorerItem — one file or folder, rendered as a grid tile OR a list row.
// Handles: click (open/preview), drag source (for moving), drop target (files
// dropped on a folder move into it), inline rename, and the ⋯ context menu
// (preview / open / download / rename / move-to / delete).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiFolder,
  HiEllipsisVertical,
  HiPencil,
  HiTrash,
  HiArrowRight,
  HiArrowDownTray,
  HiEye,
  HiArrowTopRightOnSquare,
} from 'react-icons/hi2';
import type { DocumentFile } from '../../types/document';
import { formatFileSize, getFileIcon } from '../../utils/fileHelpers';

export interface MoveTarget {
  id: string | null;
  name: string;
  disabled?: boolean;
}

interface ExplorerItemProps {
  name: string;
  kind: 'folder' | 'file';
  /** Folder color or null. */
  color?: string | null;
  /** Folder: direct doc count. */
  docCount?: number;
  /** Folder: has subfolders (affects drop behavior hints). */
  hasChildren?: boolean;
  /** File only. */
  doc?: DocumentFile;
  isClassifying?: boolean;
  view: 'grid' | 'list';
  isSelected: boolean;
  /** Flat move-target list, already filtered to legal destinations. */
  moveTargets: MoveTarget[];
  onOpen: () => void;
  onPreview?: () => void;
  onRename: (newName: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveTo: (folderId: string | null) => Promise<void>;
  onDownload?: () => void;
  onDragStartItem?: () => void;
  onDragEndItem?: () => void;
  onDropOnFolder?: () => Promise<void>;
  onDropFiles?: (files: File[]) => Promise<void>;
}

type MenuKind = 'none' | 'main' | 'move' ;

export default function ExplorerItem({
  name,
  kind,
  color,
  docCount = 0,
  hasChildren = false,
  doc,
  isClassifying,
  view,
  isSelected,
  moveTargets,
  onOpen,
  onPreview,
  onRename,
  onDelete,
  onMoveTo,
  onDownload,
  onDragStartItem,
  onDragEndItem,
  onDropOnFolder,
  onDropFiles,
}: ExplorerItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<MenuKind>('none');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [dropActive, setDropActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragDepth = useRef(0);

  // Close the portal menu on any outside mousedown. Mousedowns inside the
  // portaled menu itself must NOT close it — the menu unmounts before the
  // click fires otherwise (classic portal-dropdown race).
  useEffect(() => {
    if (menu === 'none') return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current?.contains(target)) return;
      if (target.closest?.('[data-item-menu]')) return;
      setMenu('none');
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    triggerRef.current = e.currentTarget as HTMLButtonElement;
    setMenuPos({ top: Math.min(rect.bottom + 4, window.innerHeight - 260), left: Math.min(rect.left, window.innerWidth - 230) });
    setMenu('main');
  }

  function startRename() {
    setRenameValue(name);
    setMenu('none');
    setRenaming(true);
  }

  async function commitRename() {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== name) {
      try {
        await onRename(trimmed);
      } catch (err) {
        console.error('Rename failed:', err);
      }
    }
  }

  async function runMenuAction(fn: () => Promise<void>) {
    setMenu('none');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('Item action failed:', err);
    } finally {
      setBusy(false);
    }
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const draggable = Boolean(onDragStartItem);
  const droppable = Boolean(onDropOnFolder) || Boolean(onDropFiles);

  function handleDragOver(e: React.DragEvent) {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') && onDropFiles ? 'copy' : 'move';
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDropActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!droppable) return;
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDropActive(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDropActive(false);
    if (e.dataTransfer.files.length > 0 && onDropFiles) {
      await onDropFiles(Array.from(e.dataTransfer.files));
      return;
    }
    await onDropOnFolder?.();
  }

  // ── Shared row/tile chrome ─────────────────────────────────────────────────
  const iconSize = view === 'grid' ? 'w-10 h-10' : 'w-5 h-5';
  const folderIcon = (
    <HiFolder
      className={`${iconSize} shrink-0`}
      style={{ color: color ?? (view === 'grid' ? 'var(--color-accent)' : 'var(--color-neutral-500)') }}
    />
  );
  const meta = kind === 'folder'
    ? `${docCount} item${docCount !== 1 ? 's' : ''}`
    : doc
      ? `${formatFileSize(doc.size)} · ${new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : '';

  const showClassifying = kind === 'file' && (isClassifying || doc?.classifyStatus === 'pending' || doc?.classifyStatus === 'classifying');

  const nameNode = renaming ? (
    <input
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void commitRename();
        if (e.key === 'Escape') setRenaming(false);
      }}
      onBlur={commitRename}
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      className="w-full text-sm px-1.5 py-1"
      style={{ border: '1px solid var(--color-accent)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)' }}
      autoFocus
    />
  ) : (
    <span className={`${view === 'grid' ? 'text-xs' : 'text-sm'} truncate w-full text-left`} title={name}>
      {name}
    </span>
  );

  const tileBg = isSelected
    ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
    : dropActive
      ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)'
      : undefined;

  const commonHandlers = {
    onClick: onOpen,
    onDoubleClick: onPreview && kind === 'file' ? onPreview : undefined,
    draggable,
    onDragStart: (e: React.DragEvent) => {
      if (!draggable) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', kind === 'folder' ? `folder:${name}` : `doc:${doc?.id ?? ''}`);
      onDragStartItem?.();
    },
    onDragEnd: () => onDragEndItem?.(),
    onDragOver: handleDragOver,
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    title: `${name} — ${meta}`,
  };

  if (view === 'grid') {
    return (
      <div
        {...commonHandlers}
        data-explorer-item
        className="card group relative flex flex-col items-center gap-2 p-4 text-center cursor-pointer transition-colors select-none"
        style={{
          background: tileBg,
          outline: dropActive ? '2px dashed var(--color-accent)' : isSelected ? '1.5px solid var(--color-accent)' : undefined,
          outlineOffset: -2,
          opacity: busy ? 0.5 : 1,
        }}
      >
        <div className="relative">
          {kind === 'folder' ? folderIcon : <span className="text-3xl">{getFileIcon(doc?.type ?? '')}</span>}
          {showClassifying && (
            <span
              className="absolute -bottom-1 -right-2 text-[9px] px-1 py-0.5 animate-pulse"
              style={{
                background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                color: 'var(--color-warning)',
                borderRadius: 4,
              }}
            >
              AI
            </span>
          )}
        </div>
        <div className="w-full min-w-0">{nameNode}</div>
        {!renaming && <span className="text-[10px]" style={{ opacity: 0.45 }}>{meta}</span>}
        <button
          ref={triggerRef}
          onClick={openMenu}
          className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
          style={{ borderRadius: 'var(--radius-md)' }}
          aria-label={`Options for ${name}`}
        >
          <HiEllipsisVertical className="w-4 h-4" />
        </button>
        {renderMenu()}
      </div>
    );
  }

  // List row
  return (
    <div
      {...commonHandlers}
      data-explorer-item
      role="row"
      className="group flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid var(--color-divider)',
        background: isSelected
          ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
          : dropActive
            ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)'
            : 'transparent',
        outline: dropActive ? '2px dashed var(--color-accent)' : undefined,
        outlineOffset: -2,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <div className="w-6 flex justify-center shrink-0">
        {kind === 'folder' ? folderIcon : <span className="text-lg leading-none">{getFileIcon(doc?.type ?? '')}</span>}
      </div>
      <div className="flex-1 min-w-0">{nameNode}</div>
      {!renaming && (
        <>
          <span className="hidden sm:block text-xs w-24 shrink-0" style={{ opacity: 0.5 }}>
            {kind === 'file' ? (doc?.tags?.[0] ?? doc?.type.toUpperCase() ?? '') : 'Folder'}
          </span>
          <span className="hidden md:block text-xs w-20 text-right shrink-0" style={{ opacity: 0.5 }}>
            {kind === 'file' ? formatFileSize(doc?.size ?? 0) : '—'}
          </span>
          <span className="hidden md:block text-xs w-24 shrink-0" style={{ opacity: 0.5 }}>
            {doc ? new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : ''}
          </span>
        </>
      )}
      <button
        ref={triggerRef}
        onClick={openMenu}
        className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
        style={{ borderRadius: 'var(--radius-md)' }}
        aria-label={`Options for ${name}`}
      >
        <HiEllipsisVertical className="w-4 h-4" />
      </button>
      {renderMenu()}
    </div>
  );

  function renderMenu() {
    if (menu === 'none') return null;
    return createPortal(
      <div
        data-item-menu
        className="card fixed p-1.5 w-56 z-[9999]"
        style={{ top: menuPos.top, left: menuPos.left, boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {menu === 'main' ? (
          <>
            {kind === 'file' && onPreview && (
              <MenuItem icon={<HiEye className="w-4 h-4 shrink-0" />} label="Preview" onClick={() => { setMenu('none'); onPreview(); }} />
            )}
            {kind === 'file' && (
              <MenuItem
                icon={<HiArrowTopRightOnSquare className="w-4 h-4 shrink-0" />}
                label="Open"
                onClick={() => { setMenu('none'); onOpen(); }}
              />
            )}
            {onDownload && kind === 'file' && (
              <MenuItem icon={<HiArrowDownTray className="w-4 h-4 shrink-0" />} label="Download" onClick={() => { setMenu('none'); onDownload(); }} />
            )}
            <MenuItem icon={<HiPencil className="w-4 h-4 shrink-0" />} label="Rename" onClick={startRename} />
            <div>
              <MenuItem
                icon={<HiArrowRight className="w-4 h-4 shrink-0" />}
                label="Move to…"
                trailing="▸"
                onClick={() => setMenu('move')}
              />
            </div>
            <div className="my-1" style={{ borderTop: '1px solid var(--color-divider)' }} />
            <MenuItem
              icon={<HiTrash className="w-4 h-4 shrink-0" />}
              label={kind === 'folder' ? (hasChildren || docCount > 0 ? 'Delete (keeps contents)' : 'Delete') : 'Delete'}
              danger
              onClick={() => void runMenuAction(async () => {
                await onDelete();
              })}
            />
          </>
        ) : (
          <>
            <button
              className="flex items-center gap-2 px-2 py-1.5 text-xs w-full text-left"
              style={{ opacity: 0.6, borderRadius: 'var(--radius-md)' }}
              onClick={() => setMenu('main')}
            >
              ◂ Back
            </button>
            <div className="my-1" style={{ borderTop: '1px solid var(--color-divider)' }} />
            <div className="max-h-64 overflow-y-auto">
              {moveTargets.map((t) => (
                <MenuItem
                  key={t.id ?? 'root'}
                  icon={<HiFolder className="w-4 h-4 shrink-0" style={{ opacity: 0.6 }} />}
                  label={t.name}
                  disabled={t.disabled}
                  onClick={() => {
                    if (t.disabled) return;
                    void runMenuAction(async () => {
                      await onMoveTo(t.id);
                    });
                  }}
                />
              ))}
              {moveTargets.length === 0 && (
                <p className="px-2 py-2 text-xs" style={{ opacity: 0.45 }}>No destinations</p>
              )}
            </div>
          </>
        )}
      </div>,
      document.body,
    );
  }
}

function MenuItem({
  icon,
  label,
  trailing,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-center gap-3 px-3 py-2 text-sm w-full text-left transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]'}`}
      style={{
        borderRadius: 'var(--radius-md)',
        color: danger ? 'var(--color-danger)' : undefined,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {trailing && <span style={{ opacity: 0.5 }}>{trailing}</span>}
    </button>
  );
}
