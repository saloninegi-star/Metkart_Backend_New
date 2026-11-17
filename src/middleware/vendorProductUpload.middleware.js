const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const storageDirectory = path.resolve(process.cwd(), "storage", "vendor-products");
const supportedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
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
    callback(null, `${crypto.randomUUID()}${supportedMimeTypes.get(file.mimetype)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
    fields: 20,
    fieldSize: 10 * 1024,
  },
  fileFilter(req, file, callback) {
    if (!supportedMimeTypes.has(file.mimetype)) {
      const error = new Error("Product images must be JPEG, PNG, or WEBP");
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

module.exports = {
  storageDirectory,
  uploadProductImages: upload.array("images", 10),
};
