import { useEffect, useState } from "react";
import { api } from "../api.js";
import { toTitleCase, formatShort } from "../format.js";

export default function CompactAttendance({ dept, sem, role = "principal" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null); setError("");
    const url = role === "teacher" ? `/teacher/attendance?sem=${encodeURIComponent(sem)}` : `/principal/attendance?dept=${encodeURIComponent(dept)}&sem=${encodeURIComponent(sem)}`;
    api(url).then(setData).catch(e => setError(e.message));
  }, [dept, sem, role]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="muted">Loading attendance…</p>;

  const papers = data.papers; // array with {id, kind, teacher_id, teacher_name, opened_at}
  const students = data.students; // array with {id, rollno, name}
  const att = data.attendance || {};

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{ padding: 8, textAlign: "left" }}>Student</th>
            {papers.map((p) => (
              <th key={`${p.kind}-${p.id}`} style={{ padding: 6, textAlign: "center", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                <div style={{ fontWeight: 700 }}>{toTitleCase(p.teacher_name)}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{formatShort(p.opened_at)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <td style={{ padding: 8 }}>{s.rollno} · {toTitleCase(s.name)}</td>
              {papers.map((p) => {
                const key = `${p.kind}-${p.id}`;
                const present = (att[key] || []).includes(s.id);
                return (
                  <td key={key} style={{ padding: 6, textAlign: "center", fontFamily: "monospace" }}>{present ? "P" : "A"}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
