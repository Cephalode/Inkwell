-- 023_learning_flow.sql
-- Duolingo-style learning flow (learn → review → test, no self-grading).
-- Per-account preference so it follows the user across devices.

ALTER TABLE users ADD COLUMN IF NOT EXISTS learning_mode TEXT NOT NULL DEFAULT 'legacy';
