const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25) * 1024 * 1024; // 25 MB default

// Disallowed dangerous extensions that could be executed or pose security threats
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.zsh', '.csh',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
  '.vbs', '.vbe', '.wsf', '.wsh', '.msi', '.msp', '.dll',
  '.scr', '.com', '.pif', '.reg', '.apk', '.dmg', '.bin',
  '.iso', '.app', '.vb', '.hta', '.jar'
]);

// Helper to categorize file by extension & MIME type
const detectCategory = (originalName = '', mimeType = '') => {
  const ext = path.extname(originalName).toLowerCase();
  const mime = mimeType.toLowerCase();

  if (
    mime.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)
  ) {
    return 'Image';
  }

  if (
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)
  ) {
    return 'Video/Audio';
  }

  if (
    ['.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.scss', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.php', '.sql', '.sh', '.xml', '.yaml', '.yml'].includes(ext) ||
    mime === 'application/json' ||
    mime === 'text/html' ||
    mime === 'text/css' ||
    mime === 'text/javascript'
  ) {
    return 'Code';
  }

  if (
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('spreadsheet') ||
    mime.includes('presentation') ||
    mime.startsWith('text/') ||
    ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.rtf', '.odt', '.ods', '.odp'].includes(ext)
  ) {
    return 'Document';
  }

  return 'Other';
};

// Multer memory storage
const storage = multer.memoryStorage();

// File filter validation
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // 1. Check blacklisted executable extensions
  if (BLOCKED_EXTENSIONS.has(ext)) {
    const error = new Error(`File type ${ext} is blocked for security reasons. Executable files cannot be uploaded.`);
    error.status = 400;
    return cb(error, false);
  }

  // 2. Reject empty or hidden filenames
  if (!file.originalname || file.originalname.trim() === '' || file.originalname.startsWith('.')) {
    const error = new Error('Invalid filename. Hidden files or empty names are not allowed.');
    error.status = 400;
    return cb(error, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1, // 1 file per upload request
  },
  fileFilter,
});

/**
 * Middleware wrapper for single file upload with custom error handling.
 */
const handleSingleUpload = (fieldName = 'file') => {
  const multerMiddleware = upload.single(fieldName);

  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: `File exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
            error: 'LIMIT_FILE_SIZE',
          });
        }
        return res.status(err.status || 400).json({
          message: err.message || 'File upload validation failed.',
          error: err.code || 'UPLOAD_ERROR',
        });
      }
      next();
    });
  };
};

module.exports = {
  upload,
  handleSingleUpload,
  detectCategory,
  MAX_FILE_SIZE_BYTES,
  BLOCKED_EXTENSIONS,
};
