const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }
    next();
};

// OT Room validation
const validateOTRoom = [
    body('room_name')
        .notEmpty()
        .withMessage('Room name is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Room name must be between 1-100 characters')
        .trim(),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean value'),
    handleValidationErrors
];

// UPDATED: Login validation for username OR email
const validateLogin = [
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    // Custom validation - either username OR email is required
    (req, res, next) => {
        const { username, email } = req.body;
        if (!username && !email) {
            return res.status(400).json({
                success: false,
                errors: [{
                    type: 'field',
                    msg: 'Either username or email is required',
                    path: 'username',
                    location: 'body'
                }]
            });
        }
        next();
    },
    handleValidationErrors
];

module.exports = {
    validateOTRoom,
    validateLogin,
    handleValidationErrors
};