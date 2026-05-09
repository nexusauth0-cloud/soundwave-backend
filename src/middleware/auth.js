const { verifyAccessToken } = require("../utils/jwt");
const db = require("../db");

// ── Require valid JWT ─────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const token = header.split(" ")[1];
    const payload = verifyAccessToken(token);

    // Attach user to request
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      plan: payload.plan,
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ── Require email verified ─────────────────────────────────────────────────────
async function requireVerified(req, res, next) {
  const { rows } = await db.query(
    `SELECT is_verified FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!rows[0]?.is_verified) {
    return res.status(403).json({ error: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
  }
  next();
}

// ── Require admin role ────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ── Require Pro or Family plan ────────────────────────────────────────────────
function requirePro(req, res, next) {
  if (!["pro", "family"].includes(req.user?.plan)) {
    return res.status(403).json({
      error: "Pro plan required",
      code: "UPGRADE_REQUIRED",
      upgradeUrl: `${process.env.FRONTEND_URL}/premium`,
    });
  }
  next();
}

// ── Log auth event ─────────────────────────────────────────────────────────────
async function logEvent(userId, eventType, req, metadata = {}) {
  await db.query(
    `INSERT INTO auth_events (user_id, event_type, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      eventType,
      req.ip || req.headers["x-forwarded-for"],
      req.headers["user-agent"],
      metadata,
    ]
  ).catch(() => {}); // never block the main flow
}

module.exports = { requireAuth, requireVerified, requireAdmin, requirePro, logEvent };
