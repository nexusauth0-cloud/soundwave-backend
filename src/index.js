require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
// ... import your other routes here ...

const app = express();

// --- CRITICAL FIX FOR RENDER PROXY ---
app.set("trust proxy", 1); 

app.use(cors());
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
// ... use your other routes here ...

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


// Keep alive ping every 14 minutes (prevents Render free tier sleep)
if (process.env.NODE_ENV === "production") {
  setInterval(() => {
    const https = require("https");
    https.get(`https://soundwave-backend-0yd7.onrender.com/health`, (res) => {
      console.log("Keep alive ping:", res.statusCode);
    }).on("error", () => {});
  }, 14 * 60 * 1000);
}
