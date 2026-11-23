const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const Menu = require("./menu.model");
const { storageDirectory } = require("./menu.upload.middleware");
const Vendor = require("../../../vendor/auth/vendorAuth.model");
const ApiError = require("../../../../utils/ApiError");
const asyncHandler = require("../../../../utils/async-handler");

/**
 * Format vendor profile into clean restaurant details
 */
function formatRestaurantInfo(vendorDoc) {
  if (!vendorDoc) return null;
  const onboarding = vendorDoc.onboardingData || {};
  return {
    _id: vendorDoc._id,
    email: vendorDoc.email,
    restaurantName:
      onboarding.restaurantName ||
      onboarding.businessName ||
      onboarding.name ||
      "Metkart Partner Restaurant",
    location:
      onboarding.location ||
      onboarding.address ||
      onboarding.city ||
      "",
    cuisineTypes: onboarding.cuisineTypes || onboarding.cuisines || [],
    mobileNumber: onboarding.mobileNumber || onboarding.phone || "",
    restaurantImages: onboarding.restaurantImages || onboarding.images || [],
    openingTime: onboarding.openingTime || "",
    closingTime: onboarding.closingTime || "",
    pureVeg: onboarding.pureVeg ?? false,
    costForTwo: onboarding.costForTwo || null,
    rating: onboarding.rating || 4.5,
    onboardingStatus: vendorDoc.onboardingStatus,
  };
}

/**
 * Parse products array from form-data or JSON body
 */
function parseProductsBody(body, files = []) {
  let products = [];

  if (body.products) {
    if (typeof body.products === "string") {
      try {
        products = JSON.parse(body.products);
      } catch {
        throw new ApiError(400, "products field must be a valid JSON array of dish objects");
      }
    } else if (Array.isArray(body.products)) {
      products = body.products;
    } else if (typeof body.products === "object") {
      products = [body.products];
    }
  }

  // Handle indexed fields like products[0][dishName], products[1][dishName]
  if (products.length === 0) {
    const indexedDishes = {};
    Object.keys(body).forEach((key) => {
      const match = key.match(/^products\[(\d+)\]\[(\w+)\]$/);
      if (match) {
        const index = match[1];
        const prop = match[2];
        if (!indexedDishes[index]) indexedDishes[index] = {};
        indexedDishes[index][prop] = body[key];
      }
    });
    const indices = Object.keys(indexedDishes).sort((a, b) => Number(a) - Number(b));
    if (indices.length > 0) {
      products = indices.map((idx) => indexedDishes[idx]);
    }
  }

  if (!Array.isArray(products) || products.length === 0) {
    throw new ApiError(400, "At least one product (dish) is required in products array");
  }

  // Map uploaded files to dishes
  const uploadedFiles = Array.isArray(files) ? files : [];

  const normalizedProducts = products.map((dish, index) => {
    if (!dish.dishName && !dish.name) {
      throw new ApiError(400, `Dish at position ${index + 1} is missing dishName`);
    }

    const price = Number(dish.price);
    if (isNaN(price) || price < 0) {
      throw new ApiError(400, `Dish '${dish.dishName || dish.name}' has invalid price`);
    }

    let originalPrice = dish.originalPrice != null ? Number(dish.originalPrice) : null;
    if (originalPrice != null && (isNaN(originalPrice) || originalPrice < 0)) {
      originalPrice = null;
    }

    // Determine dish image
    let image = dish.image || null;

    // Check if an uploaded file matches by fieldname (e.g. products[0][image], dishImage_0, etc.)
    const matchedFileByName = uploadedFiles.find(
      (f) =>
        f.fieldname === `products[${index}][image]` ||
        f.fieldname === `dishImage_${index}` ||
        f.fieldname === `dishImages[${index}]`
    );

    if (matchedFileByName) {
      image = `/storage/restaurant-menu/${matchedFileByName.filename}`;
    } else if (!image && uploadedFiles[index]) {
      // Otherwise assign corresponding indexed uploaded file
      image = `/storage/restaurant-menu/${uploadedFiles[index].filename}`;
    }

    let foodType = (dish.foodType || dish.type || "veg").toLowerCase().trim();
    if (!["veg", "non-veg", "vegan", "egg"].includes(foodType)) {
      foodType = "veg";
    }

    return {
      dishName: (dish.dishName || dish.name).trim(),
      foodType,
      badge: dish.badge ? dish.badge.toString().trim() : null,
      description: dish.description ? dish.description.toString().trim() : "",
      price,
      originalPrice,
      image,
      isAvailable: dish.isAvailable !== false && dish.isAvailable !== "false",
    };
  });

  return normalizedProducts;
}

/**
 * Generate QR code for restaurant menu as an image file on disk
 */
async function generateMenuQrCode(restaurantId) {
  const frontendBaseUrl = process.env.FRONTEND_URL || "https://metkart.com";
  const menuUrl = `${frontendBaseUrl}/menu/${restaurantId}`;
  const qrFileName = `qr-${restaurantId}.png`;
  const qrFilePath = path.join(storageDirectory, qrFileName);

  try {
    fs.mkdirSync(storageDirectory, { recursive: true });
    await QRCode.toFile(qrFilePath, menuUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 320,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch (err) {
    console.error("QR image generation error:", err.message);
  }

  const qrCodeUrl = `/storage/restaurant-menu/${qrFileName}`;
  return { menuUrl, qrCode: qrCodeUrl };
}

/**
 * @desc    Create or update restaurant menu with products and QR code
 * @route   POST /api/user/food/menu (and /api/vendor/menu)
 * @access  Private (Vendor Token Required)
 */
exports.createOrUpdateMenu = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // Extract restaurant ID (vendor ID)
  const restaurantId =
    body.restaurant_id ||
    body.restaurantId ||
    body.vendorId ||
    req.vendor?._id;

  if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ApiError(400, "Valid restaurant_id (Vendor ID) is required");
  }

  // Find vendor and ensure exists
  const vendor = await Vendor.findById(restaurantId);
  if (!vendor) {
    throw new ApiError(404, "Restaurant not found with the provided restaurant_id");
  }

  // Parse category details
  const categoryName = (
    body.categoryName ||
    body.category_name ||
    body.category ||
    "Chef's Signature Selections"
  ).trim();

  const categoryDescription = (
    body.categoryDescription ||
    body.category_description ||
    "Recommended dishes for first-time guests"
  ).trim();

  // Parse products
  const products = parseProductsBody(body, req.files);

  // Generate QR code
  const { menuUrl, qrCode } = await generateMenuQrCode(restaurantId);

  // Find if category already exists for this restaurant, or create new
  let menu = await Menu.findOne({
    restaurantId,
    categoryName,
    isActive: true,
  });

  if (menu) {
    menu.categoryDescription = categoryDescription;
    menu.products = products;
    menu.qrCode = qrCode;
    menu.menuUrl = menuUrl;
    await menu.save();
  } else {
    menu = await Menu.create({
      restaurantId,
      categoryName,
      categoryDescription,
      products,
      qrCode,
      menuUrl,
      isActive: true,
    });
  }

  // Populate vendor data
  await menu.populate("restaurantId", "email onboardingData onboardingStatus");

  return res.status(201).json({
    success: true,
    message: "Menu and QR Code generated successfully",
    data: {
      _id: menu._id,
      restaurantId: menu.restaurantId._id,
      restaurant: formatRestaurantInfo(menu.restaurantId),
      categoryName: menu.categoryName,
      categoryDescription: menu.categoryDescription,
      products: menu.products,
      totalProducts: menu.products.length,
      qrCode: menu.qrCode,
      menuUrl: menu.menuUrl,
      createdAt: menu.createdAt,
      updatedAt: menu.updatedAt,
    },
  });
});

/**
 * @desc    Get complete restaurant menu & QR code by restaurantId
 * @route   GET /api/user/food/menu/:restaurantId (and /api/vendor/menu/:restaurantId)
 * @access  Public (No Token Required)
 */
exports.getMenuByRestaurantId = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ApiError(400, "Invalid restaurant ID format");
  }

  const vendor = await Vendor.findById(restaurantId);
  if (!vendor) {
    throw new ApiError(404, "Restaurant not found with the provided restaurant ID");
  }

  const categories = await Menu.find({
    restaurantId,
    isActive: true,
  }).sort({ createdAt: 1 });

  const { menuUrl, qrCode: generatedQrCode } = await generateMenuQrCode(restaurantId);

  let totalDishes = 0;
  const normalizedCategories = categories.map((cat) => {
    const catObj = cat.toObject ? cat.toObject() : { ...cat };
    if (!catObj.qrCode || catObj.qrCode.startsWith("data:image")) {
      catObj.qrCode = generatedQrCode;
      if (cat.save && cat.qrCode && cat.qrCode.startsWith("data:image")) {
        cat.qrCode = generatedQrCode;
        cat.save().catch(() => { });
      }
    }
    totalDishes += catObj.products ? catObj.products.length : 0;
    return catObj;
  });

  return res.status(200).json({
    success: true,
    restaurant: formatRestaurantInfo(vendor),
    qrCode: generatedQrCode,
    menuUrl,
    totalCategories: normalizedCategories.length,
    totalDishes,
    data: normalizedCategories,
  });
});

/**
 * @desc    Get all menus across restaurants or search by dish / category
 * @route   GET /api/user/food/menu
 * @access  Public (No Token Required)
 */
exports.getAllMenus = asyncHandler(async (req, res) => {
  const { restaurantId, category, search } = req.query || {};
  const filter = { isActive: true };

  if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
    filter.restaurantId = restaurantId;
  }

  if (category) {
    filter.categoryName = { $regex: category, $options: "i" };
  }

  if (search) {
    filter.$or = [
      { categoryName: { $regex: search, $options: "i" } },
      { "products.dishName": { $regex: search, $options: "i" } },
      { "products.description": { $regex: search, $options: "i" } },
    ];
  }

  const menus = await Menu.find(filter)
    .populate("restaurantId", "email onboardingData onboardingStatus")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: menus.length,
    data: menus.map((menu) => {
      const rId = menu.restaurantId?._id || menu.restaurantId;
      let cleanQr = menu.qrCode;
      if (!cleanQr || cleanQr.startsWith("data:image")) {
        cleanQr = `/storage/restaurant-menu/qr-${rId}.png`;
      }
      return {
        _id: menu._id,
        restaurantId: rId,
        restaurant: formatRestaurantInfo(menu.restaurantId),
        categoryName: menu.categoryName,
        categoryDescription: menu.categoryDescription,
        products: menu.products,
        totalProducts: menu.products.length,
        qrCode: cleanQr,
        menuUrl: menu.menuUrl,
        createdAt: menu.createdAt,
        updatedAt: menu.updatedAt,
      };
    }),
  });
});

/**
 * @desc    Get single menu category by ID
 * @route   GET /api/user/food/menu/category/:id
 * @access  Public (No Token Required)
 */
exports.getMenuById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid menu ID");
  }

  const menu = await Menu.findById(id).populate(
    "restaurantId",
    "email onboardingData onboardingStatus"
  );

  if (!menu || !menu.isActive) {
    throw new ApiError(404, "Menu not found");
  }

  const rId = menu.restaurantId?._id || menu.restaurantId;
  let cleanQr = menu.qrCode;
  if (!cleanQr || cleanQr.startsWith("data:image")) {
    cleanQr = `/storage/restaurant-menu/qr-${rId}.png`;
  }

  return res.status(200).json({
    success: true,
    data: {
      _id: menu._id,
      restaurantId: rId,
      restaurant: formatRestaurantInfo(menu.restaurantId),
      categoryName: menu.categoryName,
      categoryDescription: menu.categoryDescription,
      products: menu.products,
      totalProducts: menu.products.length,
      qrCode: cleanQr,
      menuUrl: menu.menuUrl,
      createdAt: menu.createdAt,
      updatedAt: menu.updatedAt,
    },
  });
});

/**
 * @desc    Get restaurant QR code only
 * @route   GET /api/user/food/menu/qr/:restaurantId
 * @access  Public (No Token Required)
 */
exports.getRestaurantQrCode = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ApiError(400, "Invalid restaurant ID");
  }

  const vendor = await Vendor.findById(restaurantId);
  if (!vendor) {
    throw new ApiError(404, "Restaurant not found");
  }

  const { menuUrl, qrCode } = await generateMenuQrCode(restaurantId);

  if (req.query.format === "base64") {
    const base64Data = await QRCode.toDataURL(menuUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 320,
    });
    return res.status(200).json({
      success: true,
      restaurant: formatRestaurantInfo(vendor),
      menuUrl,
      qrCode: base64Data,
    });
  }

  return res.status(200).json({
    success: true,
    restaurant: formatRestaurantInfo(vendor),
    menuUrl,
    qrCode,
  });
});

/**
 * @desc    Update a menu category or its products
 * @route   PUT /api/user/food/menu/:id (and PUT /api/user/food/menu)
 * @access  Private (Vendor Token Required)
 */
exports.updateMenu = asyncHandler(async (req, res) => {
  const targetId = req.params.id || req.body.menuId || req.body.restaurant_id || req.body.restaurantId;

  let menu;
  if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
    menu = await Menu.findById(targetId);
    if (!menu) {
      menu = await Menu.findOne({ restaurantId: targetId, isActive: true });
    }
  } else if (req.vendor?._id) {
    menu = await Menu.findOne({ restaurantId: req.vendor._id, isActive: true });
  }

  if (!menu || !menu.isActive) {
    throw new ApiError(404, "Menu not found with the provided ID");
  }

  // Ensure caller owns this restaurant menu
  if (
    req.vendor &&
    req.vendor._id.toString() !== menu.restaurantId.toString()
  ) {
    throw new ApiError(403, "You do not have permission to update this menu");
  }

  const body = req.body || {};

  if (body.categoryName && typeof body.categoryName === "string") {
    menu.categoryName = body.categoryName.trim();
  }

  if (body.categoryDescription !== undefined) {
    menu.categoryDescription = String(body.categoryDescription).trim();
  }

  if (body.isActive !== undefined) {
    menu.isActive = body.isActive === true || body.isActive === "true";
  }

  if (body.products) {
    const updatedProducts = parseProductsBody(body, req.files);
    const shouldAppend = body.append === true || body.append === "true" || req.query.append === "true";

    if (shouldAppend) {
      menu.products.push(...updatedProducts);
    } else {
      menu.products = updatedProducts;
    }
  }
  // just for verifying git configuration
  if (!menu.qrCode || menu.qrCode.startsWith("data:image")) {
    const { qrCode, menuUrl } = await generateMenuQrCode(menu.restaurantId);
    menu.qrCode = qrCode;
    menu.menuUrl = menuUrl;
  }

  await menu.save();
  await menu.populate("restaurantId", "email onboardingData onboardingStatus");

  const rId = menu.restaurantId?._id || menu.restaurantId;
  return res.status(200).json({
    success: true,
    message: "Menu updated successfully",
    data: {
      _id: menu._id,
      restaurantId: rId,
      restaurant: formatRestaurantInfo(menu.restaurantId),
      categoryName: menu.categoryName,
      categoryDescription: menu.categoryDescription,
      products: menu.products,
      totalProducts: menu.products.length,
      qrCode: menu.qrCode,
      menuUrl: menu.menuUrl,
      createdAt: menu.createdAt,
      updatedAt: menu.updatedAt,
    },
  });
});

/**
 * @desc    Update a single product inside a menu
 * @route   PUT /api/user/food/menu/:menuId/product/:productId (and /product/:productId)
 * @access  Private (Vendor Token Required)
 */
exports.updateProduct = asyncHandler(async (req, res) => {
  const { menuId, productId } = req.params;
  const targetProductId = productId || req.params.id;

  if (!mongoose.Types.ObjectId.isValid(targetProductId)) {
    throw new ApiError(400, "Invalid product ID");
  }

  let menu;
  if (menuId && mongoose.Types.ObjectId.isValid(menuId)) {
    menu = await Menu.findById(menuId);
  } else {
    menu = await Menu.findOne({ "products._id": targetProductId, isActive: true });
  }

  if (!menu || !menu.isActive) {
    throw new ApiError(404, "Menu or product not found");
  }

  // Ensure caller owns this restaurant menu
  if (
    req.vendor &&
    req.vendor._id.toString() !== menu.restaurantId.toString()
  ) {
    throw new ApiError(403, "You do not have permission to modify this menu");
  }

  const product = menu.products.id(targetProductId);
  if (!product) {
    throw new ApiError(404, "Product not found in this menu");
  }

  const body = req.body || {};

  if (body.dishName) product.dishName = String(body.dishName).trim();
  if (body.name) product.dishName = String(body.name).trim();

  if (body.foodType) {
    const fType = String(body.foodType).toLowerCase().trim();
    if (["veg", "non-veg", "vegan", "egg"].includes(fType)) {
      product.foodType = fType;
    }
  }

  if (body.badge !== undefined) {
    product.badge = body.badge ? String(body.badge).trim() : null;
  }

  if (body.description !== undefined) {
    product.description = String(body.description).trim();
  }

  if (body.price !== undefined) {
    const priceNum = Number(body.price);
    if (isNaN(priceNum) || priceNum < 0) {
      throw new ApiError(400, "Price must be a valid positive number");
    }
    product.price = priceNum;
  }

  if (body.originalPrice !== undefined) {
    const origNum = Number(body.originalPrice);
    product.originalPrice = !isNaN(origNum) && origNum >= 0 ? origNum : null;
  }

  if (body.isAvailable !== undefined) {
    product.isAvailable = body.isAvailable === true || body.isAvailable === "true";
  }

  if (req.files && req.files.length > 0) {
    product.image = `/storage/restaurant-menu/${req.files[0].filename}`;
  } else if (body.image !== undefined) {
    product.image = body.image ? String(body.image).trim() : null;
  }

  await menu.save();

  return res.status(200).json({
    success: true,
    message: "Dish updated successfully",
    data: {
      menuId: menu._id,
      product,
    },
  });
});

/**
 * @desc    Delete a menu category
 * @route   DELETE /api/user/food/menu/:id
 * @access  Private (Vendor Token Required)
 */
exports.deleteMenu = asyncHandler(async (req, res) => {
  const targetId = req.params.id || req.body.menuId || req.body.restaurant_id || req.body.restaurantId;

  if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
    throw new ApiError(400, "Valid menu ID or restaurant ID is required");
  }

  let menu = await Menu.findById(targetId);
  if (!menu) {
    menu = await Menu.findOne({ restaurantId: targetId, isActive: true });
  }

  if (!menu) {
    throw new ApiError(404, "Menu not found");
  }

  // Ensure caller owns this restaurant menu
  if (
    req.vendor &&
    req.vendor._id.toString() !== menu.restaurantId.toString()
  ) {
    throw new ApiError(403, "You do not have permission to delete this menu");
  }

  const isPermanent = req.query.permanent === "true" || req.body.permanent === true;
  if (isPermanent) {
    await Menu.findByIdAndDelete(menu._id);
  } else {
    menu.isActive = false;
    await menu.save();
  }

  return res.status(200).json({
    success: true,
    message: isPermanent ? "Menu permanently deleted" : "Menu deleted successfully",
    menuId: menu._id,
  });
});

/**
 * @desc    Delete a single product from a menu category
 * @route   DELETE /api/user/food/menu/:menuId/product/:productId
 * @access  Private (Vendor Token Required)
 */
exports.deleteProduct = asyncHandler(async (req, res) => {
  const { menuId, productId } = req.params;
  const targetProductId = productId || req.params.id;

  if (!targetProductId || !mongoose.Types.ObjectId.isValid(targetProductId)) {
    throw new ApiError(400, "Invalid product ID");
  }

  let menu;
  if (menuId && mongoose.Types.ObjectId.isValid(menuId)) {
    menu = await Menu.findById(menuId);
  } else {
    menu = await Menu.findOne({ "products._id": targetProductId, isActive: true });
  }

  if (!menu || !menu.isActive) {
    throw new ApiError(404, "Menu not found");
  }

  if (
    req.vendor &&
    req.vendor._id.toString() !== menu.restaurantId.toString()
  ) {
    throw new ApiError(403, "You do not have permission to modify this menu");
  }

  const initialCount = menu.products.length;
  menu.products = menu.products.filter((p) => p._id.toString() !== targetProductId);

  if (menu.products.length === initialCount) {
    throw new ApiError(404, "Product not found in this menu");
  }

  await menu.save();

  return res.status(200).json({
    success: true,
    message: "Product removed from menu successfully",
    data: {
      menuId: menu._id,
      remainingProducts: menu.products.length,
    },
  });
});
