require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");
const { passport } = require("./config/passport");
const authRoutes = require("./routes/auth.routes");
const musicRoutes = require("./routes/music.routes");
const paymentRoutes = require("./routes/payment.routes");
const artistRoutes = require("./routes/artist.routes");

const app = express();
const PORT = process.env.PORT || 4000;

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","Range"],
  exposedHeaders: ["Content-Range","Accept-Ranges","Content-Length"],
}));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

app.use("/auth", authRoutes);
app.use("/music", musicRoutes);
app.use("/payment", paymentRoutes);
app.use("/artists", artistRoutes);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "NexusAuth", version: "1.0.0", timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(PORT, () => {
  console.log(`◈ NexusAuth running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
});

// Keep alive for Render free tier
if (process.env.NODE_ENV === "production" && process.env.BACKEND_URL) {
  setInterval(() => {
    const https = require("https");
    https.get(`${process.env.BACKEND_URL}/health`, () => {
      console.log("Keep alive ping sent");
    }).on("error", () => {});
  }, 14 * 60 * 1000);
}

module.exports = app;
