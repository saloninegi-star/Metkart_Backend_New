const { Zone } = require("../models");

const SEED_ZONES = [
  {
    _id: "zone-medipally",
    name: "Medipally and Uppal Hub (Zone 04)",
    city: "Hyderabad East",
    radiusKm: 6,
    demandLevel: "HIGH",
    centerLat: 17.3984,
    centerLng: 78.5583,
    location: {
      type: "Point",
      coordinates: [78.5583, 17.3984], // [lng, lat]
    },
    activeOrders: 0,
    isActive: true,
  },
  {
    _id: "zone-hitech",
    name: "Hitech City and Madhapur (Cyber Hub)",
    city: "Hyderabad West",
    radiusKm: 7,
    demandLevel: "SURGE",
    centerLat: 17.4435,
    centerLng: 78.3772,
    location: {
      type: "Point",
      coordinates: [78.3772, 17.4435],
    },
    activeOrders: 0,
    isActive: true,
  },
  {
    _id: "zone-gachibowli",
    name: "Gachibowli and Kondapur (Financial Dist)",
    city: "Hyderabad West",
    radiusKm: 8,
    demandLevel: "VERY_HIGH",
    centerLat: 17.4401,
    centerLng: 78.3489,
    location: {
      type: "Point",
      coordinates: [78.3489, 17.4401],
    },
    activeOrders: 0,
    isActive: true,
  },
  {
    _id: "zone-banjara",
    name: "Banjara Hills and Jubilee Hills (Central)",
    city: "Hyderabad Central",
    radiusKm: 5,
    demandLevel: "SURGE",
    centerLat: 17.4156,
    centerLng: 78.4354,
    location: {
      type: "Point",
      coordinates: [78.4354, 17.4156],
    },
    activeOrders: 0,
    isActive: true,
  },
  {
    _id: "zone-secunderabad",
    name: "Secunderabad and Begumpet (North Zone)",
    city: "Secunderabad",
    radiusKm: 6,
    demandLevel: "HIGH",
    centerLat: 17.4399,
    centerLng: 78.4983,
    location: {
      type: "Point",
      coordinates: [78.4983, 17.4399],
    },
    activeOrders: 0,
    isActive: true,
  },
  {
    _id: "zone-kukatpally",
    name: "Kukatpally and KPHB Colony (Zone 09)",
    city: "Hyderabad North-West",
    radiusKm: 6,
    demandLevel: "VERY_HIGH",
    centerLat: 17.4933,
    centerLng: 78.3914,
    location: {
      type: "Point",
      coordinates: [78.3914, 17.4933],
    },
    activeOrders: 0,
    isActive: true,
  },
];

async function seedZones() {
  for (const zoneData of SEED_ZONES) {
    await Zone.findByIdAndUpdate(zoneData._id, zoneData, { upsert: true, new: true });
  }
}

module.exports = {
  SEED_ZONES,
  seedZones,
};
