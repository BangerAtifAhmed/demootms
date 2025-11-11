const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// ✅ Log user activity
const logUserActivity = async (user_id, action) => {
    try {
        await pool.execute(
            'INSERT INTO user_logs (user_id, action, action_time) VALUES (?, ?, NOW())',
            [user_id, action]
        );
        console.log(`✅ Logged ${action} for user: ${user_id}`);
    } catch (error) {
        console.error('Error logging user activity:', error);
    }
};

const AuthController = {
    login: async (req, res) => {
        const { username, email, password } = req.body;
        
        try {
            console.log('🔐 Login attempt:', username || email);
            
            // Check if using username or email
            if ((!username && !email) || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Username or email and password are required'
                });
            }

            let query, queryParams;
            
            // Determine if login is by username or email
            if (username) {
                query = `SELECT user_id, username, email, password_hash, role 
                         FROM Users WHERE username = ? AND password_hash = ?`;
                queryParams = [username, password];
            } else {
                query = `SELECT user_id, username, email, password_hash, role 
                         FROM Users WHERE email = ? AND password_hash = ?`;
                queryParams = [email, password];
            }

            // Find user with direct password comparison
            const [users] = await pool.execute(query, queryParams);

            if (users.length === 0) {
                console.log('❌ Login failed for:', username || email);
                return res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
            }

            const user = users[0];
            console.log('✅ Login successful for:', user.username);

            // ✅ LOG SUCCESSFUL LOGIN
            await logUserActivity(user.user_id, 'Login');

            // Generate JWT token - Use the SAME structure as your existing tokens
            const token = jwt.sign(
                { 
                    userId: user.user_id,  // ✅ Keep as userId (your existing structure)
                    username: user.username,
                    role: user.role 
                },
                process.env.JWT_SECRET || 'otms-secret-key-2024',
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    token: token,
                    user: {
                        user_id: user.user_id,
                        username: user.username,
                        email: user.email,
                        role: user.role
                    }
                }
            });

        } catch (error) {
            console.error('💥 Login error:', error);
            res.status(500).json({
                success: false,
                error: 'Login failed'
            });
        }
    },

    // ✅ Fixed logout endpoint - Use userId from existing tokens
    // ✅ Fixed logout endpoint - Use user_id from token
logout: async (req, res) => {
    try {
        console.log('🔐 Logout called - User object:', req.user);
        
        // Get user_id from JWT token - use user_id (your actual token structure)
        const user_id = req.user.user_id;
        
        if (!user_id) {
            console.log('❌ No user_id found in token. Available properties:', Object.keys(req.user));
            return res.status(400).json({
                success: false,
                error: 'User ID not found in token'
            });
        }

        console.log('✅ Logging out user:', user_id);

        // ✅ LOG LOGOUT
        await logUserActivity(user_id, 'Logout');

        res.json({
            success: true,
            message: 'Logout successful - Log recorded',
            user_id: user_id
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed: ' + error.message
        });
    }
},
};

module.exports = AuthController;