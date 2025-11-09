const pool = require('../config/database');

const OTController = {
    // Get all OT rooms
    getAllOTRooms: async (req, res) => {
        try {
            const [rooms] = await pool.execute(
                'SELECT * FROM OT_Rooms ORDER BY is_active DESC, room_name'
            );
            
            res.json({
                success: true,
                data: rooms,
                count: rooms.length
            });
        } catch (error) {
            console.error('Error fetching OT rooms:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch OT rooms' 
            });
        }
    },

    // Get active OT rooms only
    getActiveOTRooms: async (req, res) => {
        try {
            const [rooms] = await pool.execute(
                'SELECT room_id, room_name FROM OT_Rooms WHERE is_active = TRUE ORDER BY room_name'
            );
            
            res.json({
                success: true,
                data: rooms,
                count: rooms.length
            });
        } catch (error) {
            console.error('Error fetching active OT rooms:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch active OT rooms' 
            });
        }
    },

    // ✅ TASK 1: Add new OT room
    addOTRoom: async (req, res) => {
        const { room_name, is_active = true } = req.body;
        
        try {
            // Check if room name already exists
            const [existingRooms] = await pool.execute(
                'SELECT room_id FROM OT_Rooms WHERE room_name = ?',
                [room_name]
            );

            if (existingRooms.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Room name already exists'
                });
            }

            // Use the stored procedure to add room
            await pool.execute(
                'CALL AddOrUpdateOTRoom(?, ?, ?)',
                [null, room_name, is_active]
            );

            // Get the newly added room
            const [newRoom] = await pool.execute(
                'SELECT * FROM OT_Rooms WHERE room_name = ?',
                [room_name]
            );

            res.status(201).json({
                success: true,
                message: 'OT Room added successfully',
                data: newRoom[0]
            });
        } catch (error) {
            console.error('Error adding OT room:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to add OT room' 
            });
        }
    },

    // ✅ TASK 2: Delete OT room (HARD DELETE)
    deleteOTRoom: async (req, res) => {
        const { room_id } = req.params;
        
        try {
            // Check if room exists
            const [rooms] = await pool.execute(
                'SELECT room_id, room_name FROM OT_Rooms WHERE room_id = ?',
                [room_id]
            );

            if (rooms.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'OT Room not found'
                });
            }

            const room = rooms[0];

            // Check for scheduled future operations
            const [futureOperations] = await pool.execute(
                `SELECT COUNT(*) as operation_count FROM Operations 
                 WHERE room_id = ? AND status = 'Scheduled' 
                 AND scheduled_date >= CURDATE()`,
                [room_id]
            );

            if (futureOperations[0].operation_count > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete room with scheduled future operations'
                });
            }

            // HARD DELETE - Remove from database completely
            await pool.execute(
                'DELETE FROM OT_Rooms WHERE room_id = ?',
                [room_id]
            );

            res.json({
                success: true,
                message: `OT Room "${room.room_name}" permanently deleted from database`
            });
        } catch (error) {
            console.error('Error deleting OT room:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete OT room' 
            });
        }
    },

    // Get OT room by ID
    getOTRoomById: async (req, res) => {
        const { room_id } = req.params;
        
        try {
            const [rooms] = await pool.execute(
                'SELECT * FROM OT_Rooms WHERE room_id = ?',
                [room_id]
            );

            if (rooms.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'OT Room not found'
                });
            }

            res.json({
                success: true,
                data: rooms[0]
            });
        } catch (error) {
            console.error('Error fetching OT room:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch OT room' 
            });
        }
    },

    // ✅ NEW: Toggle OT room active status
    toggleOTRoomStatus: async (req, res) => {
        const { room_id } = req.params;
        
        try {
            // Check if room exists
            const [rooms] = await pool.execute(
                'SELECT room_id, room_name, is_active FROM OT_Rooms WHERE room_id = ?',
                [room_id]
            );

            if (rooms.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'OT Room not found'
                });
            }

            const room = rooms[0];
            const newStatus = !room.is_active; // Toggle: true→false, false→true

            // Update using stored procedure
            await pool.execute(
                'CALL AddOrUpdateOTRoom(?, ?, ?)',
                [room_id, room.room_name, newStatus]
            );

            const action = newStatus ? 'activated' : 'deactivated';
            
            res.json({
                success: true,
                message: `OT Room "${room.room_name}" ${action} successfully`,
                data: {
                    room_id: parseInt(room_id),
                    room_name: room.room_name,
                    is_active: newStatus
                }
            });
        } catch (error) {
            console.error('Error toggling OT room status:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to toggle OT room status' 
            });
        }
    }
};

module.exports = OTController;