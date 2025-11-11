const express = require('express');
const router = express.Router();
const OperationController = require('../controllers/operationController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// ✅ API 1: Get available staff & equipment for specific date/time
router.get('/available-resources', authorizeRoles('Admin', 'Scheduler'), OperationController.getAvailableResources);

// ✅ API 2: Schedule operation with staff & equipment assignments
router.post('/', authorizeRoles('Admin', 'Scheduler'), OperationController.scheduleOperation);

// ✅ API 3: Get all operations with assignment counts
router.get('/', authorizeRoles('Admin', 'Scheduler'), OperationController.getAllOperations);


// Staff daily schedule route
router.get('/staff/daily-schedule', authorizeRoles('Admin', 'Scheduler', 'Staff'), OperationController.getStaffDailySchedule);

// In routes/operation.js
router.get('/weekly-assignments', authorizeRoles('Admin', 'Scheduler'), OperationController.getWeeklyAssignmentCounts);

module.exports = router;