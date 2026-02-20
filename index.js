const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { sequelize } = require('./models');

dotenv.config();

const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for dev / API consumption
    methods: ["GET", "POST"]
  }
});

// Use the PORT from Railway or default 5000
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Request Logging Middleware
app.use((req, res, next) => {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${req.method} ${req.url}`);
  next();
});

// Make io accessible to routers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Socket.io Connection
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

// Basic Route
app.get('/', (req, res) => {
  res.send('Whisper API is running...');
});

// Database Connection and Server Start
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.');
    
    // Sync models (normal sync - use migration scripts for production schema changes)
    await sequelize.sync();

    // Listen on all network interfaces (0.0.0.0) for Railway container
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server accessible at: ${process.env.APP_URL}`);
      console.log(`Local access: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

startServer();
