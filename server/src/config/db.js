const mongoose = require('mongoose');

let isConnecting = false;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1 || isConnecting) {
    return;
  }

  isConnecting = true;
  let uri = process.env.MONGODB_URI || '';

  // Ensure default database name if missing before query parameters
  if (uri && !uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/[^?]+/)) {
    uri = uri.replace(/\/?(\?.*)?$/, '/studysync$1');
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    isConnecting = false;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.warn('Backend is running, but database is disconnected. Retrying in 10s...');
    isConnecting = false;

    // Retry connection automatically
    setTimeout(connectDB, 10000);
  }
};

module.exports = connectDB;
