const fs = require("fs");
const path = require("path");
const ApiError = require("../../../utils/ApiError");
const Product = require("./product.model");
const { storageDirectory } = require("../../../middleware/vendorProductUpload.middleware");

const editableFields = new Set([
  "title",
  "category",
  "description",
  "weightVolume",
  "expiryDate",
  "price",
  "availableQuantity",
  "status",
]);

function removeFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (
    resolvedPath.startsWith(`${storageDirectory}${path.sep}`) &&
    fs.existsSync(resolvedPath)
  ) {
    fs.unlinkSync(resolvedPath);
  }
}

function removeUploadedFiles(req) {
  for (const file of req.files || []) removeFile(file.path);
}

function imageMetadata(files) {
  return files.map((file) => ({
    filename: path.basename(file.filename),
    path: path.relative(process.cwd(), file.path).split(path.sep).join("/"),
    mimeType: file.mimetype,
    size: file.size,
  }));
}

function publicProduct(product) {
  const value = typeof product.toObject === "function" ? product.toObject() : product;
  return {
    ...value,
    id: String(value._id),
    vendorId: String(value.vendorId),
    images: (value.images || []).map((image, index) => ({
      filename: image.filename,
      mimeType: image.mimeType,
      size: image.size,
      isCover: index === 0,
      url: `/api/vendor/products/${value._id}/images/${encodeURIComponent(image.filename)}`,
    })),
  };
}

function parseProductData(body, partial) {
  const data = body || {};
  const unknownFields = Object.keys(data).filter((key) => !editableFields.has(key));
  if (unknownFields.length) {
    throw new ApiError(400, `Unsupported product fields: ${unknownFields.join(", ")}`);
  }

  const result = {};
  for (const key of ["title", "category", "description", "weightVolume"]) {
    if (data[key] === undefined) {
      if (!partial) throw new ApiError(400, `${key} is required`);
      continue;
    }
    if (typeof data[key] !== "string" || !data[key].trim()) {
      throw new ApiError(400, `${key} must be a non-empty string`);
    }
    result[key] = data[key].trim();
  }

  if (data.expiryDate !== undefined) {
    if (data.expiryDate === "") {
      result.expiryDate = null;
    } else {
      const expiryDate = new Date(data.expiryDate);
      if (!Number.isFinite(expiryDate.getTime())) {
        throw new ApiError(400, "expiryDate must be a valid date");
      }
      result.expiryDate = expiryDate;
    }
  }

  for (const key of ["price", "availableQuantity"]) {
    if (data[key] === undefined) {
      if (!partial) throw new ApiError(400, `${key} is required`);
      continue;
    }
    const numberValue =
      typeof data[key] === "string" && data[key].trim() !== ""
        ? Number(data[key])
        : data[key];
    if (
      typeof numberValue !== "number" ||
      !Number.isFinite(numberValue) ||
      numberValue < 0 ||
      (key === "availableQuantity" && !Number.isInteger(numberValue))
    ) {
      throw new ApiError(
        400,
        key === "price"
          ? "price must be a non-negative number"
          : "availableQuantity must be a non-negative integer"
      );
    }
    result[key] = numberValue;
  }

  if (data.status !== undefined) {
    if (!["draft", "published"].includes(data.status)) {
      throw new ApiError(400, "status must be draft or published");
    }
    result.status = data.status;
  } else if (!partial) {
    result.status = "draft";
  }

  return result;
}

function validatePublishedImages(status, images) {
  if (status === "published" && images.length < 3) {
    throw new ApiError(400, "At least 3 product images are required to publish");
  }
}

exports.listProducts = async (req, res, next) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: products.map(publicProduct),
    });
  } catch (error) {
    return next(error);
  }
};

exports.createProduct = async (req, res, next) => {
  try {
    const data = parseProductData(req.body, false);
    const images = imageMetadata(req.files || []);
    validatePublishedImages(data.status, images);
    const product = await Product.create({
      ...data,
      vendorId: req.vendor._id,
      images,
    });
    return res.status(201).json({ success: true, data: publicProduct(product) });
  } catch (error) {
    removeUploadedFiles(req);
    return next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  let saved = false;
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      vendorId: req.vendor._id,
    });
    if (!product) throw new ApiError(404, "Product not found");

    const data = parseProductData(req.body, true);
    const uploadedImages = req.files?.length ? imageMetadata(req.files) : null;
    const previousImages = uploadedImages ? [...(product.images || [])] : [];
    const images = uploadedImages || product.images;
    validatePublishedImages(data.status || product.status, images);

    Object.assign(product, data);
    if (uploadedImages) product.images = uploadedImages;
    await product.save();
    saved = true;

    if (uploadedImages) {
      for (const image of previousImages) removeFile(image.path);
    }
    return res.status(200).json({ success: true, data: publicProduct(product) });
  } catch (error) {
    if (!saved) removeUploadedFiles(req);
    return next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.productId,
      vendorId: req.vendor._id,
    });
    if (!product) throw new ApiError(404, "Product not found");

    for (const image of product.images || []) removeFile(image.path);
    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      data: { id: String(product._id) },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getProductImage = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.productId });
    if (!product) throw new ApiError(404, "Product not found");

    const image = (product.images || []).find(
      (item) => item.filename === path.basename(req.params.filename)
    );
    if (!image) throw new ApiError(404, "Product image not found");

    const filePath = path.resolve(process.cwd(), image.path);
    if (!filePath.startsWith(`${storageDirectory}${path.sep}`) || !fs.existsSync(filePath)) {
      throw new ApiError(404, "Product image not found");
    }
    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) return next(error);
      return undefined;
    });
  } catch (error) {
    return next(error);
  }
};
