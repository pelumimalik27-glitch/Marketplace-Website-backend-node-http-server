const express = require("express");
const {
  create,
  list,
  getAnalytics,
  getPlatformAnalytics,
  getPendingSellers,
  approveSellerApplication,
  rejectSellerApplication,
  getDisputes,
  getById,
  updateById,
  removeById,
} = require("./admin.controller.js");
const { adminAuth } = require("../../middleware/admin_auth");
const { commissionRuleRouter } = require("../commission_rules/commission.router");
const { settingsRouter } = require("../settings/settings.router");

const adminRouter = express.Router();

adminRouter.use(adminAuth);

adminRouter.post("/", create);
adminRouter.get("/", list);
adminRouter.get("/analytics", getAnalytics);
adminRouter.get("/platform-analytics", getPlatformAnalytics);
adminRouter.use("/settings", settingsRouter);
adminRouter.use("/commission", commissionRuleRouter);
adminRouter.use("/commission-rules", commissionRuleRouter);
adminRouter.get("/pending-sellers", getPendingSellers);
adminRouter.patch("/pending-sellers/:sellerId/approve", approveSellerApplication);
adminRouter.patch("/pending-sellers/:sellerId/reject", rejectSellerApplication);
adminRouter.get("/disputes", getDisputes);
adminRouter.get("/:id", getById);
adminRouter.patch("/:id", updateById);
adminRouter.delete("/:id", removeById);

module.exports = { adminRouter };

