import jwt from "npm:jsonwebtoken@9.0.2";

const SECRET = Deno.env.get("JWT_SECRET")!;

// deno-lint-ignore no-explicit-any
export function signToken(payload: any): string {
  return jwt.sign(payload, SECRET, { expiresIn: "12h" });
}

export interface AuthUser {
  id: number;
  role: "teacher" | "student" | "admin";
  name: string;
  semester?: string;
}

// Reads the Authorization: Bearer <token> header, verifies it, and checks
// the role matches. Returns the decoded user or null (caller returns 401/403).
export function requireAuth(req: Request, role: "teacher" | "student" | "admin"): AuthUser | null {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, SECRET) as AuthUser;
    if (payload.role !== role) return null;
    return payload;
  } catch {
    return null;
  }
}

// Same as requireAuth but accepts either role - used by the wall function,
// which both teachers and students post to.
export function requireAnyAuth(req: Request): AuthUser | null {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  try {
    return jwt.verify(token, SECRET) as AuthUser;
  } catch {
    return null;
  }
}
