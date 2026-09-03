-- Run this AFTER 0003. Your live database's wall_posts/wall_replies tables
-- were created by an earlier version of this app (author_type/content/
-- edited_at, with a nested parent_reply_id) - but the current wall edge
-- function and Wall.jsx expect a different shape (author_role/body/
-- updated_at, with a separate author_teacher_id/author_student_id per
-- row, and flat - not nested - replies). This migration converts the
-- existing tables in place, preserving every post and reply's content.
--
-- Note: nested replies-to-replies are flattened - the current wall UI only
-- supports one flat reply list per post, so parent_reply_id has nowhere to
-- go. The reply *content* itself is never deleted, only the "reply to a
-- reply" relationship.

-- ---- wall_posts ----
ALTER TABLE wall_posts RENAME COLUMN author_type TO author_role;
ALTER TABLE wall_posts RENAME COLUMN content TO body;
ALTER TABLE wall_posts RENAME COLUMN edited_at TO updated_at;
ALTER TABLE wall_posts ADD COLUMN author_teacher_id INTEGER REFERENCES teachers(id);
ALTER TABLE wall_posts ADD COLUMN author_student_id INTEGER REFERENCES students(id);

UPDATE wall_posts SET author_student_id = student_id WHERE author_role = 'student';
UPDATE wall_posts SET author_teacher_id = teacher_id WHERE author_role = 'teacher';

ALTER TABLE wall_posts DROP COLUMN student_id;

-- ---- wall_replies ----
ALTER TABLE wall_replies RENAME COLUMN author_type TO author_role;
ALTER TABLE wall_replies RENAME COLUMN content TO body;
ALTER TABLE wall_replies RENAME COLUMN edited_at TO updated_at;
ALTER TABLE wall_replies ADD COLUMN author_teacher_id INTEGER REFERENCES teachers(id);
ALTER TABLE wall_replies ADD COLUMN author_student_id INTEGER REFERENCES students(id);

UPDATE wall_replies SET author_student_id = student_id WHERE author_role = 'student';
-- A reply's author_teacher_id can only be the teacher who owns that wall -
-- look it up via the post it's attached to.
UPDATE wall_replies r
  SET author_teacher_id = wp.teacher_id
  FROM wall_posts wp
  WHERE r.post_id = wp.id AND r.author_role = 'teacher';

ALTER TABLE wall_replies DROP COLUMN student_id;
ALTER TABLE wall_replies DROP COLUMN parent_reply_id;
