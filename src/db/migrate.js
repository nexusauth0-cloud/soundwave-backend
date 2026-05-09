require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const db = require("./index");

async function migrate() {
  console.log("🚀 Running NexusAuth migrations...");

  await db.query(`
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- ── Users ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email         VARCHAR(255) UNIQUE NOT NULL,
      username      VARCHAR(100) UNIQUE,
      display_name  VARCHAR(255),
      avatar_url    TEXT,
      password_hash TEXT,                        -- NULL for OAuth-only users
      is_verified   BOOLEAN DEFAULT FALSE,
      is_active     BOOLEAN DEFAULT TRUE,
      plan          VARCHAR(20) DEFAULT 'free',  -- free | pro | family
      role          VARCHAR(20) DEFAULT 'user',  -- user | admin
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── OAuth providers linked to a user ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider        VARCHAR(50) NOT NULL,   -- google | github
      provider_id     VARCHAR(255) NOT NULL,
      access_token    TEXT,
      refresh_token   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_id)
    );

    -- ── Refresh tokens (rotation strategy) ────────────────────────────────
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  VARCHAR(255) UNIQUE NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      revoked     BOOLEAN DEFAULT FALSE,
      user_agent  TEXT,
      ip_address  VARCHAR(100)
    );

    -- ── Magic link / email verification tokens ─────────────────────────────
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
      email       VARCHAR(255) NOT NULL,
      token_hash  VARCHAR(255) UNIQUE NOT NULL,
      type        VARCHAR(30) NOT NULL,   -- magic_link | verify_email | reset_password
      expires_at  TIMESTAMPTZ NOT NULL,
      used        BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Password reset audit (security log) ───────────────────────────────
    CREATE TABLE IF NOT EXISTS auth_events (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
      event_type  VARCHAR(50) NOT NULL,   -- login | logout | password_change | etc
      ip_address  VARCHAR(100),
      user_agent  TEXT,
      metadata    JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Indexes ────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id);
  `);

  console.log("✅ Migrations complete!");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
