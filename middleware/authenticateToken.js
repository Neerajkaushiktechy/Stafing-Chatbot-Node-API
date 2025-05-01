const jwt = require('jsonwebtoken');
require('dotenv').config();
// Middleware to check the token in cookies
const authenticateToken = (req, res) => {
    const token = req.cookies.auth_token;  // Read token from cookie
    console.log("TOKEN",token)
    if (!token) {
      return res.json({ message: 'No token, authorization denied',status: 404, loggedIn:false });
    }
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return res.json({ message: 'Token is valid',status:200,loggedIn:true });
    } catch (err) {
      return res.json({ message: 'Token is invalid or expired',status:500, loggedIn:false });
    }
};

module.exports = authenticateToken;
