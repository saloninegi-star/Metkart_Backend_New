const adminService = require("./admin.service");

async function getRiders(req, res, next) {
  try {
    const { status, q, page, limit } = req.query;
    const result = await adminService.listRiders({ status, q, page, limit });
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function getRiderById(req, res, next) {
  try {
    const { riderId } = req.params;
    const result = await adminService.getRiderDetail(req.admin.id, riderId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function postRiderReview(req, res, next) {
  try {
    const { riderId } = req.params;
    const result = await adminService.reviewRider(req.admin.id, riderId, req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRiders,
  getRiderById,
  postRiderReview,
};
