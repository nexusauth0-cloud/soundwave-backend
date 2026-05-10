require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { passport } = require("./config/passport");
const authRoutes = require("./routes/auth.routes");
const musicRoutes = require("./routes/music.routes");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization","Range"], exposedHeaders: ["Content-Range","Accept-Ranges","Content-Length"] }));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());
app.use("/auth", authRoutes);
app.use("/music", musicRoutes);
const paymentRoutes = require("./routes/payment.routes");
app.use("/payment", paymentRoutes);
const artistRoutes = require("./routes/artist.routes");
app.use("/artists", artistRoutes);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.get("/health", (req, res) => res.json({ status: "ok", service: "NexusAuth" }));
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => res.status(500).json({ error: "Server error" }));

app.listen(PORT, () => console.log(`◈ NexusAuth running on port ${PORT}`));
module.exports = app;
