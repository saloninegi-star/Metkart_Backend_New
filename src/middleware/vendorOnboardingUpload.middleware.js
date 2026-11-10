const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { allowedFileFields } = require("../modules/vendor/onboarding/onboarding.validation");

const storageDirectory = path.resolve(process.cwd(), "storage", "vendor-onboarding");
const supportedMimeTypes = new Map([
  ["application/pdf", ".pdf"],
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
    files: 15,
    fields: 30,
    fieldSize: 10 * 1024,
  },
  fileFilter(req, file, callback) {
    if (!supportedMimeTypes.has(file.mimetype)) {
      const error = new Error("Only PDF, JPEG, PNG, and WEBP files are allowed");
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

const fields = allowedFileFields.map((name) => ({
  name,
  maxCount: name === "storefrontPhotos" ? 10 : 1,
}));

module.exports = {
  fields,
  storageDirectory,
  uploadFiles: upload.fields(fields),
};
