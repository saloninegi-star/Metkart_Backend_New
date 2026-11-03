const express = require("express");
const { getCurrentAccount } = require("./account.controller");

function createAccountRoutes(authenticate) {
  const router = express.Router();
  router.get("/me", authenticate, getCurrentAccount);
  return router;
}

module.exports = createAccountRoutes;
