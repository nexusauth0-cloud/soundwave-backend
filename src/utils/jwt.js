const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");

// ── Sign access token (short-lived) ──────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
}

// ── Sign refresh token (long-lived, stored in DB) ─────────────────────────────
async function signRefreshToken(userId, meta = {}) {
  const raw = crypto.randomBytes(64).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hash, expiresAt, meta.userAgent || null, meta.ip || null]
  );

  return raw; // send raw to client; only hash stored in DB
}

// ── Verify access token ───────────────────────────────────────────────────────
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// ── Rotate refresh token ──────────────────────────────────────────────────────
async function rotateRefreshToken(rawToken, meta = {}) {
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const { rows } = await db.query(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
    [hash]
  );

  if (!rows.length) throw new Error("Invalid or expired refresh token");

  // Revoke old token
  await db.query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`,
    [hash]
  );

  const { user_id } = rows[0];

  // Issue new pair
  const { rows: userRows } = await db.query(
    `SELECT id, email, role, plan FROM users WHERE id = $1`,
    [user_id]
  );

  if (!userRows.length) throw new Error("User not found");

  const user = userRows[0];
  const accessToken = signAccessToken(user);
  const newRefreshToken = await signRefreshToken(user.id, meta);

  return { accessToken, refreshToken: newRefreshToken, user };
}

// ── Revoke all refresh tokens for a user (logout all) ─────────────────────────
async function revokeAllRefreshTokens(userId) {
  await db.query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1`,
    [userId]
  );
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  rotateRefreshToken,
  revokeAllRefreshTokens,
};
