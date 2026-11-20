const { listZones } = require("./zones.service");

async function getZones(req, res, next) {
  try {
    const { q, lat, lng, limit } = req.query;
    const zones = await listZones({ q, lat, lng, limit });
    return res.status(200).json({
      success: true,
      data: zones,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getZones,
};
