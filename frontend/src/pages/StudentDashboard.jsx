import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, getSession, clearSession } from "../api.js";
import Collapsible from "../components/Collapsible.jsx";
import PaperReview from "../components/PaperReview.jsx";
import { toTitleCase, paperLabel } from "../format.js";

function formatWhen(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function StudentDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [today, setToday] = useState([]);
  const [archive, setArchive] = useState([]);
  const [shortToday, setShortToday] = useState([]);
  const [shortArchive, setShortArchive] = useState([]);
  const [averages, setAverages] = useState([]);
  const [history, setHistory] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [tab, setTab] = useState("subjectwise");

  useEffect(() => {
    if (!session || session.role !== "student") return navigate("/");
    load();
  }, []);

  async function load() {
    const active = await api("/student/mcq/active");
    setToday(active.today);
    setArchive(active.archive);
    const dash = await api("/student/dashboard");
    setAverages(dash.averages);
    setHistory(dash.history);
    api("/student/short/active").then((d) => { setShortToday(d.today); setShortArchive(d.archive); }).catch(() => {});
    api("/wall/teachers").then((d) => setTeachers(d.teachers)).catch(() => {});
  }

  function logout() {
    clearSession();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">Exam Hall</span>
          <h1>{toTitleCase(session?.user?.name)}</h1>
        </div>
        <button className="secondary" onClick={logout}>Log out</button>
      </div>

      <h2>Today — pick your paper</h2>
      {today.length === 0 && shortToday.length === 0 && (
        <p className="muted">No paper has been uploaded yet, or the 30-minute window has passed. Wait for your teacher to announce one.</p>
      )}
      {today.map((t) => (
        <div className="ticket" key={`mcq-${t.id}`}>
          <div>
            <div className="subject">{t.semester} · {paperLabel(t.subject, t.topic)}</div>
            <div className="meta">{formatWhen(t.opened_at)}</div>
          </div>
          <Link className="btn" to={`/student/test/${t.id}`}>Appear</Link>
        </div>
      ))}
      {shortToday.map((t) => (
        <div className="ticket" key={`short-${t.id}`}>
          <div>
            <div className="subject">{t.semester} · {paperLabel(t.subject, t.topic)} <span className="muted">(short answer)</span></div>
            <div className="meta">{formatWhen(t.opened_at)}</div>
          </div>
          <Link className="btn" to={`/student/short/${t.id}`}>Appear</Link>
        </div>
      ))}

      <div className="tabs">
        <button className={tab === "subjectwise" ? "active" : ""} onClick={() => setTab("subjectwise")}>Subject-wise performance</button>
        <button className={tab === "overall" ? "active" : ""} onClick={() => setTab("overall")}>Overall performance</button>
      </div>

      {tab === "subjectwise" ? (
        <>
          {averages.length === 0 && <p className="muted">No tests taken yet.</p>}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
            {averages.map((a, i) => (
              <div className="card" key={i} style={{ minWidth: 140 }}>
                <div className="eyebrow">{a.subject}</div>
                <div className="avg-badge">{a.avg_percent}%</div>
                <div className="muted">{a.total_score}/{a.total_possible} overall</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="card" style={{ maxWidth: 280 }}>
          <div className="eyebrow">Overall</div>
          {(() => {
            const totalScore = history.reduce((s, h) => s + Number(h.score), 0);
            const totalPossible = history.reduce((s, h) => s + Number(h.total), 0);
            const avg = totalPossible ? Math.round((100 * totalScore) / totalPossible) : 0;
            return (
              <>
                <div className="avg-badge">{avg}%</div>
                <div className="muted">{totalScore}/{totalPossible} across {history.length} papers</div>
              </>
            );
          })()}
        </div>
      )}

      <h2>Past papers</h2>
      {archive.length === 0 && shortArchive.length === 0 && <p className="muted">Nothing taken yet.</p>}
      {archive.map((t) => (
        <ArchiveMcqRow key={`mcq-a-${t.id}`} t={t} />
      ))}
      {shortArchive.map((t) => (
        <Collapsible
          key={`short-a-${t.id}`}
          head={`${paperLabel(t.subject, t.topic)} (short answer)`}
          meta={formatWhen(t.submitted_at)}
          done
        >
          <p>Score: {t.score}/{t.total}</p>
        </Collapsible>
      ))}

      <h2>Class wall</h2>
      {teachers.length === 0 && <p className="muted">Take a test to unlock your teacher's wall.</p>}
      {teachers.map((t) => (
        <div className="ticket" key={`wall-${t.id}`}>
          <div className="subject">{toTitleCase(t.name)}</div>
          <Link className="btn" to={`/wall/${t.id}`}>Discuss</Link>
        </div>
      ))}
    </div>
  );
}

function ArchiveMcqRow({ t }) {
  const [review, setReview] = useState(null);
  const [wallPosted, setWallPosted] = useState(false);
  const [posting, setPosting] = useState(false);

  async function postToWall() {
    if (!t.teacher_id) return;
    setPosting(true);
    try {
      await api(`/wall/${t.teacher_id}/posts`, { method: "POST", body: { body: "Can we discuss this test?", mcqSetId: t.id } });
      setWallPosted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setPosting(false);
    }
  }

  return (
    <Collapsible
      head={`${t.semester || ""} ${paperLabel(t.subject, t.topic)}`.trim()}
      meta={`${formatWhen(t.submitted_at)} · ${t.score}/${t.total}`}
      done
    >
      {!review ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="secondary" onClick={() => api(`/student/mcq/${t.id}/review`).then(setReview)}>
            Review answers
          </button>
          <Link className="btn secondary" style={{ textDecoration: "none", color: "inherit" }} to={`/student/test/${t.id}?practice=true`}>
            Retake (practice)
          </Link>
          <button className="secondary" onClick={postToWall} disabled={wallPosted || posting}>
            {wallPosted ? "Posted to Wall" : posting ? "Posting..." : "Post to Wall"}
          </button>
        </div>
      ) : (
        <PaperReview questions={review.questions} />
      )}
    </Collapsible>
  );
}
