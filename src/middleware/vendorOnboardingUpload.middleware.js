const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const {
  allowedFileFields,
  extendedFileFields = allowedFileFields,
} = require("../modules/vendor/onboarding/onboarding.validation");

const storageDirectory = path.resolve(process.cwd(), "storage", "vendor-onboarding");
const supportedMimeTypes = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["text/csv", ".csv"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
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
    const ext = supportedMimeTypes.get(file.mimetype) || path.extname(file.originalname) || ".bin";
    callback(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 25,
    fields: 50,
    fieldSize: 50 * 1024,
  },
  fileFilter(req, file, callback) {
    if (!supportedMimeTypes.has(file.mimetype)) {
      const error = new Error("Only PDF, JPEG, PNG, WEBP, CSV, and Excel files are allowed");
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

const fields = (extendedFileFields || allowedFileFields).map((name) => ({
  name,
  maxCount: ["storefrontPhotos", "outletPhotos", "menuCard", "menuPhotos"].includes(name) ? 10 : 1,
}));

module.exports = {
  fields,
  storageDirectory,
  uploadFiles: upload.fields(fields),
};
