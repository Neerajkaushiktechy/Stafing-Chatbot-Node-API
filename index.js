const express = require('express');
const bodyParser = require('body-parser');
const nurseRoutes = require('./routes/nurseRoutes.js');
const aiRoutes = require('./routes/airoutes.js');
const app = express();
const port = process.env.PORT || 3000;
require('dotenv').config();
// Middleware
app.use(bodyParser.json());

app.use('/api', nurseRoutes);
app.use('/api',aiRoutes);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
