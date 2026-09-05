import jwt from "jsonwebtoken";

// Verifies the token and attaches { id, role } to req.user.
// role must be "teacher" or "student".
export function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not logged in." });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (role && payload.role !== role) {
        return res.status(403).json({ error: "Not allowed for this account type." });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Session expired, please log in again." });
    }
  };
}
