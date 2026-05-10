const db = require("../db");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// ── Become an artist ──────────────────────────────────────────────────────────
async function becomeArtist(req, res) {
  try {
    const { stageName, bio, genre, instagram, twitter } = req.body;
    if (!stageName) return res.status(400).json({ error: "Stage name required" });

    const { rows: existing } = await db.query(
      `SELECT id FROM artist_profiles WHERE user_id=$1`, [req.user.id]
    );
    if (existing.length) return res.status(409).json({ error: "Already an artist" });

    const { rows } = await db.query(
      `INSERT INTO artist_profiles (user_id, stage_name, bio, genre, instagram, twitter)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, stageName, bio||"", genre||"", instagram||"", twitter||""]
    );

    await db.query(
      `UPDATE users SET is_artist=TRUE, role='artist' WHERE id=$1`,
      [req.user.id]
    );

    res.status(201).json({ artist: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create artist profile" });
  }
}

// ── Get artist profile ────────────────────────────────────────────────────────
async function getArtist(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT ap.*, u.email,
        (SELECT COUNT(*) FROM artist_followers WHERE artist_id=ap.id) as followers,
        (SELECT COUNT(*) FROM songs WHERE artist_profile_id=ap.id) as song_count,
        (SELECT COALESCE(SUM(plays),0) FROM songs WHERE artist_profile_id=ap.id) as total_plays
       FROM artist_profiles ap
       JOIN users u ON u.id=ap.user_id
       WHERE ap.id=$1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Artist not found" });
    res.json({ artist: rows[0] });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Get my artist profile ─────────────────────────────────────────────────────
async function getMyArtistProfile(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT ap.*,
        (SELECT COUNT(*) FROM artist_followers WHERE artist_id=ap.id) as followers,
        (SELECT COUNT(*) FROM songs WHERE artist_profile_id=ap.id) as song_count,
        (SELECT COALESCE(SUM(plays),0) FROM songs WHERE artist_profile_id=ap.id) as total_plays
       FROM artist_profiles ap WHERE ap.user_id=$1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "No artist profile" });
    res.json({ artist: rows[0] });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Update artist profile ─────────────────────────────────────────────────────
async function updateArtistProfile(req, res) {
  try {
    const { stageName, bio, genre, instagram, twitter } = req.body;
    const { rows } = await db.query(
      `UPDATE artist_profiles SET
        stage_name=COALESCE($1,stage_name),
        bio=COALESCE($2,bio),
        genre=COALESCE($3,genre),
        instagram=COALESCE($4,instagram),
        twitter=COALESCE($5,twitter),
        updated_at=NOW()
       WHERE user_id=$6 RETURNING *`,
      [stageName, bio, genre, instagram, twitter, req.user.id]
    );
    res.json({ artist: rows[0] });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Get artist songs ──────────────────────────────────────────────────────────
async function getArtistSongs(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT s.*, ap.stage_name as artist_name, ap.avatar_url as artist_avatar
       FROM songs s
       LEFT JOIN artist_profiles ap ON ap.id=s.artist_profile_id
       WHERE s.artist_profile_id=(
         SELECT id FROM artist_profiles WHERE id=$1
       ) AND s.is_public=TRUE
       ORDER BY s.created_at DESC`,
      [req.params.id]
    );
    res.json({ songs: rows });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Follow / unfollow ─────────────────────────────────────────────────────────
async function toggleFollow(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT 1 FROM artist_followers WHERE artist_id=$1 AND follower_id=$2`,
      [id, req.user.id]
    );
    if (rows.length) {
      await db.query(`DELETE FROM artist_followers WHERE artist_id=$1 AND follower_id=$2`, [id, req.user.id]);
      res.json({ following: false });
    } else {
      await db.query(`INSERT INTO artist_followers (artist_id, follower_id) VALUES ($1,$2)`, [id, req.user.id]);
      res.json({ following: true });
    }
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Check if following ────────────────────────────────────────────────────────
async function isFollowing(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT 1 FROM artist_followers WHERE artist_id=$1 AND follower_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ following: rows.length > 0 });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Get all artists ───────────────────────────────────────────────────────────
async function getAllArtists(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT ap.*,
        (SELECT COUNT(*) FROM artist_followers WHERE artist_id=ap.id) as followers,
        (SELECT COUNT(*) FROM songs WHERE artist_profile_id=ap.id) as song_count
       FROM artist_profiles ap
       ORDER BY followers DESC, ap.created_at DESC
       LIMIT 50`
    );
    res.json({ artists: rows });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Get followed artists' songs (feed) ────────────────────────────────────────
async function getMyFeed(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT s.*, ap.stage_name as artist_name, ap.avatar_url as artist_avatar, ap.id as artist_id
       FROM songs s
       JOIN artist_profiles ap ON ap.id=s.artist_profile_id
       JOIN artist_followers af ON af.artist_id=ap.id
       WHERE af.follower_id=$1 AND s.is_public=TRUE
       ORDER BY s.created_at DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json({ songs: rows });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Upload avatar ─────────────────────────────────────────────────────────────
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No image provided" });
    const url = `/uploads/${req.file.filename}`;
    await db.query(`UPDATE artist_profiles SET avatar_url=$1 WHERE user_id=$2`, [url, req.user.id]);
    res.json({ avatar_url: url });
  } catch { res.status(500).json({ error: "Failed" }); }
}

// ── Artist dashboard stats ────────────────────────────────────────────────────
async function getDashboard(req, res) {
  try {
    const { rows: profile } = await db.query(
      `SELECT ap.*,
        (SELECT COUNT(*) FROM artist_followers WHERE artist_id=ap.id) as followers,
        (SELECT COUNT(*) FROM songs WHERE artist_profile_id=ap.id) as total_songs,
        (SELECT COALESCE(SUM(plays),0) FROM songs WHERE artist_profile_id=ap.id) as total_plays
       FROM artist_profiles ap WHERE ap.user_id=$1`,
      [req.user.id]
    );
    if (!profile.length) return res.status(404).json({ error: "No artist profile" });

    const { rows: topSongs } = await db.query(
      `SELECT id, title, plays, cover_url, created_at FROM songs
       WHERE artist_profile_id=$1 ORDER BY plays DESC LIMIT 5`,
      [profile[0].id]
    );

    const { rows: recentSongs } = await db.query(
      `SELECT id, title, plays, cover_url, created_at FROM songs
       WHERE artist_profile_id=$1 ORDER BY created_at DESC LIMIT 5`,
      [profile[0].id]
    );

    res.json({ profile: profile[0], topSongs, recentSongs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
}

module.exports = {
  becomeArtist, getArtist, getMyArtistProfile, updateArtistProfile,
  getArtistSongs, toggleFollow, isFollowing, getAllArtists,
  getMyFeed, uploadAvatar, getDashboard
};
