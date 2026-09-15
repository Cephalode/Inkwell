-- Tie an Inkwell course to its Coursera source so course pages can pull
-- lectures/labs/assignments from the outline endpoint.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS coursera_slug TEXT;
