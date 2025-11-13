const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const otRoomRoutes = require('./routes/otRooms');
const userRoutes = require('./routes/users');
const operationRoutes = require('./routes/operation');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ WebSocket Connection Handling
io.on('connection', (socket) => {
    console.log('🔗 New client connected:', socket.id);

    // Join room-specific channel
    socket.on('join-rooms', () => {
        socket.join('room-updates');
        console.log(`Client ${socket.id} joined room-updates`);
    });

    // Join operation-specific channel
    socket.on('join-operations', () => {
        socket.join('operation-updates');
        console.log(`Client ${socket.id} joined operation-updates`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ot-rooms', otRoomRoutes);
app.use('/api/users', userRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'OTMS Backend with Real-time Updates',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error handling
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`✅ OTMS Server with WebSocket running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔌 WebSocket enabled on: http://localhost:${PORT}`);
});