const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 10;

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    // Random key on disk — the original name only lives in the DB
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`);
    },
});

const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES } });

module.exports = { UPLOAD_DIR, upload, MAX_FILES };
