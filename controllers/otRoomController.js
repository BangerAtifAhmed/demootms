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
    }
};

module.exports = OTController;