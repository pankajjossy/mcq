import { useState, useEffect } from "react";
import { getApiStats } from "../utils/apiStats.js";

export default function ApiStatsFooter() {
  const [stats, setStats] = useState(() => getApiStats());

  useEffect(() => {
    const id = setInterval(() => setStats(getApiStats()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="api-stats-footer">
      API calls today ({stats.date}): {stats.count} / {stats.quota} used &middot; {stats.remaining} free
    </footer>
  );
}
