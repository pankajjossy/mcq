-- Run this once, after 0005_topic.sql.
--
-- Subject/topic names are no longer case-sensitive going forward (see the
-- titleCase() helper in supabase/functions/teacher/index.ts) - but that
-- only affects NEW saves. This one-time cleanup normalizes every existing
-- row so "python", "Python" and "PYTHON" (all already in the database from
-- before this fix) become the same "Python" everywhere, including in the
-- subject-suggestion list, not just on the performance screens (which
-- already tolerated the mismatch by normalizing at display time).
--
-- Postgres's built-in initcap() does the same Title Case normalization as
-- the app's own titleCase() helper. This does NOT fix genuine misspellings
-- (e.g. "Pyhton" stays "Pyhton") - only case and stray whitespace.

UPDATE mcq_sets   SET subject = initcap(btrim(subject)), topic = initcap(btrim(topic));
UPDATE short_sets SET subject = initcap(btrim(subject)), topic = initcap(btrim(topic));
