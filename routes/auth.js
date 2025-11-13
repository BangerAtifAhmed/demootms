const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// ✅ Public routes
router.post('/login', validateLogin, AuthController.login);

// ✅ Protected routes
router.post('/logout', authenticateToken, AuthController.logout);

// Debug current token
router.get('/debug-current', authenticateToken, (req, res) => {
    console.log('Current user object:', req.user);
    res.json({ user: req.user });
});

module.exports = router;