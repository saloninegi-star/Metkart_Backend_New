const authService = require("./auth.service");

async function register(req, res, next) {
  try {
    const result = await authService.registerRider(req.body);
    const statusCode = result.isResend ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      data: {
        userId: result.userId,
        email: result.email,
        resendAfterSeconds: result.resendAfterSeconds,
        expiresInSeconds: result.expiresInSeconds,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const result = await authService.verifyOtp(req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function resendOtp(req, res, next) {
  try {
    const result = await authService.resendOtp(req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.loginRider(req.body);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refreshTokens(req.body.refreshToken);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  refresh,
};
