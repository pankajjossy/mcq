import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, getSession } from "../api.js";
import PaperReview from "../components/PaperReview.jsx";
import Collapsible from "../components/Collapsible.jsx";
import { toTitleCase } from "../format.js";

export default function Wall() {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const session = getSession();
  const [teacherName, setTeacherName] = useState("");
  const [posts, setPosts] = useState([]);
  const [newText, setNewText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return navigate("/");
    load();
  }, [teacherId]);

  async function load() {
    try {
      const data = await api(`/wall/${teacherId}`);
      setTeacherName(data.teacherName);
      setPosts(data.posts);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitPost(e) {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      await api(`/wall/${teacherId}/posts`, { method: "POST", body: { body: newText } });
      setNewText("");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function isMine(item) {
    if (!session) return false;
    if (session.role === "teacher") return item.author_teacher_id === session.user?.id;
    return item.author_student_id === session.user?.id;
  }

  const isTeacher = session?.role === "teacher";

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">Class Wall</span>
          <h1 style={{ margin: 0 }}>{toTitleCase(teacherName)}</h1>
        </div>
        <button className="secondary" onClick={() => navigate(session?.role === "teacher" ? "/teacher" : "/student")}>
          ← Back
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={submitPost} style={{ marginBottom: 24 }}>
        <div className="field">
          <textarea
            rows="2"
            placeholder="Write something on the wall..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
        </div>
        <button type="submit">Post</button>
      </form>

      {posts.length === 0 && <p className="muted">No posts yet. Be the first to post!</p>}

      {posts.map((p) => (
        <WallPost
          key={p.id}
          post={p}
          isMine={isMine}
          isTeacher={isTeacher}
          session={session}
          onRefresh={load}
          setError={setError}
        />
      ))}
    </div>
  );
}

function WallPost({ post: p, isMine, isTeacher, session, onRefresh, setError }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(p.body);
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveEdit() {
    try {
      await api(`/wall/posts/${p.id}`, { method: "PUT", body: { body: editText } });
      setEditing(false);
      onRefresh();
    } catch (e) { setError(e.message); }
  }

  async function deletePost() {
    if (!confirm("Delete this post?")) return;
    try {
      await api(`/wall/posts/${p.id}`, { method: "DELETE" });
      onRefresh();
    } catch (e) { setError(e.message); }
  }

  async function submitReply(e) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      await api(`/wall/posts/${p.id}/replies`, { method: "POST", body: { body: replyText } });
      setReplyText("");
      setShowReply(false);
      onRefresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const headStr = p.mcq_set_id
    ? (p.mcq_topic ? `${p.mcq_subject} – ${p.mcq_topic}` : (p.mcq_subject || "MCQ Paper"))
    : null;

  return (
    <div style={{ marginBottom: 12 }}>
      <Collapsible
        head={
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{toTitleCase(p.author_name)}</span>
            {p.author_role === "teacher" && <span className="muted" style={{ fontWeight: "normal", fontSize: 13 }}>Teacher</span>}
            <span className="muted" style={{ fontWeight: "normal", fontSize: 13 }}>· {p.body.substring(0, 45)}{p.body.length > 45 ? "..." : ""}</span>
          </div>
        }
        meta={`${new Date(p.created_at).toLocaleDateString()} ${new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${p.updated_at ? " (edited)" : ""}`}
        className="wall-post"
      >
        {/* Attached MCQ paper */}
        {p.mcq_set_id && <AttachedPaper mcqSetId={p.mcq_set_id} headStr={headStr} />}

      {/* Post body or editor */}
      {editing ? (
        <div className="field" style={{ marginTop: 8 }}>
          <textarea rows="2" value={editText} onChange={(e) => setEditText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={saveEdit}>Save</button>
            <button className="secondary" onClick={() => { setEditing(false); setEditText(p.body); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="post-body">{p.body}</div>
      )}

      {/* Actions */}
      <div className="post-actions">
        <a onClick={() => { setShowReply(!showReply); setReplyText(""); }}>💬 Reply</a>
        {isMine(p) && !editing && <a onClick={() => setEditing(true)}>✏️ Edit</a>}
        {isMine(p) && <a onClick={deletePost} style={{ color: "var(--danger)" }}>🗑 Delete</a>}
      </div>

      {/* Replies thread */}
      {p.replies.length > 0 && (
        <div className="replies-container">
          {p.replies.map((r) => (
            <WallReply
              key={r.id}
              reply={r}
              isMine={isMine}
              isTeacher={isTeacher}
              session={session}
              onRefresh={onRefresh}
              setError={setError}
            />
          ))}
        </div>
      )}

      {/* Reply box */}
      {showReply && (
        <form onSubmit={submitReply} className="reply-box">
          <textarea
            rows="1"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
          />
          <button type="submit" disabled={busy}>Send</button>
        </form>
      )}
      </Collapsible>
    </div>
  );
}

function WallReply({ reply: r, isMine, isTeacher, session, onRefresh, setError }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(r.body);

  async function saveEdit() {
    try {
      await api(`/wall/replies/${r.id}`, { method: "PUT", body: { body: editText } });
      setEditing(false);
      onRefresh();
    } catch (e) { setError(e.message); }
  }

  async function deleteReply() {
    if (!confirm("Delete this reply?")) return;
    try {
      await api(`/wall/replies/${r.id}`, { method: "DELETE" });
      onRefresh();
    } catch (e) { setError(e.message); }
  }

  async function giveStar(stars) {
    try {
      await api(`/wall/replies/${r.id}/star`, { method: "POST", body: { stars } });
      onRefresh();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="wall-reply">
      <div className="post-head">
        <div>
          <span className="post-author">{toTitleCase(r.author_name)}</span>
          {r.author_role === "teacher" && <span className="muted"> · teacher</span>}
          {r.star_rating > 0 && (
            <span style={{ marginLeft: 8, color: "#e6a817", fontSize: 13 }}>
              {"★".repeat(r.star_rating)}{"☆".repeat(5 - r.star_rating)}
            </span>
          )}
        </div>
        <span className="post-meta">{new Date(r.created_at).toLocaleString()}{r.updated_at ? " (edited)" : ""}</span>
      </div>

      {editing ? (
        <div className="field">
          <textarea rows="2" value={editText} onChange={(e) => setEditText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={saveEdit}>Save</button>
            <button className="secondary" onClick={() => { setEditing(false); setEditText(r.body); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="post-body">{r.body}</div>
      )}

      <div className="post-actions">
        {isMine(r) && !editing && <a onClick={() => setEditing(true)}>✏️ Edit</a>}
        {isMine(r) && <a onClick={deleteReply} style={{ color: "var(--danger)" }}>🗑 Delete</a>}
        {isTeacher && !isMine(r) && (
          <span>
            ⭐ Rate:{" "}
            {[1, 2, 3, 4, 5].map((n) => (
              <a key={n} onClick={() => giveStar(n)} style={{ cursor: "pointer", color: "#e6a817", marginLeft: 3 }}>
                {n <= (r.star_rating || 0) ? "★" : "☆"}
              </a>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function AttachedPaper({ mcqSetId, headStr }) {
  const [paper, setPaper] = useState(null);
  const [err, setErr] = useState("");

  async function loadPaper() {
    if (paper) return;
    try {
      const data = await api(`/wall/mcq/${mcqSetId}`);
      setPaper(data);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ margin: "10px 0" }}>
      {err && <div className="error-banner">{err}</div>}
      <Collapsible head={headStr || "Attached Paper"} meta="MCQ" onOpen={loadPaper}>
        {paper ? <PaperReview questions={paper.questions} highlightCorrect /> : <p className="muted">Loading paper…</p>}
      </Collapsible>
    </div>
  );
}
