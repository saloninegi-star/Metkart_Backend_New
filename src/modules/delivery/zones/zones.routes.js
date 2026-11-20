const express = require("express");
const { z } = require("zod");
const { getZones } = require("./zones.controller");
const validate = require("../middleware/validate.middleware");

const router = express.Router();

const zonesQuerySchema = z
  .object({
    q: z.string().optional(),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

router.get("/", validate({ query: zonesQuerySchema }), getZones);

module.exports = router;
