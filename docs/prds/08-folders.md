# PRD 8 — Folders & recency

Dashboard organization: folders + last-opened recency ("Jump back in").

## Observed UX (Turbo)
- "New folder" → modal ("Name your folder…") → appears with random color
  (`#6923FF` observed). Dashboard lists folders + contents with "Opened <time>
  ago"; "Jump back in →" points at the most recent item. Folder view = its
  contents with the composer on top.

## Implementation evidence
- `folders`: `folder_id, title, description, emoji, folder_color,
  parent_folder_id, student_id, is_public, folder_generation_type (USER|…),
  university_id, is_university_note, semantic_id, source_catalog_collection_id`.
- `last_opened`: `(object_id, object_type folder|content, student_id,
  last_opened)`; written on every open via `POST functions/v1/last-opened-update`
  (`{object_id, object_type, last_opened}`).
- Create: `POST functions/v1/folder-insert` — client generates id + color.
- Reads: `folder_with_last_opened` / `content_with_last_opened` views join
  recency in.

## Inkwell build
```sql
CREATE TABLE folders (
  folder_id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  color text DEFAULT '#6923FF',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE documents ADD COLUMN folder_id uuid REFERENCES folders;
CREATE TABLE last_opened (
  object_id uuid NOT NULL,
  object_type text NOT NULL,  -- 'document'|'folder'
  user_id uuid NOT NULL,
  last_opened timestamptz DEFAULT now(),
  PRIMARY KEY (object_id, user_id)
);
```
- Write `last_opened` upsert in the shared document-open endpoint (one line
  where all opens route through — not per-page).
- Dashboard query: join `last_opened` for sort + "Jump back in" card.
- Color: random from a fixed palette client-side.
- ponytail: skip nesting (`parent_folder_id`), emoji, university/semantic
  fields — flat folders until someone screams.

## Acceptance criteria
- Create folder, file docs, dashboard sorts by last-opened, Jump-back-in
  opens the right item.

**Effort:** 2 days. **Skipped:** nesting, drag-drop reordering — later.
