import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getSession, clearSession } from "../api.js";
import { toTitleCase } from "../format.js";

export default function PrincipalDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState("teachers"); // teachers | students
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [semesters, setSemesters] = useState(["1", "2", "3", "4", "5", "6", "7", "8"]);
  const [selectedSem, setSelectedSem] = useState("1");
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session || session.role !== "principal") return navigate("/");
    api("/principal/departments").then((d) => {
      setDepartments(d.departments);
      if (d.departments.length > 0) setSelectedDept(d.departments[0]);
      if (d.semesters && d.semesters.length > 0) {
        setSemesters(d.semesters);
        setSelectedSem(d.semesters[0]);
      }
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedDept) return;
    if (tab === "teachers") loadTeachers();
    else loadStudents();
  }, [selectedDept, selectedSem, tab]);

  async function loadTeachers() {
    setLoading(true); setError("");
    try {
      const d = await api(`/principal/teachers?dept=${encodeURIComponent(selectedDept)}`);
      setTeachers(d.teachers);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  async function loadStudents() {
    setLoading(true); setError("");
    try {
      const d = await api(`/principal/students?dept=${encodeURIComponent(selectedDept)}&sem=${encodeURIComponent(selectedSem)}`);
      setStudents(d.students);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  function logout() { clearSession(); navigate("/"); }

  // Group teacher papers by date
  function groupByDate(papers) {
    const map = {};
    for (const p of papers) {
      const d = (p.date && p.date !== "null") ? p.date : "Unpublished";
      (map[d] ||= []).push(p);
    }
    return Object.entries(map).sort(([a], [b]) => {
      if (a === "Unpublished") return -1;
      if (b === "Unpublished") return 1;
      return a.localeCompare(b); // Sort dates chronologically ascending (as in user's image)
    });
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">Principal Portal</span>
          <h1 style={{ margin: 0 }}>{toTitleCase(session?.user?.name)}</h1>
        </div>
        <button className="secondary" onClick={logout}>Log out</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Department selector */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
        <div className="field" style={{ margin: 0, minWidth: 180 }}>
          <label style={{ marginBottom: 4, display: "block" }}>Department</label>
          <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid rgba(43,36,26,0.3)", background: "var(--paper)", color: "var(--paper-ink)", fontFamily: "var(--sans)" }}>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {tab === "students" && (
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label style={{ marginBottom: 4, display: "block" }}>Semester</label>
            <select value={selectedSem} onChange={(e) => setSelectedSem(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid rgba(43,36,26,0.3)", background: "var(--paper)", color: "var(--paper-ink)", fontFamily: "var(--sans)" }}>
              {semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button className={tab === "teachers" ? "active" : ""} onClick={() => setTab("teachers")}>Teacher Attendance</button>
        <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>Student Performance</button>
      </div>

      {loading && <p className="muted">Loading…</p>}

      {/* ── TEACHER ATTENDANCE ── */}
      {!loading && tab === "teachers" && (
        <div>
          {teachers.length === 0 && <p className="muted">No teachers found in this department.</p>}
          {teachers.length > 0 && (
            <div className="card" style={{ padding: "16px", overflowX: "auto" }}>
              {(() => {
                const allDates = new Set();
                teachers.forEach(t => t.papers.forEach(p => {
                  const d = (p.date && p.date !== "null") ? p.date : "Unpublished";
                  allDates.add(d);
                }));
                const dateColumns = Array.from(allDates).sort((a, b) => {
                  if (a === "Unpublished") return -1;
                  if (b === "Unpublished") return 1;
                  return a.localeCompare(b);
                });

                return (
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "var(--paper-ink)", textTransform: "uppercase", fontSize: 13, letterSpacing: 1 }}>NAME</th>
                        {dateColumns.map(d => (
                          <th key={d} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "var(--paper-ink)", textTransform: "uppercase", fontSize: 13, letterSpacing: 1 }}>
                            {d === "Unpublished" ? d : new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map(t => {
                        const grouped = groupByDate(t.papers);
                        const paperMap = Object.fromEntries(grouped);
                        return (
                          <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <td style={{ padding: "12px", fontWeight: 600, fontSize: 15, verticalAlign: "top" }}>
                              {toTitleCase(t.name)}
                            </td>
                            {dateColumns.map(d => (
                              <td key={d} style={{ padding: "12px", verticalAlign: "top" }}>
                                {(paperMap[d] || []).map((p, i) => {
                                  // Time string formatting
                                  const timeFormat = p.time_str ? p.time_str.replace(" AM", "").replace(" PM", "") : "N/A";
                                  return (
                                    <div key={i} style={{ marginBottom: 6, fontSize: 14, fontFamily: "monospace" }}>
                                      {p.semester}-{toTitleCase(p.subject)}({timeFormat})
                                    </div>
                                  );
                                })}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── STUDENT PERFORMANCE ── */}
      {!loading && tab === "students" && (
        <div>
          {students.length === 0 && <p className="muted">No students found.</p>}
          {students.map((s, rank) => (
            <div key={s.id} className="card" style={{ marginBottom: 16, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>#{rank + 1} {toTitleCase(s.name)}</span>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>({s.rollno})</span>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ textAlign: "center" }}>
                    <div className="eyebrow" style={{ fontSize: 10 }}>Attendance</div>
                    <div className="avg-badge" style={{ fontSize: 18 }}>{s.attendance}%</div>
                    <div className="muted" style={{ fontSize: 11 }}>{s.total_appeared}/{s.total_offered} tests</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="eyebrow" style={{ fontSize: 10 }}>Overall</div>
                    <div className="avg-badge" style={{ fontSize: 18 }}>{s.overall}%</div>
                  </div>
                </div>
              </div>

              {/* Subject-wise */}
              {s.subjects.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, borderTop: "1px dashed rgba(43,36,26,0.15)", paddingTop: 10 }}>
                  {s.subjects.map((sub, i) => (
                    <div key={i} className="card" style={{ minWidth: 110, padding: "8px 12px", background: "rgba(43,36,26,0.05)" }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{toTitleCase(sub.subject)}</div>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>({toTitleCase(sub.teacher_name)})</div>
                      <div className="avg-badge" style={{ fontSize: 16 }}>{sub.avg_percent}%</div>
                      <div className="muted" style={{ fontSize: 11 }}>{sub.total_score}/{sub.total_possible} · {sub.tests_taken} test{sub.tests_taken !== 1 ? "s" : ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
