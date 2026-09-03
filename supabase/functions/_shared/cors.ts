// Shared CORS handling for every Edge Function.
// FRONTEND_ORIGIN is set as a Supabase secret once you know your GitHub
// Pages URL; falls back to "*" during local development.
const allowedOrigin = Deno.env.get("FRONTEND_ORIGIN") || "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

// Call this first in every function - handles the browser's CORS preflight
// request so the real request behind it isn't blocked.
export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
