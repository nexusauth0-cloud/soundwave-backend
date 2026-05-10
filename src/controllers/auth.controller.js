const bcrypt = require("bcryptjs");
const db = require("../db");
const { signAccessToken, signRefreshToken, rotateRefreshToken, revokeAllRefreshTokens } = require("../utils/jwt");
const { createAuthToken, consumeAuthToken } = require("../utils/tokens");
const { logEvent } = require("../middleware/auth");
const {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendMagicLink,
  sendPasswordReset
} = require("../emails");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

async function register(req, res) {
  try {
    const { email, password, displayName } = req.body;
    const { rows: existing } = await db.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (existing.length) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, display_name, username, is_verified) 
       VALUES ($1, $2, $3, $4, FALSE) RETURNING id, email, display_name`,
      [email, passwordHash, displayName || username, username]
    );
    const user = rows[0];
    const token = await createAuthToken(user.email, "verify_email");

    try {
      await sendVerificationEmail(user.email, token);
    } catch (mailErr) {
      console.error("User created but email failed:", mailErr.message);
    }

    await logEvent(user.id, "register", req);
    res.status(201).json({
      message: "Account created! Please verify your email.",
      user: { email: user.email, isVerified: false }
    });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const { rows } = await db.query(
      `SELECT id, email, password_hash, display_name, role, plan, is_verified, is_active FROM users WHERE email=$1`, [email]
    );
    const user = rows[0];

    if (!user || !user.password_hash) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.is_active) return res.status(403).json({ error: "Account suspended" });

    if (!user.is_verified) {
      return res.status(403).json({
        error: "Please verify your email first.",
        needsVerification: true
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await logEvent(user.id, "login_failed", req);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user.id, { userAgent: req.headers["user-agent"], ip: req.ip });

    await logEvent(user.id, "login", req);
    res.json({ accessToken, refreshToken, user: { id: user.id, email: user.email, displayName: user.display_name, isVerified: true } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
}

async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    const record = await consumeAuthToken(token, "verify_email");
    if (!record) return res.redirect(`${FRONTEND_URL}/login?error=invalid_link`);

    await db.query(`UPDATE users SET is_verified=TRUE WHERE email=$1`, [record.email]);
    const { rows } = await db.query(`SELECT id, email, display_name, role, plan FROM users WHERE email=$1`, [record.email]);
    const user = rows[0];

    sendWelcomeEmail(user.email, user.display_name).catch(() => {});

    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user.id);

    // Success redirect with tokens
    return res.redirect(`${FRONTEND_URL}/dashboard?activated=true&token=${accessToken}&refresh=${refreshToken}`);
  } catch (err) {
    return res.redirect(`${FRONTEND_URL}/login?error=verification_failed`);
  }
}

async function verifyMagicLink(req, res) {
  try {
    const { token } = req.query;
    const record = await consumeAuthToken(token, "magic_link");
    if (!record) return res.redirect(`${FRONTEND_URL}/login?error=link_expired`);

    const { rows } = await db.query(
      `UPDATE users SET is_verified=TRUE WHERE email=$1 RETURNING id, email, display_name, role, plan`, [record.email]
    );
    const user = rows[0];

    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user.id);

    return res.redirect(`${FRONTEND_URL}/dashboard?login=success&token=${accessToken}&refresh=${refreshToken}`);
  } catch {
    return res.redirect(`${FRONTEND_URL}/login?error=failed`);
  }
}

async function requestMagicLink(req, res) {
  try {
    const { email } = req.body;
    let { rows } = await db.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (rows.length) {
      const token = await createAuthToken(email, "magic_link");
      await sendMagicLink(email, token);
    }
    res.json({ message: "Magic link sent if account exists." });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const { rows } = await db.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (rows.length) {
      const token = await createAuthToken(email, "reset_password");
      await sendPasswordReset(email, token);
    }
    res.json({ message: "Reset link sent." });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    const record = await consumeAuthToken(token, "reset_password");
    if (!record) return res.status(400).json({ error: "Invalid link" });

    const passwordHash = await bcrypt.hash(password, 12);
    await db.query(`UPDATE users SET password_hash=$1 WHERE email=$2`, [passwordHash, record.email]);
    res.json({ message: "Password updated!" });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    const result = await rotateRefreshToken(refreshToken, { userAgent: req.headers["user-agent"], ip: req.ip });
    res.json(result);
  } catch (err) { res.status(401).json({ error: err.message }); }
}

async function logout(req, res) {
  try {
    await revokeAllRefreshTokens(req.user.id);
    res.json({ message: "Logged out" });
  } catch { res.status(500).json({ error: "Logout failed" }); }
}

async function me(req, res) {
  try {
    const { rows } = await db.query(`SELECT id, email, username, display_name, avatar_url, role, plan, is_verified FROM users WHERE id=$1`, [req.user.id]);
    res.json({ user: rows[0] });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function resendVerification(req, res) {
  try {
    const { email } = req.body;
    const token = await createAuthToken(email, "verify_email");
    await sendVerificationEmail(email, token);
    res.json({ message: "Resent!" });
  } catch { res.status(500).json({ error: "Failed" }); }
}

module.exports = { 
  register, login, refresh, logout, verifyEmail, 
  requestMagicLink, verifyMagicLink, forgotPassword, 
  resetPassword, me, resendVerification 
};

