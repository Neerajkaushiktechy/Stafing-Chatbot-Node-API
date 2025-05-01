const express = require('express');
const bodyParser = require('body-parser');
const nurseRoutes = require('./routes/nurseRoutes.js');
const aiRoutes = require('./routes/airoutes.js');
const adminRoutes = require('./routes/adminRoute.js')
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const port = process.env.PORT || 3000;
// Middleware
app.use(cookieParser())
app.use(express.json());

const corsOptions = {
  origin: 'http://localhost:5173',  // The origin of your frontend (React app)
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true
};

// Enable CORS with the specified options
app.use(cors(corsOptions));


app.use('/api', nurseRoutes);
app.use('/api',aiRoutes);
app.use('/api/admin',adminRoutes)

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
