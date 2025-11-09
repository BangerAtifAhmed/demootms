const jwt = require('jsonwebtoken');
const pool = require('../config/database');

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

            // Generate JWT token
            const token = jwt.sign(
                { 
                    userId: user.user_id, 
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
    }
};

module.exports = AuthController;