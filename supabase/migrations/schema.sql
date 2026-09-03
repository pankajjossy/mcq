-- Run this once in Supabase SQL editor (or psql) to set up all tables.

CREATE TABLE teachers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  login_name    TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE students (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  class         TEXT NOT NULL,
  rollno        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class, rollno)
);

-- One MCQ "paper" a teacher prepares, reviews, and later uploads.
CREATE TABLE mcq_sets (
  id            SERIAL PRIMARY KEY,
  teacher_id    INTEGER NOT NULL REFERENCES teachers(id),
  subject       TEXT NOT NULL,
  class         TEXT NOT NULL,
  title         TEXT NOT NULL,               -- e.g. "Physics"
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | ready | live | closed
  created_at    TIMESTAMPTZ DEFAULT now(),
  opened_at     TIMESTAMPTZ,                  -- when teacher clicked "Upload"
  closed_at     TIMESTAMPTZ                   -- when teacher clicked "Show Results"
);

CREATE TABLE mcq_questions (
  id             SERIAL PRIMARY KEY,
  mcq_set_id     INTEGER NOT NULL REFERENCES mcq_sets(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL,
  option_a       TEXT NOT NULL,
  option_b       TEXT NOT NULL,
  option_c       TEXT NOT NULL,
  option_d       TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  position       INTEGER NOT NULL DEFAULT 0
);

-- One attempt = one student taking one mcq_set, exactly once.
CREATE TABLE attempts (
  id            SERIAL PRIMARY KEY,
  mcq_set_id    INTEGER NOT NULL REFERENCES mcq_sets(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES students(id),
  score         INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  submitted_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mcq_set_id, student_id)
);

CREATE TABLE attempt_answers (
  id              SERIAL PRIMARY KEY,
  attempt_id      INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id     INTEGER NOT NULL REFERENCES mcq_questions(id),
  selected_option CHAR(1),
  is_correct      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_mcq_sets_status ON mcq_sets(status);
CREATE INDEX idx_attempts_student ON attempts(student_id);
CREATE INDEX idx_attempts_mcq_set ON attempts(mcq_set_id);
