const pool = require('../config/database');

// Import Socket Service
const SocketService = require('../services/socketService');

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

    // ✅ TASK 1: Add new OT room WITH REAL-TIME UPDATES
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

            const roomData = newRoom[0];

            // ✅ REAL-TIME UPDATE: Notify all connected clients
            if (req.app.get('io')) {
                const io = req.app.get('io');
                const socketService = new SocketService(io);
                socketService.notifyRoomUpdate('added', roomData);
            }

            res.status(201).json({
                success: true,
                message: 'OT Room added successfully',
                data: roomData
            });
        } catch (error) {
            console.error('Error adding OT room:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to add OT room' 
            });
        }
    },

    // ✅ TASK 2: Delete OT room WITH REAL-TIME UPDATES
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

            // ✅ REAL-TIME UPDATE: Notify all connected clients
            if (req.app.get('io')) {
                const io = req.app.get('io');
                const socketService = new SocketService(io);
                socketService.notifyRoomUpdate('deleted', room);
            }

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

    // ✅ NEW: Toggle OT room active status WITH REAL-TIME UPDATES
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

            // Get updated room data
            const [updatedRoom] = await pool.execute(
                'SELECT * FROM OT_Rooms WHERE room_id = ?',
                [room_id]
            );

            const updatedRoomData = updatedRoom[0];
            const action = newStatus ? 'activated' : 'deactivated';

            // ✅ REAL-TIME UPDATE: Notify all connected clients
            if (req.app.get('io')) {
                const io = req.app.get('io');
                const socketService = new SocketService(io);
                socketService.notifyRoomUpdate('updated', updatedRoomData);
            }
            
            res.json({
                success: true,
                message: `OT Room "${room.room_name}" ${action} successfully`,
                data: updatedRoomData
            });
        } catch (error) {
            console.error('Error toggling OT room status:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to toggle OT room status' 
            });
        }
    },
    
    // ✅ TASK 3: Edit existing OT room details WITH REAL-TIME UPDATES
    updateOTRoom: async (req, res) => {
        const { room_id } = req.params;
        const { room_name, is_active } = req.body;
        
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

            const currentRoom = rooms[0];

            // Check if new room name conflicts with other rooms (if room_name is being changed)
            if (room_name && room_name !== currentRoom.room_name) {
                const [conflictingRooms] = await pool.execute(
                    'SELECT room_id FROM OT_Rooms WHERE room_name = ? AND room_id != ?',
                    [room_name, room_id]
                );

                if (conflictingRooms.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Room name already exists'
                    });
                }
            }

            // Use the stored procedure to update room
            await pool.execute(
                'CALL AddOrUpdateOTRoom(?, ?, ?)',
                [room_id, room_name, is_active]
            );

            // Get updated room
            const [updatedRoom] = await pool.execute(
                'SELECT * FROM OT_Rooms WHERE room_id = ?',
                [room_id]
            );

            const updatedRoomData = updatedRoom[0];

            // ✅ REAL-TIME UPDATE: Notify all connected clients
            if (req.app.get('io')) {
                const io = req.app.get('io');
                const socketService = new SocketService(io);
                socketService.notifyRoomUpdate('updated', updatedRoomData);
            }

            res.json({
                success: true,
                message: 'OT Room updated successfully',
                data: updatedRoomData
            });
        } catch (error) {
            console.error('Error updating OT room:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update OT room' 
            });
        }
    },
};

module.exports = OTController;