const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

// Load environment variables
dotenv.config();

// Centralized DB models (Sequelize) — use the same instance routes use
const { sequelize } = require('./models');

// Admin seeder (runs on startup; non-fatal)
const { seedAdmin } = require('./scripts/seedAdmin');

// Global process-level error logging (prevent silent crashes)
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const app = express();
const server = http.createServer(app);

// ======================
// PORT (Railway Required)
// ======================
const PORT = process.env.PORT || 5000;

// ======================
// Socket.io Setup
// ======================
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ======================
// Middleware
// ======================
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Request logging
app.use((req, res, next) => {
  const time = new Date().toISOString();
  console.log(`[${time}] ${req.method} ${req.url}`);
  next();
});

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ======================
// Routes
// ======================
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

// Root route (VERY IMPORTANT for Railway testing)
app.get('/', (req, res) => {
  res.status(200).send('Whisper API is running...');
});

// ======================
// Global error-handling middleware
// ======================
// This must be after all routes to catch route errors.
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ message: 'Internal server error' });
});

// ======================
// Socket Connection
// ======================
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ======================
// Centralized Startup (Railway Safe)
// Flow:
// 1. Start HTTP server (keeps container alive)
// 2. Connect database
// 3. Sync models
// 4. Run admin seed (non-fatal)
// ======================
async function startServer() {
  console.log('🚀 Starting Whisper backend server...');

  server.on('error', (err) => {
    console.error('[HTTP server error]', err);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ HTTP server listening on 0.0.0.0:${PORT}`);

    (async () => {
      // Step 2: DB authenticate
      try {
        console.log('⏳ Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connection established.');
      } catch (err) {
        console.error('❌ Database connection failed (server will stay running):', err);
      }

      // Step 3: Sync models
      try {
        console.log('⏳ Syncing database models...');
        await sequelize.sync();
        console.log('✅ Database models synced.');
      } catch (err) {
        console.error('❌ Model sync failed (server will stay running):', err);
      }

      // Step 4: Admin seed (non-fatal)
      try {
        console.log('⏳ Running admin seed...');
        const result = await seedAdmin();
        console.log('✅ Admin seed result:', result);
      } catch (err) {
        console.error('❌ Admin seed failed (server will stay running):', err);
      }

      console.log('✅ Startup sequence completed.');
    })();
  });
}

// Kick off startup
startServer();
