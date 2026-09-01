// Edge Functions live at https://<project-ref>.supabase.co/functions/v1/<name>
// Both values come from your Supabase project: Settings -> API.
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getToken() {
  return localStorage.getItem("token");
}

// path looks like "/auth/teacher/login" or "/student/mcq/active" - the
// first segment is the Edge Function name, the rest is routed inside it.
export async function api(path, { method = "GET", body } = {}) {
  const headers = {
    "Content-Type": "application/json",
    // Supabase's function gateway wants the anon key on every call (it's
    // safe to expose - it's the public client key, not a secret). Our own
    // login system is separate: the app's JWT below is what each function
    // actually checks for authorization.
    apikey: ANON_KEY
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${FUNCTIONS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// Edge Functions cold-start in well under a second (unlike Render's free
// tier, which could take 30-60s) - so there's no need for a "waking up"
// retry loop anymore. Kept as a no-op passthrough so pages that still call
// it don't need changes.
export async function wakeBackend(onStatusChange) {
  onStatusChange(false);
  return true;
}

export function saveSession(token, user, role) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("role", role);
}

export function getSession() {
  const token = getToken();
  const userRaw = localStorage.getItem("user");
  const role = localStorage.getItem("role");
  if (!token || !userRaw) return null;
  return { token, user: JSON.parse(userRaw), role };
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("role");
}
