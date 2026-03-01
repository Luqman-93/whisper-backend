// ======================
// Core Imports
// ======================
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

// ======================
// Load Environment Variables
// ======================
dotenv.config();

// ======================
// Database + Seeder
// ======================
const { sequelize } = require("./models");
const { seedAdmin } = require("./scripts/seedAdmin");

// ======================
// Global Process Error Logging
// ======================
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

// ======================
// App + Server Setup
// ======================
const app = express();
const server = http.createServer(app);

// ======================
// Railway Required PORT
// ======================
const PORT = process.env.PORT || 8080;

// ======================
// Socket.io Setup
// ======================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ======================
// Middleware
// ======================
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Make io accessible in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ======================
// Routes
// ======================
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/question", require("./routes/questionRoutes"));
app.use("/api/expert", require("./routes/expertRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/content", require("./routes/contentRoutes"));

// ======================
// Root Route (Railway Health Check)
// ======================
app.get("/", (req, res) => {
  res.status(200).send("Whisper backend server running");
});

// ======================
// Global Error Handler
// ======================
app.use((err, req, res, next) => {
  console.error("[Global Error Handler]", err);
  if (!res.headersSent) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// ======================
// Socket Connection
// ======================
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// ======================
// Start Server FIRST (Critical for Railway)
// ======================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Run heavy startup tasks in background
  setImmediate(async () => {
    try {
      console.log("⏳ Connecting to database...");
      await sequelize.authenticate();
      console.log("✅ Database connected.");

      console.log("⏳ Syncing models...");
      await sequelize.sync();
      console.log("✅ Models synced.");

      console.log("⏳ Seeding admin...");
      const result = await seedAdmin();
      console.log("✅ Admin seed result:", result);

      console.log("✅ Startup background tasks completed.");
    } catch (error) {
      console.error("❌ Startup background error:", error);
    }
  });
});