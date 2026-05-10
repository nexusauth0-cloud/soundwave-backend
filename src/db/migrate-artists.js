require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const db = require("./index");

async function migrateArtists() {
  console.log("🎤 Running artist tables migration...");
  await db.query(`
    -- Artist profiles
    CREATE TABLE IF NOT EXISTS artist_profiles (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stage_name  VARCHAR(255) NOT NULL,
      bio         TEXT,
      genre       VARCHAR(100),
      avatar_url  TEXT,
      banner_url  TEXT,
      instagram   VARCHAR(255),
      twitter     VARCHAR(255),
      verified    BOOLEAN DEFAULT FALSE,
      total_plays INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Followers
    CREATE TABLE IF NOT EXISTS artist_followers (
      artist_id   UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
      follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followed_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (artist_id, follower_id)
    );

    -- Update songs table to link to artist profile
    ALTER TABLE songs ADD COLUMN IF NOT EXISTS artist_profile_id UUID REFERENCES artist_profiles(id) ON DELETE SET NULL;
    ALTER TABLE songs ADD COLUMN IF NOT EXISTS cover_url TEXT;
    ALTER TABLE songs ADD COLUMN IF NOT EXISTS release_date DATE DEFAULT CURRENT_DATE;
    ALTER TABLE songs ADD COLUMN IF NOT EXISTS genre VARCHAR(100);
    ALTER TABLE songs ADD COLUMN IF NOT EXISTS plays_today INTEGER DEFAULT 0;

    -- Update users role
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_artist BOOLEAN DEFAULT FALSE;

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_artist_profiles_user ON artist_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_artist_followers_artist ON artist_followers(artist_id);
    CREATE INDEX IF NOT EXISTS idx_songs_artist_profile ON songs(artist_profile_id);
  `);
  console.log("✅ Artist tables ready!");
  process.exit(0);
}

migrateArtists().catch(err => { console.error("❌ Failed:", err); process.exit(1); });
