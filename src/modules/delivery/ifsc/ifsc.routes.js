const express = require("express");
const riderAuth = require("../middleware/riderAuth.middleware");
const validate = require("../middleware/validate.middleware");
const { ifscParamSchema } = require("../onboarding/onboarding.validation");
const { bankProvider } = require("../adapters");
const AppError = require("../lib/AppError");

const router = express.Router();

router.get("/:code", riderAuth, validate({ params: ifscParamSchema }), async (req, res, next) => {
  try {
    const { code } = req.params;
    const bankInfo = await bankProvider.lookupIfsc(code);
    if (!bankInfo) {
      throw new AppError("IFSC_NOT_FOUND", 404, "IFSC code not found");
    }
    return res.status(200).json({
      success: true,
      data: bankInfo,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
