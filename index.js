const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Port
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // serve uploads

// Request logging
app.use((req, res, next) => {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${req.method} ${req.url}`);
  next();
});

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Socket.io connection
io.on('connection', (socket) => {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] New client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] Client disconnected: ${socket.id}`);
  });
});

// Routes
const authRoutes = require('./routes/authRoutes');
const questionRoutes = require('./routes/questionRoutes');
const expertRoutes = require('./routes/expertRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const contentRoutes = require('./routes/contentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/question', questionRoutes);
app.use('/api/expert', expertRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/content', contentRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Whisper API is running...');
});

// Sequelize setup
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: console.log,
    dialectOptions: {
      ssl: {
        rejectUnauthorized: false, // required for Railway
      },
    },
  }
);

// Start server
const startServer = async () => {
  try {
    console.log("Connecting to database...");
    await sequelize.authenticate();
    console.log("Database connected successfully.");

    // Sync models
    await sequelize.sync();
    console.log("Models synced.");

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server accessible at: ${process.env.APP_URL}`);
      console.log(`Local access: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("Unable to connect to the database:", error);
  }
};

startServer();
