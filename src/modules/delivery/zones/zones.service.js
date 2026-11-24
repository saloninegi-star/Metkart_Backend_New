const { Zone } = require("../models");

async function listZones({ q, lat, lng, limit = 20 }) {
  const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = { isActive: true };

  if (q && typeof q === "string" && q.trim().length > 0) {
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { city: { $regex: escaped, $options: "i" } },
    ];
  }

  let zones;
  const hasGeo = lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng));

  if (hasGeo) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    zones = await Zone.find({
      ...filter,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        },
      },
    })
      .limit(parsedLimit)
      .lean();
  } else {
    zones = await Zone.find(filter).limit(parsedLimit).lean();
  }

  return zones.map((z) => ({
    id: z._id,
    name: z.name,
    city: z.city,
    radiusKm: z.radiusKm,
    demandLevel: z.demandLevel,
    activeOrders: z.activeOrders || 0,
    center: {
      lat: z.centerLat,
      lng: z.centerLng,
    },
  }));
}

module.exports = {
  listZones,
};
