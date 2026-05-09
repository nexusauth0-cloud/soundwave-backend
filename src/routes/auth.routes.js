const router = require("express").Router();
const passport = require("passport");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const ctrl = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth");
const { oauthSuccess } = require("../config/passport");

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

const magicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 3,
  message: { error: "Too many magic link requests. Wait 1 minute." },
});

// ── Validation helpers ────────────────────────────────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
}

const emailRule    = body("email").isEmail().normalizeEmail();
const passwordRule = body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters");

// ── Email / Password ──────────────────────────────────────────────────────────
router.post("/register",
  authLimiter,
  [emailRule, passwordRule, body("displayName").optional().trim().isLength({ max: 80 })],
  validate,
  ctrl.register
);

router.post("/login",
  authLimiter,
  [emailRule, body("password").notEmpty()],
  validate,
  ctrl.login
);

router.post("/refresh", ctrl.refresh);

router.post("/logout", requireAuth, ctrl.logout);

// ── Email verification ─────────────────────────────────────────────────────────
router.get("/verify-email", ctrl.verifyEmail);

// ── Magic link ─────────────────────────────────────────────────────────────────
router.post("/magic-link",
  magicLimiter,
  [emailRule],
  validate,
  ctrl.requestMagicLink
);

router.get("/magic", ctrl.verifyMagicLink);

// ── Password reset ─────────────────────────────────────────────────────────────
router.post("/forgot-password",
  authLimiter,
  [emailRule],
  validate,
  ctrl.forgotPassword
);

router.post("/reset-password",
  authLimiter,
  [
    body("token").notEmpty(),
    passwordRule,
  ],
  validate,
  ctrl.resetPassword
);

// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get("/google",
  passport.authenticate("google", { session: false })
);

router.get("/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/auth/login?error=google_failed" }),
  oauthSuccess
);

// ── GitHub OAuth ──────────────────────────────────────────────────────────────
router.get("/github",
  passport.authenticate("github", { session: false })
);

router.get("/github/callback",
  passport.authenticate("github", { session: false, failureRedirect: "/auth/login?error=github_failed" }),
  oauthSuccess
);

// ── Current user ──────────────────────────────────────────────────────────────
router.get("/me", requireAuth, ctrl.me);
router.post("/resend-verification", ctrl.resendVerification);

module.exports = router;
