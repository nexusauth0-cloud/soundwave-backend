const path = require("path");
const fs = require("fs");
const db = require("../db");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

async function uploadSong(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file provided" });
    const { title, artist, album, color } = req.body;
    if (!title || !artist) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Title and artist are required" });
    }
    const { rows } = await db.query(
      `INSERT INTO songs (title, artist, album, duration, file_path, file_size, mime_type, color, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title.trim(), artist.trim(), album?.trim()||null, 0, req.file.filename, req.file.size, req.file.mimetype, color||"#1a1a2a", req.user.id]
    );
    res.status(201).json({ song: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
}

async function updateDuration(req, res) {
  try {
    await db.query(`UPDATE songs SET duration=$1 WHERE id=$2 AND uploaded_by=$3`, [Math.floor(req.body.duration), req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function streamSong(req, res) {
  try {
    const { rows } = await db.query(`SELECT * FROM songs WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const filePath = path.join(UPLOADS_DIR, rows[0].file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    if (range) {
      const [start, end] = range.replace(/bytes=/, "").split("-").map((v, i) => i === 0 ? parseInt(v) : v ? parseInt(v) : stat.size - 1);
      res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": rows[0].mime_type || "audio/mpeg" });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Length": stat.size, "Content-Type": rows[0].mime_type || "audio/mpeg", "Accept-Ranges": "bytes" });
      fs.createReadStream(filePath).pipe(res);
    }
    db.query(`UPDATE songs SET plays=plays+1 WHERE id=$1`, [req.params.id]).catch(()=>{});
  } catch (err) { res.status(500).json({ error: "Stream failed" }); }
}

async function getSongs(req, res) {
  try {
    const { search } = req.query;
    let query = `SELECT * FROM songs WHERE is_public=TRUE`;
    const params = [];
    if (search) { params.push(`%${search.toLowerCase()}%`); query += ` AND (LOWER(title) LIKE $1 OR LOWER(artist) LIKE $1)`; }
    query += ` ORDER BY created_at DESC`;
    const { rows } = await db.query(query, params);
    res.json({ songs: rows });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function getSong(req, res) {
  try {
    const { rows } = await db.query(`SELECT * FROM songs WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ song: rows[0] });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function deleteSong(req, res) {
  try {
    const { rows } = await db.query(`DELETE FROM songs WHERE id=$1 AND uploaded_by=$2 RETURNING file_path`, [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const fp = path.join(UPLOADS_DIR, rows[0].file_path);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ message: "Deleted" });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function toggleLike(req, res) {
  try {
    const { rows } = await db.query(`SELECT 1 FROM liked_songs WHERE user_id=$1 AND song_id=$2`, [req.user.id, req.params.id]);
    if (rows.length) {
      await db.query(`DELETE FROM liked_songs WHERE user_id=$1 AND song_id=$2`, [req.user.id, req.params.id]);
      res.json({ liked: false });
    } else {
      await db.query(`INSERT INTO liked_songs (user_id, song_id) VALUES ($1,$2)`, [req.user.id, req.params.id]);
      res.json({ liked: true });
    }
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function getLikedSongs(req, res) {
  try {
    const { rows } = await db.query(`SELECT s.* FROM songs s JOIN liked_songs l ON l.song_id=s.id WHERE l.user_id=$1 ORDER BY l.liked_at DESC`, [req.user.id]);
    res.json({ songs: rows });
  } catch { res.status(500).json({ error: "Failed" }); }
}

module.exports = { uploadSong, streamSong, getSongs, getSong, deleteSong, toggleLike, getLikedSongs, updateDuration };

async function createPlaylist(req, res) {
  try {
    const { name, description, color, emoji } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const { rows } = await db.query(
      `INSERT INTO playlists (name, description, owner_id, color) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, description || "", req.user.id, color || "#1a1a4a"]
    );
    res.status(201).json({ playlist: rows[0] });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function getPlaylist(req, res) {
  try {
    const { rows: pl } = await db.query(`SELECT * FROM playlists WHERE id=$1`, [req.params.id]);
    if (!pl.length) return res.status(404).json({ error: "Not found" });
    const { rows: songs } = await db.query(
      `SELECT s.* FROM songs s JOIN playlist_songs ps ON ps.song_id=s.id WHERE ps.playlist_id=$1 ORDER BY ps.position`,
      [req.params.id]
    );
    res.json({ playlist: pl[0], songs });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function addSongToPlaylist(req, res) {
  try {
    const { songId } = req.body;
    await db.query(
      `INSERT INTO playlist_songs (playlist_id, song_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, songId]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function removeSongFromPlaylist(req, res) {
  try {
    await db.query(`DELETE FROM playlist_songs WHERE playlist_id=$1 AND song_id=$2`, [req.params.id, req.params.songId]);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed" }); }
}

async function getUserPlaylists(req, res) {
  try {
    const { rows } = await db.query(`SELECT * FROM playlists WHERE owner_id=$1 ORDER BY created_at DESC`, [req.user.id]);
    res.json({ playlists: rows });
  } catch { res.status(500).json({ error: "Failed" }); }
}

module.exports = { uploadSong, streamSong, getSongs, getSong, deleteSong, toggleLike, getLikedSongs, updateDuration, createPlaylist, getPlaylist, addSongToPlaylist, removeSongFromPlaylist, getUserPlaylists };

async function getMyUploads(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT * FROM songs WHERE uploaded_by=$1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ songs: rows });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

module.exports = { uploadSong, streamSong, getSongs, getSong, deleteSong,
  toggleLike, getLikedSongs, updateDuration, createPlaylist, getPlaylist,
  addSongToPlaylist, removeSongFromPlaylist, getUserPlaylists, getMyUploads };
