import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, getSession } from "../api.js";
import PaperReview from "../components/PaperReview.jsx";

export default function Wall() {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const session = getSession();
  const [teacherName, setTeacherName] = useState("");
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState("");
  const [error, setError] = useState("");
  const [replyBoxFor, setReplyBoxFor] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState(null); // { kind: 'post'|'reply', id }
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (!session) return navigate("/");
    load();
  }, [teacherId]);

  async function load() {
    try {
      const data = await api(`/wall/${teacherId}`);
      setTeacherName(data.teacherName);
      setPosts(data.posts);
    } catch (err) {
      setError(err.message);
    }
  }

  function isMine(p) {
    if (!session) return false;
    if (session.role === "teacher") return p.author_role === "teacher" && p.author_teacher_id === session.user.id;
    return p.author_role === "student" && p.author_student_id === session.user.id;
  }

  async function submitPost() {
    if (!newPost.trim()) return;
    try {
      await api(`/wall/${teacherId}/posts`, { method: "POST", body: { body: newPost } });
      setNewPost("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitReply(postId) {
    if (!replyText.trim()) return;
    try {
      await api(`/wall/posts/${postId}/replies`, { method: "POST", body: { body: replyText } });
      setReplyText("");
      setReplyBoxFor(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(kind, id, currentBody) {
    setEditing({ kind, id });
    setEditText(currentBody);
  }

  async function saveEdit() {
    if (!editText.trim()) return;
    try {
      const path = editing.kind === "post" ? `/wall/posts/${editing.id}` : `/wall/replies/${editing.id}`;
      await api(path, { method: "PUT", body: { body: editText } });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">Class Wall</span>
          <h1>{teacherName || "..."}</h1>
        </div>
        <Link className="btn" to={session?.role === "teacher" ? "/teacher" : "/student"}>Back to dashboard</Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Ask a question or post something</h2>
        <div className="field">
          <textarea rows="3" value={newPost} onChange={(e) => setNewPost(e.target.value)} placeholder="What's on your mind?" />
        </div>
        <button onClick={submitPost}>Post</button>
      </div>

      {posts.length === 0 && <p className="muted">Nothing posted yet — be the first.</p>}

      {posts.map((p) => (
        <div className="wall-post" key={p.id}>
          <div className="post-head">
            <div>
              <span className="post-author">{p.author_name}</span>
              {p.author_role === "teacher" && <span className="muted"> · teacher</span>}
              {p.mcq_subject && <span className="muted"> · re: {p.mcq_subject} test</span>}
            </div>
            <span className="post-meta">{new Date(p.created_at).toLocaleString()}{p.updated_at ? " (edited)" : ""}</span>
          </div>

          {p.mcq_set_id && <PaperLink mcqSetId={p.mcq_set_id} />}

          {editing?.kind === "post" && editing.id === p.id ? (
            <div className="field">
              <textarea rows="2" value={editText} onChange={(e) => setEditText(e.target.value)} />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={saveEdit}>Save</button>
                <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="post-body">{p.body}</div>
          )}

          <div className="post-actions">
            <a onClick={() => { setReplyBoxFor(replyBoxFor === p.id ? null : p.id); setReplyText(""); }}>Reply</a>
            {isMine(p) && editing?.id !== p.id && <a onClick={() => startEdit("post", p.id, p.body)}>Edit</a>}
          </div>

          {p.replies.map((r) => (
            <div className="wall-reply" key={r.id}>
              <div className="post-head">
                <div>
                  <span className="post-author">{r.author_name}</span>
                  {r.author_role === "teacher" && <span className="muted"> · teacher</span>}
                </div>
                <span className="post-meta">{new Date(r.created_at).toLocaleString()}{r.updated_at ? " (edited)" : ""}</span>
              </div>
              {editing?.kind === "reply" && editing.id === r.id ? (
                <div className="field">
                  <textarea rows="2" value={editText} onChange={(e) => setEditText(e.target.value)} />
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button onClick={saveEdit}>Save</button>
                    <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="post-body">{r.body}</div>
              )}
              {isMine(r) && editing?.id !== r.id && (
                <div className="post-actions"><a onClick={() => startEdit("reply", r.id, r.body)}>Edit</a></div>
              )}
            </div>
          ))}

          {replyBoxFor === p.id && (
            <div className="reply-box">
              <textarea rows="1" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write a reply..." />
              <button onClick={() => submitReply(p.id)}>Send</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PaperLink({ mcqSetId }) {
  const [paper, setPaper] = useState(null);
  const [err, setErr] = useState("");

  async function toggle() {
    if (paper) return setPaper(null);
    try {
      const data = await api(`/wall/mcq/${mcqSetId}`);
      setPaper(data);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <a onClick={toggle}>{paper ? "Hide paper" : "View paper"}</a>
      {err && <div className="error-banner">{err}</div>}
      {paper && (
        <div style={{ marginTop: 10 }}>
          <PaperReview questions={paper.questions} />
        </div>
      )}
    </div>
  );
}
