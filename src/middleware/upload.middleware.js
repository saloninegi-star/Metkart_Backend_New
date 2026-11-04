const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Upload directory ensure karein
const uploadDir = "uploads/shoptypes";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Unique filename: shoptype-17123456789.png
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "shoptype-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// Sirf Images allow karein (PNG, JPG, SVG, WEBP)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // Max 2MB
});

module.exports = upload;