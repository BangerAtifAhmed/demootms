const pool = require('../config/database');

const LogController = {
    // ✅ Get user activity logs (Admin only)
    getUserLogs: async (req, res) => {
        try {
            const { user_id, action, start_date, end_date, page = 1, limit = 50 } = req.query;
            const offset = (page - 1) * limit;

            let query = `
                SELECT 
                    l.log_id,
                    l.user_id,
                    l.action,
                    DATE_FORMAT(l.action_time, '%Y-%m-%d %H:%i:%s') as action_time,
                    u.username,
                    u.email,
                    u.role
                FROM user_logs l
                JOIN users u ON l.user_id = u.user_id
                WHERE 1=1
            `;

            const params = [];

            if (user_id) {
                query += ' AND l.user_id = ?';
                params.push(user_id);
            }

            if (action) {
                query += ' AND l.action = ?';
                params.push(action);
            }

            if (start_date) {
                query += ' AND DATE(l.action_time) >= ?';
                params.push(start_date);
            }

            if (end_date) {
                query += ' AND DATE(l.action_time) <= ?';
                params.push(end_date);
            }

            query += ' ORDER BY l.action_time DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), offset);

            const [logs] = await pool.execute(query, params);

            res.json({
                success: true,
                data: {
                    logs: logs,
                    total_count: logs.length
                }
            });

        } catch (error) {
            console.error('Error fetching user logs:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch user logs: ' + error.message 
            });
        }
    }
};

module.exports = LogController;