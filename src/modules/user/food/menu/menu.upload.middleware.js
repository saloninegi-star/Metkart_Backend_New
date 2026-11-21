const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const storageDirectory = path.resolve(process.cwd(), "storage", "restaurant-menu");

const supportedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    try {
      fs.mkdirSync(storageDirectory, { recursive: true });
      callback(null, storageDirectory);
    } catch (error) {
      callback(error);
    }
  },
  filename(req, file, callback) {
    const ext = supportedMimeTypes.get(file.mimetype) || path.extname(file.originalname) || ".png";
    callback(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
    files: 30, // up to 30 images
  },
  fileFilter(req, file, callback) {
    if (!supportedMimeTypes.has(file.mimetype.toLowerCase())) {
      const error = new Error("Dish images must be JPEG, PNG, or WEBP");
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

module.exports = {
  storageDirectory,
  uploadMenuFiles: upload.any(),
};
