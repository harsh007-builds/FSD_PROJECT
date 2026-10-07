const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode ? (res.statusCode === 200 ? 500 : res.statusCode) : 500;
  
  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message).join(', ');
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: message,
    });
  }

  // Handle Mongoose bad ObjectId (fallback if it slips past validateObjectId middleware)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({ 
      success: false, 
      message: 'Resource not found or invalid ID format',
      error: 'CastError'
    });
  }

  let displayMessage = err.message || 'Internal Server Error';

  // Mask internal database and SSL connection errors
  if (
    displayMessage.includes('ssl3_read_bytes') || 
    displayMessage.includes('ENOTFOUND') ||
    displayMessage.includes('ECONNREFUSED') ||
    displayMessage.includes('buffering timed out') ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerError'
  ) {
    displayMessage = 'Database connection error. Please ensure your IP is whitelisted in MongoDB Atlas or check your network connection.';
  }

  res.status(statusCode).json({
    success: false,
    message: displayMessage,
    error: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

module.exports = { errorHandler, notFound };
