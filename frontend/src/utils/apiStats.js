const TODAY_KEY = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `api_stats_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const DEFAULT_QUOTA = 100;

export function getApiStats() {
  const raw = localStorage.getItem(TODAY_KEY());
  const quota = Number(localStorage.getItem("api_quota")) || DEFAULT_QUOTA;
  const data = raw ? JSON.parse(raw) : { count: 0 };
  return {
    count: data.count || 0,
    quota,
    remaining: Math.max(0, quota - (data.count || 0)),
    date: TODAY_KEY().replace("api_stats_", ""),
  };
}

export function incrementApiCount() {
  const key = TODAY_KEY();
  const raw = localStorage.getItem(key);
  const data = raw ? JSON.parse(raw) : { count: 0 };
  data.count = (data.count || 0) + 1;
  localStorage.setItem(key, JSON.stringify(data));
  return data.count;
}

export function setApiQuota(q) {
  localStorage.setItem("api_quota", String(q));
}
