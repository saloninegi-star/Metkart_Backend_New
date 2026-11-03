function getCurrentAccount(req, res) {
  return res.json({ success: true, data: { account: req.account.toSafeJSON() } });
}

module.exports = { getCurrentAccount };
