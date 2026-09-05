// Edge Function: wall
// A simple per-teacher discussion wall. Any logged-in teacher or student
// can read/post/reply - a student's own posts and replies are editable by
// that student, a teacher's own by that teacher.
//
// Routes:
//   GET  /teachers                       -> { teachers }
//   GET  /:teacherId                     -> { teacherName, posts }
//   POST /:teacherId/posts   { body, mcqSetId? }  -> { id }
//   PUT  /posts/:id          { body }             -> { ok }   (author only)
//   DELETE /posts/:id                            -> { ok }   (author only)
//   POST /posts/:id/replies  { body }            -> { id }
//   PUT  /replies/:id        { body }            -> { ok }   (author only)
//   DELETE /replies/:id                         -> { ok }   (author only)
//   POST /replies/:id/star   { stars }           -> { ok }   (teacher only)
//   GET  /mcq/:id                               -> { set, questions }

import { query } from "../_shared/db.ts";
import { requireAnyAuth, type AuthUser } from "../_shared/jwt.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const user = requireAnyAuth(req);
  if (!user) return json({ error: "Not logged in." }, 401);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/wall/, "");
  const teacherWallMatch = path.match(/^\/(\d+)$/);
  const postsMatch = path.match(/^\/(\d+)\/posts$/);
  const postMatch = path.match(/^\/posts\/(\d+)$/);
  const repliesMatch = path.match(/^\/posts\/(\d+)\/replies$/);
  const replyMatch = path.match(/^\/replies\/(\d+)$/);
  const replyStarMatch = path.match(/^\/replies\/(\d+)\/star$/);
  const mcqReviewMatch = path.match(/^\/mcq\/(\d+)$/);

  try {
    if (req.method === "GET" && path === "/teachers") return await myTeachers(user);
    if (req.method === "GET" && mcqReviewMatch) return await pastPaper(mcqReviewMatch[1]);
    if (req.method === "GET" && teacherWallMatch) return await getWall(teacherWallMatch[1], user);
    if (req.method === "POST" && postsMatch) return await createPost(req, postsMatch[1], user);
    if (req.method === "PUT" && postMatch) return await editPost(req, postMatch[1], user);
    if (req.method === "DELETE" && postMatch) return await deletePost(postMatch[1], user);
    if (req.method === "POST" && repliesMatch) return await createReply(req, repliesMatch[1], user);
    if (req.method === "PUT" && replyMatch) return await editReply(req, replyMatch[1], user);
    if (req.method === "DELETE" && replyMatch) return await deleteReply(replyMatch[1], user);
    if (req.method === "POST" && replyStarMatch) return await starReply(req, replyStarMatch[1], user);

    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

async function myTeachers(user: AuthUser) {
  if (user.role !== "student") return json({ error: "Students only." }, 403);
  const result = await query(
    `SELECT DISTINCT t.id, t.name
     FROM attempts a
     JOIN mcq_sets ms ON ms.id = a.mcq_set_id
     JOIN teachers t ON t.id = ms.teacher_id
     WHERE a.student_id = $1
     ORDER BY t.name`,
    [user.id]
  );
  return json({ teachers: result.rows });
}

async function getWall(teacherId: string, _user: AuthUser) {
  const teacherResult = await query("SELECT id, name FROM teachers WHERE id=$1", [teacherId]);
  if (teacherResult.rowCount === 0) return json({ error: "Teacher not found." }, 404);

  const posts = await query(
    `SELECT p.id, p.author_role, p.body, p.created_at, p.updated_at,
            p.author_teacher_id, p.author_student_id, p.mcq_set_id,
            COALESCE(pt.name, ps.name) AS author_name,
            ms.subject AS mcq_subject,
            ms.topic AS mcq_topic
     FROM wall_posts p
     LEFT JOIN teachers pt ON pt.id = p.author_teacher_id
     LEFT JOIN students ps ON ps.id = p.author_student_id
     LEFT JOIN mcq_sets ms ON ms.id = p.mcq_set_id
     WHERE p.teacher_id = $1 AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC`,
    [teacherId]
  );

  const postIds = posts.rows.map((p: { id: number }) => p.id);
  let repliesByPost: Record<number, unknown[]> = {};
  if (postIds.length > 0) {
    const replies = await query(
      `SELECT r.id, r.post_id, r.author_role, r.body, r.created_at, r.updated_at,
              r.author_teacher_id, r.author_student_id, r.star_rating,
              COALESCE(rt.name, rs.name) AS author_name
       FROM wall_replies r
       LEFT JOIN teachers rt ON rt.id = r.author_teacher_id
       LEFT JOIN students rs ON rs.id = r.author_student_id
       WHERE r.post_id = ANY($1) AND r.deleted_at IS NULL
       ORDER BY r.created_at ASC`,
      [postIds]
    );
    repliesByPost = {};
    for (const r of replies.rows) {
      (repliesByPost[r.post_id] ||= []).push(r);
    }
  }

  const shaped = posts.rows.map((p: { id: number }) => ({ ...p, replies: repliesByPost[p.id] || [] }));
  return json({ teacherName: teacherResult.rows[0].name, posts: shaped });
}

async function createPost(req: Request, teacherId: string, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const text = (body.body || "").toString().trim();
  const mcqSetId = body.mcqSetId ? Number(body.mcqSetId) : null;
  if (!text) return json({ error: "Write something first." }, 400);

  const teacherCheck = await query("SELECT id FROM teachers WHERE id=$1", [teacherId]);
  if (teacherCheck.rowCount === 0) return json({ error: "Teacher not found." }, 404);

  const result = await query(
    `INSERT INTO wall_posts (teacher_id, author_role, author_teacher_id, author_student_id, mcq_set_id, body, author_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      teacherId,
      user.role,
      user.role === "teacher" ? user.id : null,
      user.role === "student" ? user.id : null,
      mcqSetId,
      text,
      user.name
    ]
  );
  return json({ id: result.rows[0].id });
}

async function editPost(req: Request, postId: string, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const text = (body.body || "").toString().trim();
  if (!text) return json({ error: "Write something first." }, 400);

  const ownerCol = user.role === "teacher" ? "author_teacher_id" : "author_student_id";
  const result = await query(
    `UPDATE wall_posts SET body=$1, updated_at=now()
     WHERE id=$2 AND author_role=$3 AND ${ownerCol}=$4 RETURNING id`,
    [text, postId, user.role, user.id]
  );
  if (result.rowCount === 0) return json({ error: "You can only edit your own posts." }, 403);
  return json({ ok: true });
}

async function deletePost(postId: string, user: AuthUser) {
  const ownerCol = user.role === "teacher" ? "author_teacher_id" : "author_student_id";
  const result = await query(
    `UPDATE wall_posts SET deleted_at=now()
     WHERE id=$1 AND author_role=$2 AND ${ownerCol}=$3 RETURNING id`,
    [postId, user.role, user.id]
  );
  if (result.rowCount === 0) return json({ error: "You can only delete your own posts." }, 403);
  return json({ ok: true });
}

async function createReply(req: Request, postId: string, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const text = (body.body || "").toString().trim();
  if (!text) return json({ error: "Write something first." }, 400);

  const postCheck = await query("SELECT id FROM wall_posts WHERE id=$1 AND deleted_at IS NULL", [postId]);
  if (postCheck.rowCount === 0) return json({ error: "Post not found." }, 404);

  const result = await query(
    `INSERT INTO wall_replies (post_id, author_role, author_teacher_id, author_student_id, body, author_name)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      postId,
      user.role,
      user.role === "teacher" ? user.id : null,
      user.role === "student" ? user.id : null,
      text,
      user.name
    ]
  );
  return json({ id: result.rows[0].id });
}

async function editReply(req: Request, replyId: string, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const text = (body.body || "").toString().trim();
  if (!text) return json({ error: "Write something first." }, 400);

  const ownerCol = user.role === "teacher" ? "author_teacher_id" : "author_student_id";
  const result = await query(
    `UPDATE wall_replies SET body=$1, updated_at=now()
     WHERE id=$2 AND author_role=$3 AND ${ownerCol}=$4 RETURNING id`,
    [text, replyId, user.role, user.id]
  );
  if (result.rowCount === 0) return json({ error: "You can only edit your own replies." }, 403);
  return json({ ok: true });
}

async function deleteReply(replyId: string, user: AuthUser) {
  const ownerCol = user.role === "teacher" ? "author_teacher_id" : "author_student_id";
  const result = await query(
    `UPDATE wall_replies SET deleted_at=now()
     WHERE id=$1 AND author_role=$2 AND ${ownerCol}=$3 RETURNING id`,
    [replyId, user.role, user.id]
  );
  if (result.rowCount === 0) return json({ error: "You can only delete your own replies." }, 403);
  return json({ ok: true });
}

async function starReply(req: Request, replyId: string, user: AuthUser) {
  if (user.role !== "teacher") return json({ error: "Only teachers can give stars." }, 403);
  const body = await req.json().catch(() => ({}));
  const stars = Math.min(5, Math.max(1, Number(body.stars) || 1));
  await query(
    `UPDATE wall_replies SET star_rating=$1 WHERE id=$2`,
    [stars, replyId]
  );
  return json({ ok: true });
}

async function pastPaper(id: string) {
  const setResult = await query(
    `SELECT id, subject, topic, semester, title FROM mcq_sets
     WHERE id=$1 AND (status='closed' OR (status='live' AND opened_at < now() - interval '40 minutes'))`,
    [id]
  );
  if (setResult.rowCount === 0) return json({ error: "That paper isn't available to view yet." }, 404);

  const questions = await query(
    `SELECT id, question_text, option_a, option_b, option_c, option_d,
            correct_option, question_type, marks, match_pairs
     FROM mcq_questions WHERE mcq_set_id=$1 ORDER BY position`,
    [id]
  );
  return json({ set: setResult.rows[0], questions: questions.rows });
}
