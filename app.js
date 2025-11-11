const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const otRoomRoutes = require('./routes/otRooms');
const userRoutes = require('./routes/users');
const operationRoutes = require('./routes/operation');
const notificationRoutes = require('./routes/notifications');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes - Only what's needed for Task 1
app.use('/api/auth', authRoutes);
app.use('/api/ot-rooms', otRoomRoutes);
app.use('/api/users', userRoutes);
app.use('/api/operations', operationRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'OTMS Backend - Phase 1 (Add OT Room)',
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

app.listen(PORT, () => {
    console.log(`✅ OTMS Phase 1 server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});