const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const db = require("../db");
const { signAccessToken, signRefreshToken } = require("../utils/jwt");

// ── Helper: find or create OAuth user ─────────────────────────────────────────
async function findOrCreateOAuthUser(provider, profile) {
  const email = profile.emails?.[0]?.value;
  const displayName = profile.displayName || profile.username || email;
  const avatarUrl = profile.photos?.[0]?.value;
  const providerId = profile.id;

  // 1. Check if OAuth account already linked
  const { rows: existing } = await db.query(
    `SELECT u.* FROM users u
     JOIN oauth_accounts o ON o.user_id = u.id
     WHERE o.provider = $1 AND o.provider_id = $2`,
    [provider, providerId]
  );

  if (existing.length) return existing[0];

  // 2. Check if user exists by email → link account
  if (email) {
    const { rows: byEmail } = await db.query(
      `SELECT * FROM users WHERE email = $1`, [email]
    );

    if (byEmail.length) {
      await db.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [byEmail[0].id, provider, providerId]
      );
      return byEmail[0];
    }
  }

  // 3. Create new user
  const username = (email?.split("@")[0] || profile.username || "user")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

  const { rows: newUser } = await db.query(
    `INSERT INTO users (email, username, display_name, avatar_url, is_verified)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING *`,
    [email || null, username, displayName, avatarUrl || null]
  );

  await db.query(
    `INSERT INTO oauth_accounts (user_id, provider, provider_id)
     VALUES ($1, $2, $3)`,
    [newUser[0].id, provider, providerId]
  );

  return newUser[0];
}

// ── Google Strategy ───────────────────────────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ["profile", "email"],
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await findOrCreateOAuthUser("google", profile);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
));

// ── GitHub Strategy ───────────────────────────────────────────────────────────
passport.use(new GitHubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ["user:email"],
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await findOrCreateOAuthUser("github", profile);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
));

// ── OAuth success handler (shared) ────────────────────────────────────────────
async function oauthSuccess(req, res) {
  try {
    const user = req.user;
    const accessToken = signAccessToken(user);
    const refreshToken = await signRefreshToken(user.id, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    // Redirect to frontend with tokens in query string
    // Frontend should immediately move these to memory/secure storage
    const redirect = `${process.env.FRONTEND_URL}/auth/oauth-callback`
      + `?accessToken=${accessToken}`
      + `&refreshToken=${refreshToken}`;

    res.redirect(redirect);
  } catch (err) {
    res.redirect(`${process.env.FRONTEND_URL}/auth/login?error=oauth_failed`);
  }
}

module.exports = { passport, oauthSuccess };
