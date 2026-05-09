const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/music.controller");

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../uploads"),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg"];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Audio files only"));
  },
});

router.get("/", ctrl.getSongs);
router.get("/:id", ctrl.getSong);
router.get("/:id/stream", ctrl.streamSong);
router.post("/", requireAuth, upload.single("audio"), ctrl.uploadSong);
router.patch("/:id/duration", requireAuth, ctrl.updateDuration);
router.delete("/:id", requireAuth, ctrl.deleteSong);
router.post("/:id/like", requireAuth, ctrl.toggleLike);
router.get("/me/uploads", requireAuth, ctrl.getMyUploads);
router.get("/me/liked", requireAuth, ctrl.getLikedSongs);

module.exports = router;

router.get("/playlist/mine", requireAuth, ctrl.getUserPlaylists);
router.post("/playlist", requireAuth, ctrl.createPlaylist);
router.get("/playlist/:id", ctrl.getPlaylist);
router.post("/playlist/:id/songs", requireAuth, ctrl.addSongToPlaylist);
router.delete("/playlist/:id/songs/:songId", requireAuth, ctrl.removeSongFromPlaylist);
