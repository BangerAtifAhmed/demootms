const express = require('express');
const router = express.Router();
const OTController = require('../controllers/otRoomController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateOTRoom } = require('../middleware/validation');

// All routes require authentication
router.use(authenticateToken);

// GET /api/ot-rooms - Get all OT rooms
router.get('/', OTController.getAllOTRooms);

// GET /api/ot-rooms/active - Get active OT rooms only
router.get('/active', OTController.getActiveOTRooms);

// GET /api/ot-rooms/:room_id - Get specific OT room
router.get('/:room_id', OTController.getOTRoomById);

// POST /api/ot-rooms - Add new OT room (Admin only) - TASK 1
router.post('/', authorizeRoles('Admin'), validateOTRoom, OTController.addOTRoom);

// PUT /api/ot-rooms/:room_id/toggle - Toggle room status (Admin only)
router.put('/:room_id/toggle', authorizeRoles('Admin'), OTController.toggleOTRoomStatus);

// DELETE /api/ot-rooms/:room_id - Delete OT room (Admin only) - TASK 2
router.delete('/:room_id', authorizeRoles('Admin'), OTController.deleteOTRoom);

module.exports = router;