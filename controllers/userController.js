const pool = require('../config/database');

const UserController = {
    // Get all users with their roles
    getAllUsers: async (req, res) => {
        try {
            const [users] = await pool.execute(`
                SELECT 
                    u.user_id, 
                    u.username, 
                    u.email, 
                    u.role,
                    u.created_at,
                    s.specialization,
                    (SELECT COUNT(*) FROM Operations WHERE scheduler_id = u.user_id) as scheduled_operations_count
                FROM Users u
                LEFT JOIN Staff s ON u.user_id = s.user_id
                ORDER BY 
                    FIELD(u.role, 'Admin', 'Scheduler', 'Staff'),
                    u.username
            `);
            
            res.json({
                success: true,
                data: users,
                count: users.length
            });
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch users' 
            });
        }
    },

    // Get user by ID
    getUserById: async (req, res) => {
        const { user_id } = req.params;
        
        try {
            const [users] = await pool.execute(`
                SELECT 
                    u.user_id, 
                    u.username, 
                    u.email, 
                    u.role,
                    u.created_at,
                    s.specialization
                FROM Users u
                LEFT JOIN Staff s ON u.user_id = s.user_id
                WHERE u.user_id = ?
            `, [user_id]);

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                data: users[0]
            });
        } catch (error) {
            console.error('Error fetching user:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch user' 
            });
        }
    },

    // Update user role
        // Update user role
    updateUserRole: async (req, res) => {
        const { user_id } = req.params;
        const { role, specialization } = req.body;
        
        try {
            // Check if user exists
            const [users] = await pool.execute(
                'SELECT user_id, username, role FROM Users WHERE user_id = ?',
                [user_id]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = users[0];

            // Validate role
            if (!['Admin', 'Scheduler', 'Staff'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: 'Role must be Admin, Scheduler, or Staff'
                });
            }

            // Start transaction
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // Update user role
                await connection.execute(
                    'UPDATE Users SET role = ? WHERE user_id = ?',
                    [role, user_id]
                );

                // Handle Staff specialization
                if (role === 'Staff') {
                    if (specialization) {
                        // Check if staff record exists
                        const [existingStaff] = await connection.execute(
                            'SELECT staff_id FROM Staff WHERE user_id = ?',
                            [user_id]
                        );

                        if (existingStaff.length > 0) {
                            // Update existing staff
                            await connection.execute(
                                'UPDATE Staff SET specialization = ? WHERE user_id = ?',
                                [specialization, user_id]
                            );
                        } else {
                            // Insert new staff
                            await connection.execute(
                                'INSERT INTO Staff (user_id, specialization) VALUES (?, ?)',
                                [user_id, specialization]
                            );
                        }
                    }
                } else {
                    // If changing FROM Staff role, don't delete from Staff table
                    // Just leave the record there to maintain foreign key integrity
                    // The application logic will handle filtering based on Users.role
                    console.log(`User ${user_id} role changed from Staff to ${role}, Staff record preserved`);
                }

                await connection.commit();

                // Get updated user
                const [updatedUser] = await pool.execute(`
                    SELECT 
                        u.user_id, 
                        u.username, 
                        u.email, 
                        u.role,
                        u.created_at,
                        s.specialization
                    FROM Users u
                    LEFT JOIN Staff s ON u.user_id = s.user_id
                    WHERE u.user_id = ?
                `, [user_id]);

                res.json({
                    success: true,
                    message: `User role updated to ${role} successfully`,
                    data: updatedUser[0]
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            console.error('Error updating user role:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update user role: ' + error.message 
            });
        }
    },

    // Delete user (Admin only)
        // Delete user (Admin only)
    // HARD DELETE user (remove completely from database)
    deleteUser: async (req, res) => {
        const { user_id } = req.params;
        
        try {
            // Check if user exists
            const [users] = await pool.execute(
                'SELECT user_id, username FROM Users WHERE user_id = ?',
                [user_id]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const user = users[0];

            // Prevent self-deletion
            if (user.user_id === req.user.user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot delete your own account'
                });
            }

            // Start transaction
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // First, check if user has any scheduled future operations as scheduler
                const [futureOps] = await connection.execute(
                    `SELECT COUNT(*) as count FROM Operations 
                     WHERE scheduler_id = ? AND status = 'Scheduled' 
                     AND scheduled_date >= CURDATE()`,
                    [user_id]
                );

                if (futureOps[0].count > 0) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        error: 'Cannot delete user who has scheduled future operations. Reassign operations first.'
                    });
                }

                // Delete user - let the database handle constraints or set NULL
                // This will work if foreign keys are set to CASCADE or SET NULL
                await connection.execute(
                    'DELETE FROM Users WHERE user_id = ?',
                    [user_id]
                );

                await connection.commit();

                res.json({
                    success: true,
                    message: `User "${user.username}" permanently deleted from database`
                });

            } catch (error) {
                await connection.rollback();
                
                if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                    return res.status(400).json({
                        success: false,
                        error: 'Cannot delete user with existing related records. Consider deactivating instead.'
                    });
                }
                
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete user: ' + error.message 
            });
        }
    },
};

module.exports = UserController;