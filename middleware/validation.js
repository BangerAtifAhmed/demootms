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

// Only login validation needed
const validateLogin = [
    body('username')
        .notEmpty()
        .withMessage('Username is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    handleValidationErrors
];

module.exports = {
    validateOTRoom,
    validateLogin,
    handleValidationErrors
};