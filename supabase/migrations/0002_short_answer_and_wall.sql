-- Run this once in the Supabase SQL editor (after schema.sql), same as before.
-- Adds: short-answer papers (photo upload, AI-graded) and the per-teacher
-- discussion wall.

-- ---- Short-answer papers (parallel structure to mcq_sets/mcq_questions) ----

CREATE TABLE short_sets (
  id            SERIAL PRIMARY KEY,
  teacher_id    INTEGER NOT NULL REFERENCES teachers(id),
  subject       TEXT NOT NULL,
  class         TEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ready', -- ready | live | closed
  created_at    TIMESTAMPTZ DEFAULT now(),
  opened_at     TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ
);

CREATE TABLE short_questions (
  id             SERIAL PRIMARY KEY,
  short_set_id   INTEGER NOT NULL REFERENCES short_sets(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL,
  max_marks      NUMERIC NOT NULL DEFAULT 5,
  position       INTEGER NOT NULL DEFAULT 0
);

-- One attempt = one student taking one short_set, exactly once (same
-- one-shot rule as mcq attempts).
CREATE TABLE short_attempts (
  id            SERIAL PRIMARY KEY,
  short_set_id  INTEGER NOT NULL REFERENCES short_sets(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id),
  score         NUMERIC NOT NULL DEFAULT 0,
  total         NUMERIC NOT NULL DEFAULT 0,
  submitted_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(short_set_id, student_id)
);

-- One row per question the student photographed. Photos are graded
-- on the spot by Gemini and are NOT stored (no image bytes kept) -
-- only the mark and feedback text come back.
CREATE TABLE short_attempt_answers (
  id             SERIAL PRIMARY KEY,
  attempt_id     INTEGER NOT NULL REFERENCES short_attempts(id) ON DELETE CASCADE,
  question_id    INTEGER NOT NULL REFERENCES short_questions(id),
  awarded_marks  NUMERIC NOT NULL DEFAULT 0,
  feedback       TEXT
);

CREATE INDEX idx_short_sets_status ON short_sets(status);
CREATE INDEX idx_short_attempts_student ON short_attempts(student_id);
CREATE INDEX idx_short_attempts_set ON short_attempts(short_set_id);

-- ---- Per-teacher discussion wall ----
-- One wall per teacher. Students who've taken that teacher's papers can
-- post (e.g. after finishing a test) and reply; the teacher can reply too.
-- author_role tells you which of the two author_*_id columns is set.

CREATE TABLE wall_posts (
  id                  SERIAL PRIMARY KEY,
  teacher_id          INTEGER NOT NULL REFERENCES teachers(id), -- whose wall
  author_role         TEXT NOT NULL CHECK (author_role IN ('teacher','student')),
  author_teacher_id   INTEGER REFERENCES teachers(id),
  author_student_id   INTEGER REFERENCES students(id),
  mcq_set_id          INTEGER REFERENCES mcq_sets(id), -- set if posted from a test result
  body                TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ
);

CREATE TABLE wall_replies (
  id                  SERIAL PRIMARY KEY,
  post_id             INTEGER NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
  author_role         TEXT NOT NULL CHECK (author_role IN ('teacher','student')),
  author_teacher_id   INTEGER REFERENCES teachers(id),
  author_student_id   INTEGER REFERENCES students(id),
  body                TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ
);

CREATE INDEX idx_wall_posts_teacher ON wall_posts(teacher_id, created_at DESC);
CREATE INDEX idx_wall_replies_post ON wall_replies(post_id);
