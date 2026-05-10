const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/artist.controller");

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../uploads"),
  filename: (req, file, cb) => {
    cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    ["image/jpeg","image/png","image/webp"].includes(file.mimetype)
      ? cb(null, true) : cb(new Error("Images only"));
  },
});

router.get("/",                    ctrl.getAllArtists);
router.get("/me",                  requireAuth, ctrl.getMyArtistProfile);
router.get("/me/dashboard",        requireAuth, ctrl.getDashboard);
router.get("/me/feed",             requireAuth, ctrl.getMyFeed);
router.post("/become",             requireAuth, ctrl.becomeArtist);
router.put("/me",                  requireAuth, ctrl.updateArtistProfile);
router.post("/me/avatar",          requireAuth, upload.single("avatar"), ctrl.uploadAvatar);
router.get("/:id",                 ctrl.getArtist);
router.get("/:id/songs",           ctrl.getArtistSongs);
router.post("/:id/follow",         requireAuth, ctrl.toggleFollow);
router.get("/:id/following",       requireAuth, ctrl.isFollowing);

module.exports = router;
