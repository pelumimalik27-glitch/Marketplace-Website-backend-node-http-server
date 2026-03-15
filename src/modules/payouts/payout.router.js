const express = require("express");
const { validateUser } = require("../../middleware/validate_user");
const { sellerAuth } = require("../../middleware/seller_auth");
const {
  getBankList,
  getWalletSummary,
  getWalletTransactions,
  requestWithdrawal,
} = require("./payout.controller");

const payoutRouter = express.Router();

payoutRouter.get("/wallet", validateUser, sellerAuth, getWalletSummary);
payoutRouter.get("/banks", validateUser, getBankList);
payoutRouter.get("/transactions", validateUser, sellerAuth, getWalletTransactions);
payoutRouter.post("/withdraw", validateUser, sellerAuth, requestWithdrawal);

module.exports = { payoutRouter };
