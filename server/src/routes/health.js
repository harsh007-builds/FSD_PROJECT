const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

router.get('/health', async (req, res) => {
  let dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  // If disconnected, trigger an asynchronous reconnection attempt
  if (dbStatus !== 'connected') {
    connectDB().catch(() => {});
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

module.exports = router;
