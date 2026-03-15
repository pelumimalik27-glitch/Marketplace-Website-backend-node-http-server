const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const userSchema = require("./user.schema");
const adminSchema = require("../admins/admin.schema");
const sellerSchema = require("../sellers/seller.schema");
const {
  notifyWelcome,
  notifyLoginAlert,
  notifyPasswordReset,
} = require("../../lib/mail.notifier");
const { isDataUrl, uploadImageData } = require("../../lib/cloudinary");

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRETE || "dev-secret";
const ACCESS_TOKEN_EXPIRE = process.env.ACCESS_TOKEN_EXPIRE || process.env.JWT_EXPIRE || "15m";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_EXPIRE = process.env.REFRESH_TOKEN_EXPIRE || "30d";
const SELLER_LOGO_FOLDER =
  process.env.CLOUDINARY_SELLER_FOLDER || "projectmarketplace/sellers";
const PASSWORD_RESET_EXPIRE_MINUTES = Number(
  process.env.PASSWORD_RESET_EXPIRE_MINUTES || 15
);

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const resolveFrontendUrl = () => {
  const raw = String(process.env.PASSWORD_RESET_URL || process.env.FRONTEND_URL || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return raw[0] || "";
};

const buildPasswordResetUrl = (token) => {
  const base = resolveFrontendUrl();
  if (!base) return "";
  const normalizedBase = base.replace(/\/+$/, "");
  return `${normalizedBase}/reset-password?token=${encodeURIComponent(token)}`;
};

const signAccessToken = (user) =>
  jwt.sign(
    {
      userId: user._id,
      email: user.email,
      roles: user.roles,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRE }
  );

const signRefreshToken = (user) =>
  jwt.sign(
    {
      userId: user._id,
      email: user.email,
      tokenType: "refresh",
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRE }
  );

const hashToken = (token = "") =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const normalizeStoreLogo = async (payload = {}) => {
  const hasLogo = Object.prototype.hasOwnProperty.call(payload, "storeLogo");
  if (!hasLogo) return null;
  const raw = String(payload.storeLogo || "").trim();
  if (!raw) return { storeLogo: "" };
  if (isDataUrl(raw)) {
    const uploaded = await uploadImageData(raw, { folder: SELLER_LOGO_FOLDER });
    const url = uploaded?.secure_url || uploaded?.url || "";
    return { storeLogo: url || raw };
  }
  return { storeLogo: raw };
};

const issueSessionTokens = async (user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const decoded = jwt.decode(refreshToken);

  user.refreshTokenHash = hashToken(refreshToken);
  user.refreshTokenExpiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;
  await user.save();

  return { accessToken, refreshToken };
};

const toAuthUser = (user) => ({
  userId: user._id,
  name: user.name,
  email: user.email,
  roles: user.roles,
  isVerified: Boolean(user.isVerified),
});

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "name, email and password are required" });
    }

    const existing = await userSchema.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const user = await userSchema.create({
      name,
      email,
      password: hashPassword,
      roles: ["buyer"],
    });

    notifyWelcome({ email: user.email, name: user.name }).catch((error) => {
      console.error(`Failed to send welcome email to ${user.email}: ${error.message}`);
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful. Verify OTP before login.",
      data: {
        user: {
          userId: user._id,
          name: user.name,
          email: user.email,
          roles: user.roles,
          isVerified: Boolean(user.isVerified),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userSchema.findOne({ email });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Email not verified. Please verify OTP before login.",
      });
    }

    if (user.roles.includes("admin")) {
      return res.status(403).json({
        success: false,
        message: "Admin account must use /auth/admin/login",
      });
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user);

    notifyWelcome({ email: user.email, name: user.name }).catch((error) => {
      console.error(`Failed to send welcome email on login to ${user.email}: ${error.message}`);
    });

    notifyLoginAlert({ email: user.email, name: user.name }).catch((error) => {
      console.error(`Failed to send login alert email to ${user.email}: ${error.message}`);
    });

    return res.status(200).json({
      success: true,
      message: "login Successfully",
      data: {
        accessToken,
        refreshToken,
        user: {
          userId: user._id,
          name: user.name,
          email: user.email,
          roles: user.roles,
          isVerified: Boolean(user.isVerified),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await userSchema.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.roles.includes("admin")) {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }

    const admin = await adminSchema.findOne({ user: user._id, isActive: true });
    if (!admin) {
      return res.status(403).json({ success: false, message: "Admin account not active" });
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user);

    admin.lastLogin = new Date();
    await admin.save();

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          userId: user._id,
          name: user.name,
          email: user.email,
          roles: user.roles,
          adminRole: admin.role,
          permissions: admin.permissions || [],
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const refreshSession = async (req, res) => {
  try {
    const refreshToken =
      String(req.body?.refreshToken || req.headers["x-refresh-token"] || "").trim();

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: "Refresh token is required" });
    }

    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (payload?.tokenType && payload.tokenType !== "refresh") {
      return res.status(401).json({ success: false, message: "Invalid refresh token type" });
    }

    const user = await userSchema.findById(payload?.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid refresh token" });
    }

    if (!user.refreshTokenHash || user.refreshTokenHash !== hashToken(refreshToken)) {
      return res.status(401).json({ success: false, message: "Refresh token revoked" });
    }

    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt.getTime() < Date.now()) {
      user.refreshTokenHash = "";
      user.refreshTokenExpiresAt = null;
      await user.save();
      return res.status(401).json({ success: false, message: "Refresh token expired" });
    }

    const { accessToken, refreshToken: newRefreshToken } = await issueSessionTokens(user);

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        user: toAuthUser(user),
      },
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
  }
};

const logoutSession = async (req, res) => {
  try {
    const refreshToken =
      String(req.body?.refreshToken || req.headers["x-refresh-token"] || "").trim();

    if (!refreshToken) {
      return res.status(200).json({ success: true, message: "Logged out" });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    } catch (_) {
      return res.status(200).json({ success: true, message: "Logged out" });
    }

    const user = await userSchema.findById(payload?.userId);
    if (!user) {
      return res.status(200).json({ success: true, message: "Logged out" });
    }

    if (user.refreshTokenHash === hashToken(refreshToken)) {
      user.refreshTokenHash = "";
      user.refreshTokenExpiresAt = null;
      await user.save();
    }

    return res.status(200).json({ success: true, message: "Logged out" });
  } catch (error) {
    return res.status(200).json({ success: true, message: "Logged out" });
  }
};

const upgradeToSeller = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      storeName,
      storeDescription,
      contactPhone,
      businessAddress,
      paymentDetails,
      idNumber,
    } = req.body || {};

    if (!storeName || typeof storeName !== "string" || !storeName.trim()) {
      return res.status(400).json({ success: false, message: "storeName is required" });
    }
    if (!contactPhone || typeof contactPhone !== "string" || !contactPhone.trim()) {
      return res.status(400).json({ success: false, message: "contactPhone is required" });
    }
    if (!paymentDetails || typeof paymentDetails !== "string" || !paymentDetails.trim()) {
      return res.status(400).json({ success: false, message: "paymentDetails is required" });
    }
    if (!idNumber || typeof idNumber !== "string" || !idNumber.trim()) {
      return res.status(400).json({ success: false, message: "idNumber is required" });
    }

    const user = await userSchema.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const trimmedStoreName = storeName.trim();
    const trimmedDescription =
      typeof storeDescription === "string" ? storeDescription.trim() : "";
    const logoPatch = await normalizeStoreLogo(req.body);
    const normalizedPayload = {
      storeName: trimmedStoreName,
      contactPhone: contactPhone.trim(),
      businessAddress: typeof businessAddress === "string" ? businessAddress.trim() : "",
      paymentDetails: paymentDetails.trim(),
      idNumber: idNumber.trim(),
      verificationNotes: trimmedDescription,
      ...(logoPatch || {}),
    };

    let sellerApplication = await sellerSchema.findOne({ user: user._id });

    if (!sellerApplication) {
      sellerApplication = await sellerSchema.create({
        user: user._id,
        ...normalizedPayload,
        status: "pending",
      });
      return res.status(200).json({
        success: true,
        message: "Seller application submitted. Waiting for admin approval.",
        data: {
          user: toAuthUser(user),
          sellerApplication,
        },
      });
    }

    if (sellerApplication.status === "approved") {
      const roles = Array.isArray(user.roles) ? user.roles : [];
      if (!roles.includes("seller")) {
        user.roles = [...new Set([...roles, "seller"])];
        await user.save();
      }
      const accessToken = signAccessToken(user);
      return res.status(200).json({
        success: true,
        message: "Seller account already approved.",
        data: {
          accessToken,
          user: toAuthUser(user),
          sellerApplication,
        },
      });
    }

    sellerApplication.storeName = normalizedPayload.storeName;
    sellerApplication.contactPhone = normalizedPayload.contactPhone;
    sellerApplication.businessAddress = normalizedPayload.businessAddress;
    sellerApplication.paymentDetails = normalizedPayload.paymentDetails;
    sellerApplication.idNumber = normalizedPayload.idNumber;
    sellerApplication.verificationNotes = normalizedPayload.verificationNotes;

    if (sellerApplication.status === "rejected") {
      sellerApplication.status = "pending";
    }

    await sellerApplication.save();

    return res.status(200).json({
      success: true,
      message:
        sellerApplication.status === "pending"
          ? "Seller application submitted. Waiting for admin approval."
          : "Seller application updated.",
      data: {
        user: toAuthUser(user),
        sellerApplication,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSellerApplicationStatus = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await userSchema.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const sellerApplication = await sellerSchema.findOne({ user: user._id });

    if (!sellerApplication) {
      return res.status(200).json({
        success: true,
        data: {
          user: toAuthUser(user),
          sellerApplication: null,
        },
      });
    }

    const currentRoles = Array.isArray(user.roles) ? user.roles : [];
    if (sellerApplication.status === "approved" && !currentRoles.includes("seller")) {
      user.roles = [...new Set([...currentRoles, "seller"])];
      await user.save();
    }

    const responseData = {
      user: toAuthUser(user),
      sellerApplication,
    };

    if (sellerApplication.status === "approved") {
      responseData.accessToken = signAccessToken(user);
    }

    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const requestPasswordReset = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await userSchema.findOne({ email });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If the email exists, a reset link has been sent.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.passwordResetTokenHash = hashToken(token);
    user.passwordResetExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_EXPIRE_MINUTES * 60 * 1000
    );
    await user.save();

    const resetUrl = buildPasswordResetUrl(token);
    notifyPasswordReset({
      recipientEmail: user.email,
      recipientName: user.name,
      resetUrl,
      expiresIn: `${PASSWORD_RESET_EXPIRE_MINUTES} minutes`,
    }).catch((error) => {
      console.error(`Password reset email failed: ${error.message}`);
    });

    return res.status(200).json({
      success: true,
      message: "If the email exists, a reset link has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const confirmPasswordReset = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "").trim();

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and password are required",
      });
    }

    const tokenHash = hashToken(token);
    const user = await userSchema.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = "";
    user.passwordResetExpiresAt = null;
    user.refreshTokenHash = "";
    user.refreshTokenExpiresAt = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful. Please login.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  adminLogin,
  refreshSession,
  logoutSession,
  upgradeToSeller,
  getSellerApplicationStatus,
  requestPasswordReset,
  confirmPasswordReset,
};
