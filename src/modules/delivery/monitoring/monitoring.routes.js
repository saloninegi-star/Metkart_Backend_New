const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

let requestCount = 0;
const routeMetrics = new Map();

function trackMetric(route, status, latencyMs) {
  requestCount += 1;
  const key = `${route} [${status}]`;
  const existing = routeMetrics.get(key) || { count: 0, totalLatency: 0 };
  existing.count += 1;
  existing.totalLatency += latencyMs;
  routeMetrics.set(key, existing);
}

// GET /healthz
router.get("/healthz", (req, res) => {
  return res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// GET /readyz
router.get("/readyz", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ status: "unready", database: "disconnected" });
    }
    await mongoose.connection.db.admin().ping();
    return res.status(200).json({ status: "ready", database: "connected" });
  } catch (err) {
    return res.status(503).json({ status: "unready", error: err.message });
  }
});

// GET /metrics
router.get("/metrics", (req, res) => {
  const routesSummary = {};
  for (const [k, v] of routeMetrics.entries()) {
    routesSummary[k] = {
      count: v.count,
      avgLatencyMs: Math.round(v.totalLatency / v.count),
    };
  }

  return res.status(200).json({
    totalRequests: requestCount,
    uptimeSeconds: Math.floor(process.uptime()),
    routes: routesSummary,
  });
});

module.exports = {
  monitoringRoutes: router,
  trackMetric,
};
