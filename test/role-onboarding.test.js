const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const ShopType = require("../src/modules/admin/vendor/shopType/shopType.model");
const ProductCategory = require("../src/modules/admin/vendor/productCategory/productCategory.model");

const JWT_SECRET = process.env.JWT_SECRET || "your_metkart_jwt_secret_key";

function mockVendor(initial = {}) {
  const v = {
    _id: "507f1f77bcf86cd799439011",
    email: "vendor@example.com",
    isEmailVerified: true,
    status: "active",
    onboardingType: null,
    roleType: null,
    onboardingStatus: "not_started",
    isProfileComplete: false,
    location: {},
    panDetails: {},
    aadhaarDetails: {},
    gstDetails: {},
    bankDetails: {},
    restaurantDetails: {},
    mechanicDetails: {},
    shopkeeperDetails: {},
    userDetails: {},
    scrapVendorDetails: {},
    onboardingData: {},
    onboardingFiles: [],
    ...initial,
    async save() {
      return this;
    },
    toObject() {
      return { ...this };
    },
  };
  return v;
}

test("mechanic onboarding saves common fields at root and mechanicDetails nested object", async () => {
  const originalFindById = Vendor.findById;
  const vendor = mockVendor();
  Vendor.findById = async () => vendor;

  try {
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    const response = await request(app)
      .post("/api/vendor/onboarding/mechanic/submit")
      .set("Authorization", `Bearer ${token}`)
      .field("vendorId", vendor._id)
      .field("businessTypeId", "507f1f77bcf86cd799439012")
      .field("shopTypeId", "507f1f77bcf86cd799439013")
      .field("categoryId", "507f1f77bcf86cd799439014")
      .field("productCategory", "Automobile Service")
      .field("mechanicName", "Ramesh Auto Care")
      .field("ownerFullName", "Ramesh Kumar")
      .field("email", "ramesh@example.com")
      .field("mobileNumber", "+91 9876543210")
      .field("whatsappUpdates", "true")
      .field("primaryContactSameAsOwner", "true")
      .field("shopNo", "Shop 12")
      .field("floor", "Ground Floor")
      .field("area", "Sector 18")
      .field("city", "Noida")
      .field("nearbyLandmark", "Near Metro Station")
      .field(
        "servicesOffered",
        JSON.stringify([
          "Periodic General Servicing (Oil Change, Filter Cleaning)",
          "AC & Electrical Repairs",
          "Wheel Alignment & Tyres",
          "Vehicle Washing & Detailing (Bike, Car, Mini-Truck & Commercial)",
        ])
      )
      .field(
        "supportedVehicles",
        JSON.stringify([
          "Two-Wheelers (Bikes/Scooters)",
          "Cars & SUVs",
          "Mini Trucks & Commercial Vehicles",
        ])
      )
      .field("openTime", "09:00 AM")
      .field("closeTime", "08:00 PM")
      .field("openDays", JSON.stringify(["M", "T", "W", "Th", "F", "S"]))
      .field("deviceType", "MetKart Mechanic Partner App")
      .field("panNumber", "ABCDE1234F")
      .field("panFullName", "Ramesh Kumar")
      .field("registeredBusinessAddress", "Shop 12, Ground Floor, Sector 18, Noida")
      .field("aadhaarNumber", "1234 5678 9012")
      .field("aadhaarFullName", "Ramesh Kumar")
      .field("gstRegistered", "false")
      .field("licenseRegistered", "false")
      .field("bankAccountNumber", "123456781234")
      .field("bankAccountNumberConfirm", "123456781234")
      .field("ifscCode", "HDFC0001234")
      .field("accountType", "Savings A/C")
      .field("termsAccepted", "true")
      .attach("panCard", Buffer.from("fake pan content"), "pan_card.png")
      .attach("aadhaarCard", Buffer.from("fake aadhaar content"), "aadhaar_card.png")
      .attach("workshopFront", Buffer.from("fake workshop photo"), "workshop_front.jpg");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.roleType, "mechanic");

    // Verify common fields at root
    assert.equal(vendor.roleType, "mechanic");
    assert.equal(vendor.ownerFullName, "Ramesh Kumar");
    assert.equal(vendor.mobileNumber, "+91 9876543210");
    assert.equal(vendor.whatsappUpdates, true);
    assert.equal(vendor.primaryContactSameAsOwner, true);
    assert.equal(vendor.location.area, "Sector 18");
    assert.equal(vendor.location.city, "Noida");
    assert.equal(vendor.panDetails.panNumber, "ABCDE1234F");
    assert.equal(vendor.panDetails.fullName, "Ramesh Kumar");
    assert.equal(vendor.aadhaarDetails.aadhaarNumber, "1234 5678 9012");
    assert.equal(vendor.bankDetails.accountNumber, "123456781234");
    assert.equal(vendor.bankDetails.ifscCode, "HDFC0001234");
    assert.equal(vendor.termsAccepted, true);

    // Verify role-specific fields inside mechanicDetails nested object
    assert.equal(vendor.mechanicDetails.mechanicName, "Ramesh Auto Care");
    assert.equal(vendor.mechanicDetails.garageName, "Ramesh Auto Care");
    assert.equal(vendor.mechanicDetails.productCategory, "Automobile Service");
    assert.equal(vendor.mechanicDetails.servicesOffered.length, 4);
    assert.equal(vendor.mechanicDetails.supportedVehicles.length, 3);
    assert.equal(vendor.mechanicDetails.timing.openTime, "09:00 AM");
    assert.equal(vendor.mechanicDetails.timing.closeTime, "08:00 PM");
    assert.deepEqual(vendor.mechanicDetails.timing.openDays, ["M", "T", "W", "Th", "F", "S"]);
    assert.equal(vendor.mechanicDetails.deviceType, "MetKart Mechanic Partner App");
    assert.ok(vendor.mechanicDetails.photos.workshopFront);

    // Verify restaurantDetails is empty
    assert.equal(vendor.restaurantDetails?.restaurantName ?? null, null);
  } finally {
    Vendor.findById = originalFindById;
  }
});

test("restaurant onboarding saves common fields at root and restaurantDetails nested object", async () => {
  const originalFindById = Vendor.findById;
  const vendor = mockVendor();
  Vendor.findById = async () => vendor;

  try {
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    const response = await request(app)
      .post("/api/vendor/onboarding/restaurant/submit")
      .set("Authorization", `Bearer ${token}`)
      .field("vendorId", vendor._id)
      .field("businessTypeId", "507f1f77bcf86cd799439012")
      .field("shopTypeId", "507f1f77bcf86cd799439013")
      .field("categoryId", "507f1f77bcf86cd799439014")
      .field("restaurantName", "The Gourmet Kitchen")
      .field("ownerFullName", "Chef Sanjeev")
      .field("email", "chef@kitchen.com")
      .field("mobileNumber", "+91 9876543211")
      .field("whatsappUpdates", "true")
      .field("primaryContactSameAsOwner", "true")
      .field("area", "Connaught Place")
      .field("city", "New Delhi")
      .field("fssaiNumber", "12345678901234")
      .field("cuisineTypes", JSON.stringify(["North Indian", "Mughlai"]))
      .field("costForTwo", "1200")
      .field("diningAvailable", "true")
      .field("panNumber", "ABCDE1234F")
      .field("panFullName", "Chef Sanjeev")
      .field("registeredBusinessAddress", "CP, New Delhi")
      .field("gstRegistered", "true")
      .field("gstNumber", "22AAAAA0000A1Z5")
      .field("gstFullName", "Gourmet Foods Pvt Ltd")
      .field("bankAccountNumber", "987654321098")
      .field("bankAccountNumberConfirm", "987654321098")
      .field("ifscCode", "SBIN0001234")
      .field("accountType", "Current A/C")
      .attach("panCard", Buffer.from("fake pan"), "pan.jpg")
      .attach("aadhaarCard", Buffer.from("fake aadhaar"), "aadhaar.jpg")
      .attach("storefrontPhotos", Buffer.from("fake storefront"), "store.jpg")
      .attach("gstCertificate", Buffer.from("fake gst"), "gst.pdf")
      .attach("fssaiCertificate", Buffer.from("fake fssai"), "fssai.pdf");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.roleType, "restaurant");

    // Common root fields
    assert.equal(vendor.roleType, "restaurant");
    assert.equal(vendor.ownerFullName, "Chef Sanjeev");
    assert.equal(vendor.mobileNumber, "+91 9876543211");
    assert.equal(vendor.location.area, "Connaught Place");
    assert.equal(vendor.location.city, "New Delhi");
    assert.equal(vendor.panDetails.panNumber, "ABCDE1234F");
    assert.equal(vendor.gstDetails.isRegistered, true);
    assert.equal(vendor.gstDetails.gstNumber, "22AAAAA0000A1Z5");
    assert.equal(vendor.bankDetails.accountNumber, "987654321098");

    // Role-specific nested object
    assert.equal(vendor.restaurantDetails.restaurantName, "The Gourmet Kitchen");
    assert.equal(vendor.restaurantDetails.fssaiNumber, "12345678901234");
    assert.deepEqual(vendor.restaurantDetails.cuisineTypes, ["North Indian", "Mughlai"]);
    assert.equal(vendor.restaurantDetails.costForTwo, 1200);
    assert.equal(vendor.restaurantDetails.diningAvailable, true);
    assert.ok(vendor.restaurantDetails.photos.storefrontPhotos.length > 0);
    assert.ok(vendor.restaurantDetails.photos.fssaiCertificate);

    // Ensure mechanicDetails is empty
    assert.equal(vendor.mechanicDetails?.mechanicName ?? null, null);
  } finally {
    Vendor.findById = originalFindById;
  }
});

test("shopkeeper onboarding saves common fields at root and shopkeeperDetails nested object", async () => {
  const originalFindById = Vendor.findById;
  const vendor = mockVendor();
  Vendor.findById = async () => vendor;

  try {
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    const response = await request(app)
      .post("/api/vendor/onboarding/shopkeeper/submit")
      .set("Authorization", `Bearer ${token}`)
      .field("vendorId", vendor._id)
      .field("businessTypeId", "507f1f77bcf86cd799439012")
      .field("shopTypeId", "507f1f77bcf86cd799439013")
      .field("categoryId", "507f1f77bcf86cd799439014")
      .field("productCategory", "Grocery")
      .field("shopkeeperName", "Daily Needs Supermart")
      .field("ownerFullName", "John Doe")
      .field("email", "john.doe@example.com")
      .field("mobileNumber", "+91 9876543212")
      .field("whatsappUpdates", "true")
      .field("primaryContactSameAsOwner", "true")
      .field("area", "Connaught Place")
      .field("city", "New Delhi")
      .field("nearbyLandmark", "Near Metro Station")
      .field("panNumber", "ABCDE1234F")
      .field("panFullName", "John Doe")
      .field("registeredBusinessAddress", "Connaught Place, New Delhi")
      .field("gstRegistered", "true")
      .field("gstNumber", "22AAAAA0000A1Z5")
      .field("gstFullName", "John Doe Trading")
      .field("bankAccountNumber", "123456781234")
      .field("bankAccountNumberConfirm", "123456781234")
      .field("ifscCode", "SBIN0001234")
      .field("accountType", "Savings A/C")
      .attach("panCard", Buffer.from("fake pan"), "pan.jpg")
      .attach("aadhaarCard", Buffer.from("fake aadhaar"), "aadhaar.jpg")
      .attach("storefrontPhotos", Buffer.from("fake storefront"), "store.jpg")
      .attach("gstCertificate", Buffer.from("fake gst"), "gst.pdf");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.roleType, "shopkeeper");

    // Common root fields
    assert.equal(vendor.roleType, "shopkeeper");
    assert.equal(vendor.ownerFullName, "John Doe");
    assert.equal(vendor.mobileNumber, "+91 9876543212");
    assert.equal(vendor.location.area, "Connaught Place");
    assert.equal(vendor.location.city, "New Delhi");
    assert.equal(vendor.panDetails.panNumber, "ABCDE1234F");
    assert.equal(vendor.gstDetails.isRegistered, true);

    // Role-specific nested object
    assert.equal(vendor.shopkeeperDetails.shopkeeperName, "Daily Needs Supermart");
    assert.equal(vendor.shopkeeperDetails.shopName, "Daily Needs Supermart");
    assert.equal(vendor.shopkeeperDetails.productCategory, "Grocery");
    assert.ok(vendor.shopkeeperDetails.photos.panCard);
    assert.ok(vendor.shopkeeperDetails.photos.gstCertificate);
    assert.ok(vendor.shopkeeperDetails.photos.storefrontPhotos.length > 0);

    // userDetails also populated for shopkeeper
    assert.equal(vendor.userDetails.shopkeeperName, "Daily Needs Supermart");

    // Ensure restaurantDetails and mechanicDetails are empty
    assert.equal(vendor.restaurantDetails?.restaurantName ?? null, null);
    assert.equal(vendor.mechanicDetails?.mechanicName ?? null, null);
  } finally {
    Vendor.findById = originalFindById;
  }
});

test("unified single registration endpoint POST /submit handles any role via roleType in body", async () => {
  const originalFindById = Vendor.findById;
  const originalShopTypeFindById = ShopType.findById;
  const originalProductCategoryFindById = ProductCategory.findById;

  const vendor = mockVendor();
  Vendor.findById = async () => vendor;
  ShopType.findById = async () => ({ _id: "507f1f77bcf86cd799439013", name: "Mechanic" });
  ProductCategory.findById = async () => ({ _id: "507f1f77bcf86cd799439014", productCategoryName: "Automobile" });

  try {
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    // Submit using single endpoint /api/vendor/onboarding/submit with roleType in body
    const response = await request(app)
      .post("/api/vendor/onboarding/submit")
      .set("Authorization", `Bearer ${token}`)
      .field("roleType", "mechanic")
      .field("vendorId", vendor._id)
      .field("businessTypeId", "507f1f77bcf86cd799439012")
      .field("shopTypeId", "507f1f77bcf86cd799439013")
      .field("categoryId", "507f1f77bcf86cd799439014")
      .field("mechanicName", "Unified Mechanic Care")
      .field("ownerFullName", "Suresh Sharma")
      .field("email", "suresh@example.com")
      .field("mobileNumber", "+91 9988776655")
      .field("area", "Sector 62")
      .field("city", "Noida")
      .field("panNumber", "ABCDE1234F")
      .field("panFullName", "Suresh Sharma")
      .field("gstRegistered", "false")
      .field("licenseRegistered", "false")
      .field("bankAccountNumber", "123456789012")
      .field("bankAccountNumberConfirm", "123456789012")
      .field("ifscCode", "HDFC0001234")
      .field("accountType", "Savings A/C")
      .attach("panCard", Buffer.from("fake pan"), "pan.jpg")
      .attach("aadhaarCard", Buffer.from("fake aadhaar"), "aadhaar.jpg")
      .attach("workshopFront", Buffer.from("fake workshop"), "workshop.jpg");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.roleType, "mechanic");
    assert.equal(vendor.roleType, "mechanic");
    assert.equal(vendor.mechanicDetails.mechanicName, "Unified Mechanic Care");
    assert.equal(vendor.ownerFullName, "Suresh Sharma");
    assert.equal(vendor.location.area, "Sector 62");

    // Test GET /api/vendor/onboarding returns role-specific nested details
    const getResponse = await request(app)
      .get("/api/vendor/onboarding")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.data.roleType, "mechanic");
    assert.equal(getResponse.body.data.mechanicDetails.mechanicName, "Unified Mechanic Care");
    assert.equal(getResponse.body.data.location.area, "Sector 62");
    assert.equal(getResponse.body.data.bankDetails.accountNumber, "123456789012");
  } finally {
    Vendor.findById = originalFindById;
    ShopType.findById = originalShopTypeFindById;
    ProductCategory.findById = originalProductCategoryFindById;
  }
});
