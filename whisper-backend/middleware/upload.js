const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Unique filename: timestamp + random + extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    // Accept images
    if (file.mimetype.startsWith('image/')) {
        return cb(null, true);
    }

    // Accept PDFs (strict mime, or octet-stream with .pdf extension)
    // Some devices/browsers send PDFs as application/octet-stream
    if (file.mimetype === 'application/pdf' ||
        (file.mimetype === 'application/octet-stream' && ext === '.pdf')) {
        return cb(null, true);
    }

    cb(new Error('Only images and PDF documents are allowed!'), false);
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: fileFilter
});

module.exports = upload;
