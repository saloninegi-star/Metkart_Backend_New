const onboardingService = require("./onboarding.service");
const authService = require("../auth/auth.service");

async function getSummary(req, res, next) {
  try {
    const summary = await onboardingService.getSummary(req.rider.id);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function getStatus(req, res, next) {
  try {
    const status = await onboardingService.getStatus(req.rider.id);
    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
}

async function updateContact(req, res, next) {
  try {
    await authService.updateContact(req.rider.id, req.body.phone);
    const summary = await onboardingService.getSummary(req.rider.id);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function putRideType(req, res, next) {
  try {
    const summary = await onboardingService.saveRideType(req.rider.id, req.body.rideType);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function putPreference(req, res, next) {
  try {
    const summary = await onboardingService.savePreference(req.rider.id, req.body.deliveryPreference);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function putWorkArea(req, res, next) {
  try {
    const summary = await onboardingService.saveWorkArea(req.rider.id, req.body);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function putVehicle(req, res, next) {
  try {
    const summary = await onboardingService.saveVehicle(req.rider.id, req.body);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function postAadhaarSendOtp(req, res, next) {
  try {
    const result = await onboardingService.aadhaarSendOtp(req.rider.id, req.body.aadhaarNumber);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function postAadhaarVerifyOtp(req, res, next) {
  try {
    const result = await onboardingService.aadhaarVerifyOtp(req.rider.id, req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function putPanIdentity(req, res, next) {
  try {
    const summary = await onboardingService.savePanIdentity(req.rider.id, req.body);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function postSelfie(req, res, next) {
  try {
    const summary = await onboardingService.saveSelfie(req.rider.id, req.body);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function putKitNominee(req, res, next) {
  try {
    const summary = await onboardingService.saveKitNominee(req.rider.id, req.body);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function postUpiVerify(req, res, next) {
  try {
    const result = await onboardingService.verifyUpi(req.rider.id, req.body.upiId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function putBank(req, res, next) {
  try {
    const summary = await onboardingService.saveBank(req.rider.id, req.body);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
}

async function postSubmit(req, res, next) {
  try {
    const result = await onboardingService.submitOnboarding(req.rider.id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getStatus,
  updateContact,
  putRideType,
  putPreference,
  putWorkArea,
  putVehicle,
  postAadhaarSendOtp,
  postAadhaarVerifyOtp,
  putPanIdentity,
  postSelfie,
  putKitNominee,
  postUpiVerify,
  putBank,
  postSubmit,
};
