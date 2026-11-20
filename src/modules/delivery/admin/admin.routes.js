const express = require("express");
const { z } = require("zod");
const adminController = require("./admin.controller");
const adminAuth = require("../middleware/adminAuth.middleware");
const validate = require("../middleware/validate.middleware");
const { adminReviewSchema } = require("../onboarding/onboarding.validation");

const router = express.Router();

const listRidersQuerySchema = z
  .object({
    status: z
      .enum(["IN_PROGRESS", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"])
      .optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

const riderIdParamSchema = z
  .object({
    riderId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Must be a valid 24-character ObjectId"),
  })
  .strict();

router.get("/riders", adminAuth, validate({ query: listRidersQuerySchema }), adminController.getRiders);

router.get(
  "/riders/:riderId",
  adminAuth,
  validate({ params: riderIdParamSchema }),
  adminController.getRiderById
);

router.patch(
  "/riders/:riderId/review",
  adminAuth,
  validate({ params: riderIdParamSchema, body: adminReviewSchema }),
  adminController.postRiderReview
);

module.exports = router;
