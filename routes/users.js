const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All routes require Admin authentication
router.use(authenticateToken);
router.use(authorizeRoles('Admin'));

// GET /api/users - Get all users
router.get('/', UserController.getAllUsers);

// GET /api/users/:user_id - Get specific user
router.get('/:user_id', UserController.getUserById);

// PUT /api/users/:user_id/role - Update user role
router.put('/:user_id/role', UserController.updateUserRole);

// DELETE /api/users/:user_id - Delete user
router.delete('/:user_id', UserController.deleteUser);

module.exports = router;