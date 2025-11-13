const pool = require('../config/database');

const NotificationController = {
    // ✅ Get all notifications for staff member
    getStaffNotifications: async (req, res) => {
        try {
            console.log('User object in notifications:', req.user);
            
            const user_id = req.user.user_id; // From JWT token
            
            // Get staff_id from user_id using staff table
            const [staff] = await pool.execute(
                'SELECT staff_id FROM staff WHERE user_id = ?',
                [user_id]
            );
            
            if (staff.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'User is not registered as staff'
                });
            }
            
            const staff_id = staff[0].staff_id;
            
            console.log(`Fetching notifications for staff_id: ${staff_id} (user_id: ${user_id})`);

            const [notifications] = await pool.execute(`
                SELECT 
                    n.notification_id,
                    n.operation_id,
                    n.notification_text,
                    DATE_FORMAT(n.notification_time, '%Y-%m-%d %H:%i:%s') as notification_time,
                    n.is_read,
                    o.operation_name,
                    o.scheduled_date,
                    DATE_FORMAT(o.scheduled_start, '%Y-%m-%d %H:%i:%s') as scheduled_start,
                    o.status as operation_status
                FROM staff_notifications n
                INNER JOIN operations o ON n.operation_id = o.operation_id
                WHERE n.staff_id = ?
                ORDER BY n.notification_time DESC
                LIMIT 50
            `, [staff_id]);

            res.json({
                success: true,
                data: {
                    staff_id: staff_id,
                    user_id: user_id,
                    notifications: notifications,
                    total_count: notifications.length
                }
            });

        } catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch notifications: ' + error.message 
            });
        }
    },

    // ✅ Mark notification as read
    markAsRead: async (req, res) => {
        try {
            const { id } = req.params;
            const user_id = req.user.user_id;
            
            // Get staff_id from user_id
            const [staff] = await pool.execute(
                'SELECT staff_id FROM staff WHERE user_id = ?',
                [user_id]
            );
            
            if (staff.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'User is not registered as staff'
                });
            }
            
            const staff_id = staff[0].staff_id;

            const [result] = await pool.execute(
                'UPDATE staff_notifications SET is_read = 1 WHERE notification_id = ? AND staff_id = ?',
                [id, staff_id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Notification not found or access denied'
                });
            }

            res.json({
                success: true,
                message: 'Notification marked as read'
            });

        } catch (error) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to mark notification as read: ' + error.message 
            });
        }
    },

    // ✅ Mark all notifications as read
    markAllAsRead: async (req, res) => {
        try {
            const user_id = req.user.user_id;
            
            // Get staff_id from user_id
            const [staff] = await pool.execute(
                'SELECT staff_id FROM staff WHERE user_id = ?',
                [user_id]
            );
            
            if (staff.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'User is not registered as staff'
                });
            }
            
            const staff_id = staff[0].staff_id;

            const [result] = await pool.execute(
                'UPDATE staff_notifications SET is_read = 1 WHERE staff_id = ? AND is_read = 0',
                [staff_id]
            );

            res.json({
                success: true,
                message: `Marked ${result.affectedRows} notifications as read`,
                staff_id: staff_id
            });

        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to mark all notifications as read: ' + error.message 
            });
        }
    },

    // ✅ Get unread notifications count
    getUnreadCount: async (req, res) => {
        try {
            const user_id = req.user.user_id;
            
            // Get staff_id from user_id
            const [staff] = await pool.execute(
                'SELECT staff_id FROM staff WHERE user_id = ?',
                [user_id]
            );
            
            if (staff.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'User is not registered as staff'
                });
            }
            
            const staff_id = staff[0].staff_id;

            const [result] = await pool.execute(
                'SELECT COUNT(*) as unread_count FROM staff_notifications WHERE staff_id = ? AND is_read = 0',
                [staff_id]
            );

            res.json({
                success: true,
                data: {
                    unread_count: result[0].unread_count,
                    staff_id: staff_id,
                    user_id: user_id
                }
            });

        } catch (error) {
            console.error('Error fetching unread count:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch unread count: ' + error.message 
            });
        }
    }
};

module.exports = NotificationController;