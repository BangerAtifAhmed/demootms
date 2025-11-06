const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { validateLogin } = require('../middleware/validation');

// Only login endpoint
router.post('/login', validateLogin, AuthController.login);

module.exports = router;