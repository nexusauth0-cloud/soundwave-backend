const router = require("express").Router();
const { requireAuth } = require("../middleware/auth");
const ctrl = require("../controllers/payment.controller");

router.post("/initialize", requireAuth, ctrl.initializePayment);
router.get("/verify", requireAuth, ctrl.verifyPayment);
router.get("/my-plan", requireAuth, ctrl.getMyPlan);

module.exports = router;
