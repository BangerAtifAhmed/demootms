otms-backend/
├── config/
│   └── database.js
├── controllers/
│   ├── authController.js
│   └── otRoomController.js    # Only Task 1 implemented
├── middleware/
│   ├── auth.js
│   └── validation.js          # ✅ Same for both phases
├── routes/
│   ├── auth.js
│   └── otRooms.js             # Only Task 1 endpoints
├── app.js
├── package.json
└── .env

![1762432418038](image/readme/1762432418038.png)

Client Request → Express App → Auth Middleware → OT Routes → OT Controller → Database → Response

Login → JWT Token Generation → Token Verification → Admin Role Check → OT Room Management

  "dependencies":{

    "express":"^4.18.2",

    "mysql2":"^3.6.0",

    "bcryptjs":"^2.4.3",

    "jsonwebtoken":"^9.0.2",

    "cors":"^2.8.5",

    "dotenv":"^16.3.1",

    "express-validator":"^7.0.1"

  }
