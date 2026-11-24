const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const uploadsController = require("./uploads.controller");
const riderAuth = require("../middleware/riderAuth.middleware");
const validate = require("../middleware/validate.middleware");
const idempotencyMiddleware = require("../middleware/idempotency.middleware");
const { deliveryEnv } = require("../config/env");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: deliveryEnv.UPLOAD_MAX_BYTES + 1024 }, // allow slightly larger so content sniffer catches and formats exact 413
});

const router = express.Router();

const deleteFileParamSchema = z
  .object({
    fileId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Must be a valid 24-character ObjectId"),
  })
  .strict();

router.post(
  "/",
  riderAuth,
  idempotencyMiddleware(),
  upload.single("file"),
  uploadsController.postUpload
);

router.delete(
  "/:fileId",
  riderAuth,
  validate({ params: deleteFileParamSchema }),
  uploadsController.removeUpload
);

// Signed download route
router.get("/download/:storageKey", uploadsController.downloadFile);

module.exports = router;
