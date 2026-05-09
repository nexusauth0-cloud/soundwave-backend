const bcrypt = require("bcryptjs");
const db = require("../db");
const { signAccessToken, signRefreshToken, rotateRefreshToken, revokeAllRefreshTokens } = require("../utils/jwt");
const { createAuthToken, consumeAuthToken } = require("../utils/tokens");
const { sendMagicLink, sendVerificationEmail, sendPasswordReset, sendWelcomeEmail } = require("../emails");
const { logEvent } = require("../middleware/auth");

// ── Register ──────────────────────────────────────────────────────────────────
async function register(req, res) {
  try {
    const { email, password, displayName } = req.body;

    // Check existing user
    const { rows: existing } = await db.query(
      `SELECT id FROM users WHERE email = $1`, [email]
    );
    if (existing.length) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, display_name, username)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, username, role, plan, is_verified`,
      [email, passwordHash, displayName || username, username]
    );

    const user = rows[0];

    // Send email verification
    const token = await createAuthToken(email, "verify_email", user.id);
    await sendVerificationEmail(email, token);

    await logEvent(user.id, "register", req);

    res.status(201).json({
      message: "Account created. Please verify your email.",
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;

    const { rows } = await db.query(
      `SELECT id, email, password_hash, display_name, role, plan, is_verified, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    const user = rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "Account suspended" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await logEvent(user.id, "login_failed", req);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user.id, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    await logEvent(user.id, "login", req);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        plan: user.plan,
        isVerified: user.is_verified,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
}

// ── Refresh token ─────────────────────────────────────────────────────────────
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });

    const result = await rotateRefreshToken(refreshToken, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout(req, res) {
  try {
    await revokeAllRefreshTokens(req.user.id);
    await logEvent(req.user.id, "logout", req);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
}

// ── Verify email ──────────────────────────────────────────────────────────────
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    const record = await consumeAuthToken(token, "verify_email");

    if (!record) {
      return res.status(400).json({ error: "Invalid or expired verification link" });
    }

    await db.query(
      `UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE email = $1`,
      [record.email]
    );

    // Get user for welcome email + login
    const { rows } = await db.query(
      `SELECT id, email, display_name, role, plan FROM users WHERE email = $1`,
      [record.email]
    );

    const user = rows[0];
    await sendWelcomeEmail(user.email, user.display_name);

    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user.id);

    res.json({ message: "Email verified!", accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
}

// ── Magic link: request ────────────────────────────────────────────────────────
async function requestMagicLink(req, res) {
  try {
    const { email } = req.body;

    // Find or create user
    let { rows } = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
    let userId;

    if (!rows.length) {
      const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      const created = await db.query(
        `INSERT INTO users (email, username, display_name, is_verified)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        [email, username, username]
      );
      userId = created.rows[0].id;
    } else {
      userId = rows[0].id;
    }

    const token = await createAuthToken(email, "magic_link", userId);
    await sendMagicLink(email, token);

    // Always return 200 (don't leak if email exists)
    res.json({ message: "Magic link sent! Check your inbox." });
  } catch (err) {
    console.error("Magic link error:", err);
    res.status(500).json({ error: "Failed to send magic link" });
  }
}

// ── Magic link: verify ─────────────────────────────────────────────────────────
async function verifyMagicLink(req, res) {
  try {
    const { token } = req.query;
    const record = await consumeAuthToken(token, "magic_link");

    if (!record) {
      return res.status(400).json({ error: "Invalid or expired magic link" });
    }

    const { rows } = await db.query(
      `UPDATE users SET is_verified = TRUE, updated_at = NOW()
       WHERE email = $1
       RETURNING id, email, display_name, role, plan`,
      [record.email]
    );

    const user = rows[0];
    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user.id, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    await logEvent(user.id, "magic_link_login", req);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        plan: user.plan,
        isVerified: true,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Magic link verification failed" });
  }
}

// ── Forgot password ────────────────────────────────────────────────────────────
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const { rows } = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);

    // Always 200 (don't leak user existence)
    if (rows.length) {
      const token = await createAuthToken(email, "reset_password", rows[0].id);
      await sendPasswordReset(email, token);
    }

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    res.status(500).json({ error: "Request failed" });
  }
}

// ── Reset password ─────────────────────────────────────────────────────────────
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    const record = await consumeAuthToken(token, "reset_password");

    if (!record) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2`,
      [passwordHash, record.email]
    );

    // Revoke all sessions (security)
    await revokeAllRefreshTokens(record.user_id);
    await logEvent(record.user_id, "password_reset", req);

    res.json({ message: "Password updated. Please log in again." });
  } catch (err) {
    res.status(500).json({ error: "Password reset failed" });
  }
}

// ── Get current user ───────────────────────────────────────────────────────────
async function me(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, email, username, display_name, avatar_url, role, plan, is_verified, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
}

module.exports = {
  register, login, refresh, logout,
  verifyEmail, requestMagicLink, verifyMagicLink,
  forgotPassword, resetPassword, me,
};

async function resendVerification(req, res) {
  try {
    const { email } = req.body;
    const { rows } = await db.query(`SELECT id, is_verified FROM users WHERE email=$1`, [email]);
    if (!rows.length) return res.json({ message: "If that email exists, a link was sent." });
    if (rows[0].is_verified) return res.json({ message: "Already verified" });
    const token = await createAuthToken(email, "verify_email", rows[0].id);
    await sendVerificationEmail(email, token);
    res.json({ message: "Verification email sent!" });
  } catch (err) {
    res.status(500).json({ error: "Failed to resend" });
  }
}

module.exports = {
  register, login, refresh, logout,
  verifyEmail, requestMagicLink, verifyMagicLink,
  forgotPassword, resetPassword, me, resendVerification,
};
