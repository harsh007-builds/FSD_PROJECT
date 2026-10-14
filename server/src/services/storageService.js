const mongoose = require('mongoose');
const { Readable } = require('stream');
const crypto = require('crypto');

let bucketInstance = null;

/**
 * Returns the GridFS bucket instance using the active Mongoose connection.
 */
const getBucket = () => {
  if (!mongoose.connection.db) {
    throw new Error('Database connection not established for GridFS storage');
  }
  if (!bucketInstance || bucketInstance.s.db !== mongoose.connection.db) {
    bucketInstance = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'resources',
    });
  }
  return bucketInstance;
};

/**
 * Uploads a file buffer to persistent GridFS storage.
 * @param {Buffer} buffer - File buffer from multer
 * @param {string} originalName - Original filename
 * @param {string} mimeType - File MIME type
 * @param {Object} metadata - Custom metadata (uploader, project, etc.)
 * @returns {Promise<{ fileId: mongoose.Types.ObjectId, originalName: string, mimeType: string, size: number, checksum: string }>}
 */
const uploadFile = (buffer, originalName, mimeType, metadata = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const bucket = getBucket();
      const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      const uploadStream = bucket.openUploadStream(sanitizedName, {
        contentType: mimeType,
        metadata: {
          ...metadata,
          originalName,
          checksum: hash,
          uploadedAt: new Date(),
        },
      });

      uploadStream.on('error', (err) => {
        reject(err);
      });

      uploadStream.on('finish', () => {
        resolve({
          fileId: uploadStream.id,
          originalName,
          mimeType,
          size: buffer.length,
          checksum: hash,
          storageProvider: 'gridfs',
        });
      });

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Retrieves file metadata from GridFS.
 * @param {string|mongoose.Types.ObjectId} fileId
 * @returns {Promise<Object>}
 */
const getFileInfo = async (fileId) => {
  const bucket = getBucket();
  const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  const files = await bucket.find({ _id: id }).toArray();
  if (!files || files.length === 0) {
    return null;
  }
  return files[0];
};

/**
 * Opens a readable download stream for a file from GridFS.
 * Supports partial byte-range requests for previews (e.g. video, audio, large PDFs).
 * @param {string|mongoose.Types.ObjectId} fileId
 * @param {Object} [options] - e.g. { start, end }
 * @returns {ReadableStream}
 */
const getDownloadStream = (fileId, options = {}) => {
  const bucket = getBucket();
  const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  return bucket.openDownloadStream(id, options);
};

/**
 * Permanently removes a file and its chunks from GridFS.
 * @param {string|mongoose.Types.ObjectId} fileId
 * @returns {Promise<void>}
 */
const deleteFile = async (fileId) => {
  if (!fileId) return;
  try {
    const bucket = getBucket();
    const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    await bucket.delete(id);
  } catch (err) {
    // If file already deleted or not found, do not crash
    if (!err.message?.includes('FileNotFound') && !err.message?.includes('not found')) {
      throw err;
    }
  }
};

module.exports = {
  uploadFile,
  getFileInfo,
  getDownloadStream,
  deleteFile,
  getBucket,
};
