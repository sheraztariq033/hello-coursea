const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./db/connection');
const { router: apiRouter } = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and body parser
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Register API router
app.use('/api', apiRouter);

// Root route explicitly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Fallback to static frontend or default index (Express 5 named wildcard support)
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start application
async function start() {
  try {
    console.log('Initializing SQLite Database...');
    await initDatabase();
    console.log('SQLite Database Initialized.');

    app.listen(PORT, () => {
      console.log(`Receipt & Warranty Vault server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start Receipt Vault application', err);
    process.exit(1);
  }
}

start();
