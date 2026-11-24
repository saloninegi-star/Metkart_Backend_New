const uploadsService = require("./uploads.service");
const { storageProvider } = require("../adapters");
const AppError = require("../lib/AppError");

async function postUpload(req, res, next) {
  try {
    const purpose = req.body?.purpose;
    const file = req.file;
    if (!purpose) {
      throw new AppError("VALIDATION_ERROR", 422, "purpose is required");
    }
    if (!file) {
      throw new AppError("VALIDATION_ERROR", 422, "file is required");
    }

    const result = await uploadsService.uploadFile(req.rider.id, purpose, file);
    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function removeUpload(req, res, next) {
  try {
    const { fileId } = req.params;
    const result = await uploadsService.deleteFile(req.rider.id, fileId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function downloadFile(req, res, next) {
  try {
    const { storageKey } = req.params;
    const { expires, sig } = req.query;

    if (!expires || !sig || !storageProvider.verifySignedUrl(storageKey, expires, sig)) {
      throw new AppError("FORBIDDEN", 403, "Invalid or expired signed URL");
    }

    const fileBuffer = await storageProvider.get(storageKey);
    res.setHeader("Content-Disposition", `inline; filename="${storageKey}"`);
    return res.send(fileBuffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  postUpload,
  removeUpload,
  downloadFile,
};
