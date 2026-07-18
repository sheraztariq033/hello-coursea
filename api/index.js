const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('../src/db/connection');
const { router: apiRouter } = require('../src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and body parser
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serverless DB dynamic bootstrapping middleware
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      console.log('Serverless Auto-Bootstrapping Local Database Store...');
      await initDatabase();
      dbInitialized = true;
      console.log('Database Bootstrapping Complete.');
    } catch (err) {
      console.error('Failed to auto-bootstrap database in serverless context', err);
    }
  }
  next();
});

// Serve static assets from public folder (local fallback)
app.use(express.static(path.join(__dirname, '../public')));

// Register API router
app.use('/api', apiRouter);

// Fallback to static frontend index (immune to Express 5 / path-to-regexp syntax changes)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start standalone server only when NOT on Vercel serverless or running tests
async function startStandalone() {
  try {
    console.log('Initializing Standalone Database Connection...');
    await initDatabase();
    dbInitialized = true;
    app.listen(PORT, () => {
      console.log(`Receipt & Warranty Vault standalone running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start Receipt Vault standalone application', err);
    process.exit(1);
  }
}

if (!process.env.VERCEL) {
  startStandalone();
}

// Export app for serverless binding
module.exports = app;
