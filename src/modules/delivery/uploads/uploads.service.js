const crypto = require("crypto");
const path = require("path");
const {
  FileRecord,
  RiderDocument,
  KycRecord,
  SelfieCheck,
  BankAccount,
} = require("../models");
const AppError = require("../lib/AppError");
const { storageProvider } = require("../adapters");
const { sniffMimeType } = require("./sniffMime");
const { deliveryEnv } = require("../config/env");

const ALLOWED_PURPOSES = [
  "DL",
  "RC",
  "INSURANCE",
  "FITNESS_CERT",
  "PERMIT",
  "PUC",
  "EV_PURCHASE_BILL",
  "ID_PROOF",
  "CYCLE_PHOTO",
  "AADHAAR_DOC",
  "PAN_DOC",
  "SELFIE",
  "PASSBOOK",
];

async function uploadFile(userId, purpose, file) {
  if (!ALLOWED_PURPOSES.includes(purpose)) {
    throw new AppError("VALIDATION_ERROR", 422, `Invalid file purpose '${purpose}'`);
  }

  if (!file || !file.buffer) {
    throw new AppError("BAD_REQUEST", 400, "File buffer is missing");
  }

  if (file.buffer.length > deliveryEnv.UPLOAD_MAX_BYTES) {
    throw new AppError("FILE_TOO_LARGE", 413, `File exceeds limit of ${deliveryEnv.UPLOAD_MAX_BYTES} bytes`);
  }

  const sniffedMime = sniffMimeType(file.buffer);
  if (!sniffedMime) {
    throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, "Unsupported file format. Only JPEG, PNG, WEBP, and PDF are allowed");
  }

  // Reject PDF for SELFIE and CYCLE_PHOTO
  if (["SELFIE", "CYCLE_PHOTO"].includes(purpose) && sniffedMime === "application/pdf") {
    throw new AppError("FILE_TYPE_NOT_ALLOWED", 415, `PDF is not allowed for purpose ${purpose}`);
  }

  const ext = sniffedMime === "application/pdf" ? ".pdf" : sniffedMime === "image/png" ? ".png" : sniffedMime === "image/webp" ? ".webp" : ".jpg";
  const storageKey = `${purpose.toLowerCase()}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;
  const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

  await storageProvider.put(storageKey, file.buffer, sniffedMime);

  const fileDoc = await FileRecord.create({
    ownerUserId: userId,
    purpose,
    storageKey,
    mimeType: sniffedMime,
    sizeBytes: file.buffer.length,
    sha256,
  });

  return {
    fileId: fileDoc._id.toString(),
    purpose: fileDoc.purpose,
    mimeType: fileDoc.mimeType,
    sizeBytes: fileDoc.sizeBytes,
    createdAt: fileDoc.createdAt,
  };
}

async function deleteFile(userId, fileId) {
  const fileDoc = await FileRecord.findOne({ _id: fileId, ownerUserId: userId });
  if (!fileDoc) {
    throw new AppError("FILE_NOT_FOUND", 404, "File not found or access denied");
  }

  // Check if referenced by any record
  const [docRef, kycRef, selfieRef, bankRef] = await Promise.all([
    RiderDocument.findOne({ fileId }),
    KycRecord.findOne({ documentFileId: fileId }),
    SelfieCheck.findOne({ fileId }),
    BankAccount.findOne({ passbookFileId: fileId }),
  ]);

  if (docRef || kycRef || selfieRef || bankRef) {
    throw new AppError("BAD_REQUEST", 400, "File is currently in use and cannot be deleted");
  }

  await storageProvider.delete(fileDoc.storageKey);
  await FileRecord.findByIdAndUpdate(fileId, { deletedAt: new Date() });

  return { deleted: true };
}

module.exports = {
  uploadFile,
  deleteFile,
};
