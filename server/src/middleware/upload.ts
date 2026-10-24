import multer from 'multer';

/**
 * Parses one multipart file field named "receipt" into memory, rejecting anything larger than
 * `maxBytes` with 413. The real file type is checked from its bytes afterwards.
 */
export const receiptUpload = (maxBytes: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5 },
  }).single('receipt');
