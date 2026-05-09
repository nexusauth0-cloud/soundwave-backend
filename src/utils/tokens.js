const crypto = require("crypto");
const db = require("../db");

// ── Generate a secure token and store its hash ────────────────────────────────
async function createAuthToken(email, type, userId = null) {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const minutes = parseInt(process.env.MAGIC_LINK_EXPIRES_MINUTES || "15");
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  // Invalidate any existing unused tokens of same type for this email
  await db.query(
    `UPDATE auth_tokens SET used = TRUE
     WHERE email = $1 AND type = $2 AND used = FALSE`,
    [email, type]
  );

  await db.query(
    `INSERT INTO auth_tokens (user_id, email, token_hash, type, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, email, hash, type, expiresAt]
  );

  return raw; // only raw token goes in the email link
}

// ── Verify and consume a token ────────────────────────────────────────────────
async function consumeAuthToken(rawToken, type) {
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const { rows } = await db.query(
    `SELECT * FROM auth_tokens
     WHERE token_hash = $1
       AND type = $2
       AND used = FALSE
       AND expires_at > NOW()`,
    [hash, type]
  );

  if (!rows.length) return null;

  // Mark as used (single-use tokens)
  await db.query(
    `UPDATE auth_tokens SET used = TRUE WHERE id = $1`,
    [rows[0].id]
  );

  return rows[0];
}

module.exports = { createAuthToken, consumeAuthToken };
