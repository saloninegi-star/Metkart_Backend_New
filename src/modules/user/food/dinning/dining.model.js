const mongoose = require("mongoose");

const diningBookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: [true, "restaurantId is required"],
    },
    restaurantName: {
      type: String,
      trim: true,
      default: "Restaurant",
    },
    restaurantAddress: {
      type: String,
      trim: true,
      default: null,
    },
    numberOfGuests: {
      type: Number,
      required: [true, "numberOfGuests is required"],
      min: [1, "At least 1 guest is required"],
    },
    reservationDate: {
      type: String,
      required: [true, "reservationDate is required"],
      trim: true,
    },
    timeSlot: {
      type: String,
      required: [true, "timeSlot is required"],
      trim: true,
    },
    mealType: {
      type: String,
      default: "Dinner",
      trim: true,
    },
    seatingArea: {
      type: String,
      default: "Indoor Courtyard",
      trim: true,
    },
    specialRequests: {
      type: String,
      default: "",
      trim: true,
    },
    specialRequestTags: {
      type: [String],
      default: [],
    },
    grandTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["confirmed", "pending", "cancelled", "completed"],
      default: "confirmed",
    },
  },
  {
    timestamps: true,
  }
);

const DiningBooking =
  mongoose.models.DiningBooking ||
  mongoose.model("DiningBooking", diningBookingSchema);

module.exports = DiningBooking;
