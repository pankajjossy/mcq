-- Run this once in the Supabase SQL editor, after 0002.

-- ---- "Class" -> "Semester" everywhere it was a class label ----
ALTER TABLE students  RENAME COLUMN class TO semester;
ALTER TABLE mcq_sets  RENAME COLUMN class TO semester;
ALTER TABLE short_sets RENAME COLUMN class TO semester;
-- The UNIQUE(class, rollno) / indexes on students carry over automatically
-- under Postgres's rename - no need to recreate them.

-- ---- Mixed question types on mcq_questions ----
-- True/False now reuses option_a/option_b ("True"/"False") + correct_option,
-- so grading code for mcq and true_false is identical. Fill-in-the-blank
-- stores its accepted answer directly in correct_option (now free TEXT,
-- not just A-D). Match-the-following uses match_pairs instead of options.
ALTER TABLE mcq_questions DROP CONSTRAINT IF EXISTS mcq_questions_correct_option_check;

ALTER TABLE mcq_questions
  ALTER COLUMN option_a DROP NOT NULL,
  ALTER COLUMN option_b DROP NOT NULL,
  ALTER COLUMN option_c DROP NOT NULL,
  ALTER COLUMN option_d DROP NOT NULL,
  ALTER COLUMN correct_option TYPE TEXT,
  ALTER COLUMN correct_option DROP NOT NULL;

ALTER TABLE mcq_questions
  ADD COLUMN question_type TEXT NOT NULL DEFAULT 'mcq'
    CHECK (question_type IN ('mcq','true_false','fill_blank','match')),
  ADD COLUMN marks NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  ADD COLUMN match_pairs JSONB; -- [{ "left": "...", "right": "..." }, ...] for question_type='match'

-- Marks can now vary per question, so a paper's total is a sum of marks,
-- not a plain question count - widen these from INTEGER to NUMERIC.
ALTER TABLE attempts ALTER COLUMN score TYPE NUMERIC;
ALTER TABLE attempts ALTER COLUMN total TYPE NUMERIC;

ALTER TABLE attempt_answers
  ALTER COLUMN selected_option TYPE TEXT,
  ADD COLUMN match_answer JSONB,      -- student's proposed pairing, for question_type='match'
  ADD COLUMN awarded_marks NUMERIC NOT NULL DEFAULT 0;
