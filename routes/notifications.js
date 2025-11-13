const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// ✅ Get staff notifications - Staff, Scheduler, Admin can access
router.get('/', authorizeRoles('Admin', 'Scheduler', 'Staff'), NotificationController.getStaffNotifications);

// ✅ Mark notification as read
router.put('/:id/read', authorizeRoles('Admin', 'Scheduler', 'Staff'), NotificationController.markAsRead);

// ✅ Mark all notifications as read
router.put('/read-all', authorizeRoles('Admin', 'Scheduler', 'Staff'), NotificationController.markAllAsRead);

// ✅ Get unread count
router.get('/unread-count', authorizeRoles('Admin', 'Scheduler', 'Staff'), NotificationController.getUnreadCount);

module.exports = router;