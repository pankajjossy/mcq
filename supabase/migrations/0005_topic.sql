-- Run this once in the Supabase SQL editor, after 0002/0003/0004.
--
-- Adds a "topic" alongside "subject" on papers - e.g. subject "Python",
-- topic "List" / "Tuple" / "Sets". This is IN ADDITION to semester, which
-- stays exactly as it is; nothing about semester changes here.
--
-- Nullable on purpose: existing rows saved before this migration won't
-- have a topic, and that's fine - the app only requires it going forward,
-- on newly created papers.

ALTER TABLE mcq_sets   ADD COLUMN topic TEXT;
ALTER TABLE short_sets ADD COLUMN topic TEXT;
