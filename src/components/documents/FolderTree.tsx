// FolderTree — Drive-style hierarchical folder sidebar.
// Recursion is iterative-safe here (trees are user-built and shallow); each
// row: expand chevron (only with children), folder icon, name (inline-editable),
// doc count, and a per-folder ⋯ menu (rename / new subfolder / move / delete).
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiChevronRight,
  HiChevronDown,
  HiFolder,
  HiDotsVertical,
  HiPencil,
  HiFolderAdd,
  HiArrowRight,
  HiTrash,
  HiCollection,
} from 'react-icons/hi';
import type { FolderTreeNode } from '../../services/api/client';

interface FolderTreeProps {
  tree: FolderTreeNode[];
  currentId: string | null;
  expanded: Set<string>;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onCreate: (parentId: string | null, name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<void>;
  onMove: (id: string, newParentId: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** A dragged item (folder or doc, tracked by the parent page) was dropped on folder `targetId`. */
  onDropOnFolder?: (targetId: string | null) => Promise<void>;
  /** OS files were dropped on folder `targetId` (null = root). */
  onDropFiles?: (targetId: string | null, files: File[]) => Promise<void>;
}

type MenuState =
  | { kind: 'none' }
  | { kind: 'menu'; folderId: string; top: number; left: number }
  | { kind: 'move'; folderId: string; top: number; left: number };

export default function FolderTree({
  tree,
  currentId,
  expanded,
  onSelect,
  onToggle,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onDropOnFolder,
  onDropFiles,
}: FolderTreeProps) {
  const byId = new Map(tree.map((f) => [f.id, f]));
  const childrenOf = (parentId: string | null) =>
    tree.filter((f) => (f.parentId ?? null) === parentId);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingIn, setCreatingIn] = useState<string | 'root' | null>(null);
  const [createValue, setCreateValue] = useState('');
  const [menu, setMenu] = useState<MenuState>({ kind: 'none' });
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [dropTargetId, setDropTargetId] = useState<string | 'root' | null>(null);
  const dropDepth = useRef(0);

  // Close any open dropdown on outside click. Mousedowns inside the portaled
  // menu itself must NOT close it (menu would unmount before the click fires).
  useEffect(() => {
    if (menu.kind === 'none') return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuTriggerRef.current?.contains(target)) return;
      if (target.closest?.('[data-item-menu]')) return;
      setMenu({ kind: 'none' });
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  function openMenu(e: React.MouseEvent, folderId: string) {
    e.stopPropagation();
    menuTriggerRef.current = e.currentTarget as HTMLButtonElement;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ kind: 'menu', folderId, top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 200) });
  }

  function startRename(f: FolderTreeNode) {
    setRenamingId(f.id);
    setRenameValue(f.name);
    setMenu({ kind: 'none' });
  }

  async function commitRename() {
    const id = renamingId;
    const name = renameValue.trim();
    setRenamingId(null);
    if (id && name) await onRename(id, name);
  }

  function startCreate(parentId: string | null) {
    setCreatingIn(parentId ?? 'root');
    setCreateValue('');
    setMenu({ kind: 'none' });
    if (parentId) onToggle(parentId); // make sure the new folder will be visible
  }

  async function commitCreate() {
    const parent = creatingIn;
    const name = createValue.trim();
    setCreatingIn(null);
    if (name) await onCreate(parent === 'root' ? null : parent, name);
  }

  function openMoveMenu(f: FolderTreeNode) {
    const rect = menuTriggerRef.current?.getBoundingClientRect();
    setMenu({ kind: 'move', folderId: f.id, top: (rect?.bottom ?? 100) + 4, left: Math.min(rect?.left ?? 100, window.innerWidth - 220) });
  }

  const moveTargets = (f: FolderTreeNode) =>
    [{ id: null as string | null, name: 'All documents' }, ...tree]
      .filter((t) => t.id !== f.id && !(t.id && f.isDescendantOf[t.id]));

  // ── Drop targets (drag items from the main pane onto tree folders) ─────────
  const droppable = Boolean(onDropOnFolder || onDropFiles);

  function handleDragOver(e: React.DragEvent) {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') && onDropFiles ? 'copy' : 'move';
  }
  function handleDragEnter(e: React.DragEvent, id: string | 'root') {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    dropDepth.current += 1;
    setDropTargetId(id);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!droppable) return;
    e.stopPropagation();
    dropDepth.current -= 1;
    if (dropDepth.current <= 0) {
      dropDepth.current = 0;
      setDropTargetId(null);
    }
  }

  async function handleDrop(e: React.DragEvent, id: string | 'root') {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    dropDepth.current = 0;
    setDropTargetId(null);
    const targetId = id === 'root' ? null : id;
    if (e.dataTransfer.files.length > 0) {
      if (onDropFiles) await onDropFiles(targetId, Array.from(e.dataTransfer.files));
      return;
    }
    // A folder row may legitimately receive a drag of itself from the main pane
    // (no-op); the page-level handler validates and ignores illegal drops.
    await onDropOnFolder?.(targetId);
  }

  const dropStyle = (id: string | 'root'): React.CSSProperties | undefined =>
    dropTargetId === id
      ? { outline: '2px dashed var(--color-accent)', outlineOffset: -2, background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)' }
      : undefined;

  const row = (f: FolderTreeNode, depth: number) => {
    const isOpen = expanded.has(f.id);
    const isActive = currentId === f.id;
    const isRenaming = renamingId === f.id;
    const isCreatingHere = creatingIn === f.id;
    return (
      <div key={f.id}>
        <div
          className="group flex items-center gap-1 rounded-md pr-1 cursor-pointer transition-colors"
          style={{
            paddingLeft: depth * 14 + 4,
            background: isActive ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
            color: isActive ? 'var(--color-accent-700)' : 'var(--color-text)',
            ...dropStyle(f.id),
          }}
          onClick={() => onSelect(f.id)}
          onDragOver={(e) => handleDragOver(e)}
          onDragEnter={(e) => handleDragEnter(e, f.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e, f.id)}
          role="treeitem"
          aria-expanded={f.hasChildren ? isOpen : undefined}
        >
          {f.hasChildren ? (
            <button
              className="p-0.5 shrink-0"
              style={{ opacity: 0.5 }}
              onClick={(e) => { e.stopPropagation(); onToggle(f.id); }}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? <HiChevronDown className="w-3.5 h-3.5" /> : <HiChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          <HiFolder
            className="w-4 h-4 shrink-0"
            style={{ color: f.color ?? (isActive ? 'var(--color-accent)' : 'var(--color-neutral-500)') }}
          />
          {isRenaming ? (
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm px-1 py-0.5"
              style={{ border: '1px solid var(--color-accent)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)' }}
              autoFocus
            />
          ) : (
            <span className="flex-1 min-w-0 text-sm truncate py-1">{f.name}</span>
          )}
          <span className="text-[10px] shrink-0" style={{ opacity: 0.45 }}>{f.docCount > 0 ? f.docCount : ''}</span>
          <button
            className="p-0.5 shrink-0 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
            onClick={(e) => openMenu(e, f.id)}
            aria-label={`Options for ${f.name}`}
          >
            <HiDotsVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {isCreatingHere && (
          <div style={{ paddingLeft: (depth + 1) * 14 + 22 }}>
            <input
              value={createValue}
              onChange={(e) => setCreateValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitCreate();
                if (e.key === 'Escape') setCreatingIn(null);
              }}
              onBlur={commitCreate}
              placeholder="New folder…"
              className="w-full text-sm px-1 py-0.5 my-0.5"
              style={{ border: '1px solid var(--color-divider)', borderRadius: 4, background: 'transparent', color: 'var(--color-text)' }}
              autoFocus
            />
          </div>
        )}

        {isOpen && childrenOf(f.id).map((child) => row(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-0.5" role="tree">
      {/* Root */}
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors"
        style={{
          background: currentId === null ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent',
          color: currentId === null ? 'var(--color-accent-700)' : 'var(--color-text)',
          ...dropStyle('root'),
        }}
        onClick={() => onSelect(null)}
        onDragOver={(e) => handleDragOver(e)}
        onDragEnter={(e) => handleDragEnter(e, 'root')}
        onDragLeave={handleDragLeave}
        onDrop={(e) => void handleDrop(e, 'root')}
      >
        <HiCollection className="w-4 h-4 shrink-0" style={{ opacity: 0.7 }} />
        <span className="flex-1 text-sm font-medium truncate">All documents</span>
        <button
          className="p-0.5 opacity-40 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); startCreate(null); }}
          title="New folder"
        >
          <HiFolderAdd className="w-4 h-4" />
        </button>
      </div>

      {childrenOf(null).map((f) => row(f, 1))}

      {creatingIn === 'root' && (
        <div style={{ paddingLeft: 22 }}>
          <input
            value={createValue}
            onChange={(e) => setCreateValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitCreate();
              if (e.key === 'Escape') setCreatingIn(null);
            }}
            onBlur={commitCreate}
            placeholder="New folder…"
            className="w-full text-sm px-1 py-0.5 my-0.5"
            style={{ border: '1px solid var(--color-divider)', borderRadius: 4, background: 'transparent', color: 'var(--color-text)' }}
            autoFocus
          />
        </div>
      )}

      {/* Per-folder menu (portaled — same stacking-context trap as FileCard) */}
      {menu.kind === 'menu' && (() => {
        const f = byId.get(menu.folderId);
        if (!f) return null;
        return createPortal(
          <div
            data-item-menu
            className="card fixed p-1.5 w-48 z-[9999]"
            style={{ top: menu.top, left: menu.left, boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex items-center gap-3 px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
              style={{ borderRadius: 'var(--radius-md)' }}
              onClick={() => startRename(f)}
            >
              <HiPencil className="w-4 h-4 shrink-0" /> Rename
            </button>
            <button
              className="flex items-center gap-3 px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
              style={{ borderRadius: 'var(--radius-md)' }}
              onClick={() => startCreate(f.id)}
            >
              <HiFolderAdd className="w-4 h-4 shrink-0" /> New subfolder
            </button>
            <button
              className="flex items-center gap-3 px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
              style={{ borderRadius: 'var(--radius-md)' }}
              onClick={() => openMoveMenu(f)}
            >
              <HiArrowRight className="w-4 h-4 shrink-0" /> Move to…
            </button>
            <div className="my-1" style={{ borderTop: '1px solid var(--color-divider)' }} />
            <button
              className="flex items-center gap-3 px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]"
              style={{ color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}
              onClick={() => { setMenu({ kind: 'none' }); void onDelete(f.id); }}
            >
              <HiTrash className="w-4 h-4 shrink-0" /> Delete
            </button>
            <p className="px-3 py-1 text-[10px]" style={{ opacity: 0.45 }}>Deleting keeps documents & subfolders</p>
          </div>,
          document.body,
        );
      })()}

      {/* Move-to submenu (second level) */}
      {menu.kind === 'move' && (() => {
        const f = byId.get(menu.folderId);
        if (!f) return null;
        const targets = moveTargets(f);
        return createPortal(
          <div
            data-item-menu
            className="card fixed p-1.5 w-56 z-[9999] max-h-72 overflow-y-auto"
            style={{ top: menu.top, left: menu.left, boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {targets.map((t) => (
              <button
                key={t.id ?? 'root'}
                className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                style={{ borderRadius: 'var(--radius-md)' }}
                onClick={() => { setMenu({ kind: 'none' }); void onMove(f.id, t.id); }}
              >
                <HiFolder className="w-4 h-4 shrink-0" style={{ opacity: 0.6 }} />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
