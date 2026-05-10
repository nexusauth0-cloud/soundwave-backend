const db = require("../db");

async function getAllUsers(req, res) {
  try {
    // Only allow admins to see this data
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    const { rows } = await db.query(
      `SELECT id, email, display_name, username, role, plan, is_verified, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    
    res.json({ count: rows.length, users: rows });
  } catch (err) {
    console.error("Admin Fetch Error:", err);
    res.status(500).json({ error: "Could not fetch users" });
  }
}

module.exports = { getAllUsers };

