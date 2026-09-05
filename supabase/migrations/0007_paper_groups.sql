-- A teacher building one paper on the "New Paper" screen can mix MCQ-family
-- questions with short-answer questions. Under the hood these still live in
-- two tables (mcq_sets/mcq_questions vs short_sets/short_questions,
-- because they're graded completely differently - MCQ auto-grades on
-- submit, short-answer needs a photo + Gemini grading pass) - but from the
-- teacher's point of view it's ONE paper. group_id ties the two rows
-- together so the dashboard, upload/close, delete, and relabel actions can
-- treat them as a single unit. A solo MCQ-only or short-only paper has
-- group_id = NULL and behaves exactly as before.

ALTER TABLE mcq_sets ADD COLUMN group_id TEXT;
ALTER TABLE short_sets ADD COLUMN group_id TEXT;

CREATE INDEX idx_mcq_sets_group ON mcq_sets(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_short_sets_group ON short_sets(group_id) WHERE group_id IS NOT NULL;
