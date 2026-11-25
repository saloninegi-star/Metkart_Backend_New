const mongoose = require("mongoose");
const DiningBooking = require("./dining.model");
const Vendor = require("../../../vendor/auth/vendorAuth.model");
const ApiError = require("../../../../utils/ApiError");
const asyncHandler = require("../../../../utils/async-handler");

function parseArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * @desc    Create a new table reservation / dining booking
 * @route   POST /api/user/food/dining
 * @access  Private (User)
 */
exports.createDiningBooking = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // Extract restaurant ID from various supported aliases
  const restaurantId =
    body.restaurant_id || body.restaurantId || body.vendorId;

  if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ApiError(400, "Valid restaurant_id is required");
  }

  // Verify restaurant exists in Vendor model
  const vendor = await Vendor.findById(restaurantId);
  if (!vendor) {
    throw new ApiError(404, "Restaurant not found with the provided restaurant_id");
  }

  // Extract and validate number of guests
  const rawGuests =
    body.numberOfGuests ??
    body.number_of_guests ??
    body.guests ??
    body.guestCount;
  const numberOfGuests = Number(rawGuests);
  if (!rawGuests || isNaN(numberOfGuests) || numberOfGuests < 1) {
    throw new ApiError(400, "numberOfGuests must be a positive number (minimum 1)");
  }

  // Extract and validate reservation date
  const reservationDate = (
    body.reservationDate ||
    body.reservation_date ||
    body.bookingDate ||
    body.date ||
    ""
  ).toString().trim();
  if (!reservationDate) {
    throw new ApiError(400, "reservationDate is required");
  }

  // Extract and validate time slot
  const timeSlot = (
    body.timeSlot ||
    body.time_slot ||
    body.slot ||
    ""
  ).toString().trim();
  if (!timeSlot) {
    throw new ApiError(400, "timeSlot is required");
  }

  // Determine meal type (Lunch vs Dinner)
  let mealType = body.mealType || body.meal_type;
  if (!mealType) {
    const lowerSlot = timeSlot.toLowerCase();
    if (lowerSlot.includes("pm")) {
      const hour = parseInt(timeSlot, 10);
      mealType = hour >= 6 && hour <= 11 ? "Dinner" : "Lunch";
    } else {
      mealType = "Lunch";
    }
  }

  // Seating area and special requests
  const seatingArea = (
    body.seatingArea ||
    body.seating_area ||
    "Indoor Courtyard"
  ).toString().trim();

  const specialRequests = (
    body.specialRequests ||
    body.special_requests ||
    ""
  ).toString().trim();

  const specialRequestTags = parseArrayField(
    body.specialRequestTags || body.special_request_tags || body.tags
  );

  // Grand total extraction
  const rawGrandTotal =
    body.grandTotal !== undefined
      ? body.grandTotal
      : body.grand_total !== undefined
        ? body.grand_total
        : body.total !== undefined
          ? body.total
          : 0;

  const grandTotal = Number(rawGrandTotal) >= 0 ? Number(rawGrandTotal) : 0;

  // Get restaurant snapshot details
  const onboardingData = vendor.onboardingData || {};
  const restaurantName = onboardingData.restaurantName || "Restaurant";
  const restaurantAddress = onboardingData.location?.area
    ? `${onboardingData.location.area}, ${onboardingData.location.city || ""}`.trim()
    : onboardingData.city || null;

  // Create booking
  const booking = await DiningBooking.create({
    userId: req.user._id,
    restaurantId: vendor._id,
    restaurantName,
    restaurantAddress,
    numberOfGuests,
    reservationDate,
    timeSlot,
    mealType,
    seatingArea,
    specialRequests,
    specialRequestTags,
    grandTotal,
    status: "confirmed",
  });

  return res.status(201).json({
    success: true,
    message: "Table reservation created successfully",
    data: {
      _id: booking._id,
      userId: {
        _id: req.user._id,
        fullName: req.user.fullName,
        email: req.user.email,
        mobileNumber: req.user.mobileNumber,
      },
      restaurantId: {
        _id: vendor._id,
        restaurantName,
        restaurantAddress,
        email: vendor.email,
        mobileNumber: onboardingData.mobileNumber || null,
      },
      numberOfGuests: booking.numberOfGuests,
      reservationDate: booking.reservationDate,
      timeSlot: booking.timeSlot,
      mealType: booking.mealType,
      seatingArea: booking.seatingArea,
      specialRequests: booking.specialRequests,
      specialRequestTags: booking.specialRequestTags,
      grandTotal: booking.grandTotal,
      status: booking.status,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    },
  });
});

/**
 * @desc    Get dining reservations (Public / No Auth Required)
 * @route   GET /api/user/food/dining
 * @access  Public
 */
exports.getDiningBookings = asyncHandler(async (req, res) => {
  const { userId, restaurantId, id } = req.query || {};
  const filter = {};

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    filter.userId = userId;
  }
  if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
    filter.restaurantId = restaurantId;
  }
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    filter._id = id;
  }

  const bookings = await DiningBooking.find(filter)
    .select("-total")
    .populate("restaurantId", "email onboardingData")
    .populate("userId", "fullName email mobileNumber currentAddress")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings,
  });
});

// Alias for backwards compatibility
exports.getUserDiningBookings = exports.getDiningBookings;

/**
 * @desc    Get dining reservations by User ID (Public / No Auth Required)
 * @route   GET /api/user/food/dining/user/:userId
 * @access  Public
 */
exports.getDiningBookingsByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  const bookings = await DiningBooking.find({ userId })
    .select("-total")
    .populate("restaurantId", "email onboardingData")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings,
  });
});

/**
 * @desc    Get a single dining reservation by ID (Public / No Auth Required)
 * @route   GET /api/user/food/dining/:id
 * @access  Public
 */
exports.getDiningBookingById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid reservation ID");
  }

  const booking = await DiningBooking.findById(id)
    .select("-total")
    .populate("restaurantId", "email onboardingData")
    .populate("userId", "fullName email mobileNumber currentAddress");

  if (!booking) {
    throw new ApiError(404, "Dining reservation not found");
  }

  return res.status(200).json({
    success: true,
    data: booking,
  });
});

/**
 * @desc    Get dining bookings by restaurant ID (Public / No Auth Required)
 * @route   GET /api/user/food/dining/restaurant/:restaurantId
 * @access  Public
 */
exports.getRestaurantDiningBookings = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ApiError(400, "Invalid restaurant ID");
  }

  const bookings = await DiningBooking.find({ restaurantId })
    .select("-total")
    .populate("userId", "fullName email mobileNumber currentAddress")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings,
  });
});
