const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware to check the token in cookies
const authenticateToken = (req, res, next) => {
    const token = req.cookies.auth_token; // Read token from cookie
    if (!token) {
        return res.json({ message: 'No token, authorization denied', status: 401 });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach decoded token data (e.g., user ID, email) to the request object
        next(); // Proceed to the next middleware or route handler
    } catch (err) {
        return res.json({ message: 'Token is invalid or expired', status: 403 });
    }
};

module.exports = authenticateToken;
