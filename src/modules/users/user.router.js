const express = require("express");
const {
  registerUser,
  loginUser,
  adminLogin,
  refreshSession,
  logoutSession,
  upgradeToSeller,
  getSellerApplicationStatus,
  requestPasswordReset,
  confirmPasswordReset,
} = require("./user.controller");
const { validateUser } = require("../../middleware/validate_user");

const authRouter = express.Router();

authRouter.post("/register", registerUser);
authRouter.post("/login", loginUser);
authRouter.post("/admin/login", adminLogin);
authRouter.post("/refresh", refreshSession);
authRouter.post("/logout", logoutSession);
authRouter.post("/password-reset/request", requestPasswordReset);
authRouter.post("/password-reset/confirm", confirmPasswordReset);
authRouter.put("/upgrade-to-seller", validateUser, upgradeToSeller);
authRouter.get("/seller-application", validateUser, getSellerApplicationStatus);

module.exports = { authRouter };


