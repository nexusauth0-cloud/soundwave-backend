require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const db = require("./index");

async function migrateMusicTables() {
  console.log("🎵 Running music tables migration...");

  await db.query(`
    CREATE TABLE IF NOT EXISTS songs (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title        VARCHAR(255) NOT NULL,
      artist       VARCHAR(255) NOT NULL,
      album        VARCHAR(255),
      duration     INTEGER,
      file_path    TEXT NOT NULL,
      file_size    INTEGER,
      mime_type    VARCHAR(50),
      color        VARCHAR(20) DEFAULT '#1a1a1a',
      plays        INTEGER DEFAULT 0,
      uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
      is_public    BOOLEAN DEFAULT TRUE,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name         VARCHAR(255) NOT NULL,
      description  TEXT,
      owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      color        VARCHAR(20) DEFAULT '#1a1a1a',
      is_public    BOOLEAN DEFAULT FALSE,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      song_id     UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      position    INTEGER DEFAULT 0,
      added_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(playlist_id, song_id)
    );

    CREATE TABLE IF NOT EXISTS liked_songs (
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_id    UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      liked_at   TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, song_id)
    );

    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
    CREATE INDEX IF NOT EXISTS idx_songs_public ON songs(is_public);
    CREATE INDEX IF NOT EXISTS idx_playlist_songs ON playlist_songs(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_liked_songs ON liked_songs(user_id);
  `);

  console.log("✅ Music tables ready!");
  process.exit(0);
}

migrateMusicTables().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
