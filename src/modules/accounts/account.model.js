const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ACCOUNT_ROLES = [
  "food",
  "recycle",
  "mechanic",
  "grocery",
  "vendor",
  "delivery_boy",
];

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ACCOUNT_ROLES },
    tokenVersion: { type: Number, default: 0 },
    vendorProfile: {
      businessName: { type: String, trim: true, maxlength: 120 },
      phone: { type: String, trim: true, maxlength: 30 },
      address: {
        street: { type: String, trim: true, maxlength: 160 },
        city: { type: String, trim: true, maxlength: 80 },
        state: { type: String, trim: true, maxlength: 80 },
        postalCode: { type: String, trim: true, maxlength: 20 },
        country: { type: String, trim: true, maxlength: 80 },
      },
    },
  },
  { timestamps: true, versionKey: false }
);

accountSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

accountSchema.methods.toSafeJSON = function toSafeJSON() {
  const account = {
    id: this.id,
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
  };

  if (this.role === "vendor") {
    account.vendorProfile = this.vendorProfile;
  }

  return account;
};

const Account = mongoose.model("Account", accountSchema);

module.exports = Account;
module.exports.ACCOUNT_ROLES = ACCOUNT_ROLES;
