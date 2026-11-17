const BUSINESS_NAME_FIELDS = {
  shopkeeper: "shopkeeperName",
  restaurant: "restaurantName",
  mechanic: "garageName",
  scrapVendor: "businessName",
};

exports.getDashboard = (req, res) => {
  const vendor = req.vendor;
  const form = vendor.onboardingData || {};
  const businessName = form[BUSINESS_NAME_FIELDS[vendor.onboardingType]] ?? null;

  return res.status(200).json({
    success: true,
    data: {
      vendor: {
        vendorId: String(vendor._id),
        name: form.ownerFullName ?? businessName ?? null,
        businessName,
        type: vendor.onboardingType ?? null,
        isVerified: vendor.onboardingStatus === "approved",
        availabilityStatus: null,
      },
      achievement: {
        title: "Special Achievement Unlock!",
        description:
          "Complete 20 scrap tasks to win a certificate and an exclusive Indore plant.",
        completed: 0,
        target: 20,
      },
      metrics: {
        todaysOrders: { count: 0 },
        pendingOrders: { count: 0 },
        earnings: { amount: 0, currency: "INR", monthlyChangePercent: 0 },
        wallet: { balance: 0, currency: "INR", leaderboardRank: null },
      },
      vendorHub: [
        { key: "food", label: "Food" },
        { key: "mechanic", label: "Mechanic" },
        { key: "scrap", label: "Scrap Booking" },
      ],
      recentActivity: [],
      notifications: [],
      ecoImpact: { carbonOffsetKg: 0, ecoPointsEarned: 0 },
      campaign: {
        title: "Summer Organic Drive",
        description:
          "Boost your visibility by opting into our zero-waste packaging program this summer.",
        actionLabel: "Learn More",
      },
    },
  });
};
