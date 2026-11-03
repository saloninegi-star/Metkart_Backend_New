const Account = require("./account.model");

async function getAccountById(id) {
  return Account.findById(id).select("+tokenVersion");
}

module.exports = { getAccountById };
