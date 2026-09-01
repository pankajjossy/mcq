import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";

export default function LiveResults({ kind = "mcq" }) {
  const { id } = useParams();
  const [results, setResults] = useState([]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000); // auto-refresh for the big screen
    return () => clearInterval(interval);
  }, [id]);

  async function load() {
    try {
      const data = await api(`/teacher/${kind}/${id}/results`);
      setResults(data.results);
    } catch {
      /* keep showing last known results if a poll fails */
    }
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <span className="eyebrow">Live Results</span>
          <h1>Scoreboard</h1>
        </div>
        <Link className="btn" to="/teacher">Back to dashboard</Link>
      </div>

      {results.length === 0 && <p className="muted">Waiting for submissions...</p>}

      <table className="scoreboard">
        <thead>
          <tr><th>Rank</th><th>Roll No</th><th>Name</th><th>Score</th></tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{r.rollno}</td>
              <td>{r.name}</td>
              <td>{r.score}/{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
