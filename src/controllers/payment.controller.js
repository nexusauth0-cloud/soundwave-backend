const axios = require("axios");
const db = require("../db");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const PLANS = {
  pro:    { amount: 150000, name: "Pro",    plan: "pro" },
  proplus:{ amount: 450000, name: "Pro+",   plan: "proplus" },
  family: { amount: 750000, name: "Family", plan: "family" },
};

async function initializePayment(req, res) {
  try {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Invalid plan" });

    const { rows } = await db.query(`SELECT email FROM users WHERE id=$1`, [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: rows[0].email,
        amount: plan.amount,
        currency: "NGN",
        metadata: {
          user_id: req.user.id,
          plan: plan.plan,
          plan_name: plan.name,
        },
        callback_url: `${FRONTEND_URL}/payment/verify`,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    res.json({
      authorizationUrl: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (err) {
    console.error("Payment init error:", err.message);
    res.status(500).json({ error: "Payment initialization failed" });
  }
}

async function verifyPayment(req, res) {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ error: "Reference required" });

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const data = response.data.data;

    if (data.status !== "success") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    const { user_id, plan } = data.metadata;

    await db.query(
      `UPDATE users SET plan=$1, updated_at=NOW() WHERE id=$2`,
      [plan, user_id]
    );

    await db.query(
      `INSERT INTO auth_events (user_id, event_type, metadata)
       VALUES ($1, 'subscription', $2)`,
      [user_id, { plan, reference, amount: data.amount }]
    );

    res.json({ success: true, plan });
  } catch (err) {
    console.error("Verify error:", err.message);
    res.status(500).json({ error: "Verification failed" });
  }
}

async function getMyPlan(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT plan FROM users WHERE id=$1`, [req.user.id]
    );
    res.json({ plan: rows[0]?.plan || "free" });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

module.exports = { initializePayment, verifyPayment, getMyPlan };
