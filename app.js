const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const otRoomRoutes = require('./routes/otRooms');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes - Only what's needed for Task 1
app.use('/api/auth', authRoutes);
app.use('/api/ot-rooms', otRoomRoutes);

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