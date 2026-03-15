const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const userSchema = require("../users/user.schema");
const adminSchema = require("./admin.schema");

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const getEnvAdminConfig = () => {
  const name = String(process.env.ADMIN_NAME || "").trim();
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || "").trim();
  const role = String(process.env.ADMIN_ROLE || "super_admin").trim();

  return { name, email, password, role };
};

const assertRequired = (value, label) => {
  if (!value) {
    throw new Error(`${label} is required for admin bootstrap`);
  }
};

const syncAdminFromEnv = async () => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB must be connected before syncing admin");
  }

  const config = getEnvAdminConfig();
  assertRequired(config.name, "ADMIN_NAME");
  assertRequired(config.email, "ADMIN_EMAIL");
  assertRequired(config.password, "ADMIN_PASSWORD");

  let user = await userSchema.findOne({ email: config.email });
  const passwordHash = await bcrypt.hash(config.password, 12);

  if (!user) {
    user = await userSchema.create({
      name: config.name,
      email: config.email,
      password: passwordHash,
      roles: ["admin"],
    });
  } else {
    user.name = config.name;
    user.email = config.email;
    user.password = passwordHash;
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.includes("admin")) {
      user.roles = [...new Set([...roles, "admin"])];
    }
    await user.save();
  }

  let adminProfile = await adminSchema.findOne({ user: user._id });
  const defaultPermissions = [
    "manage_sellers",
    "manage_products",
    "manage_orders",
    "manage_disputes",
    "manage_payouts",
    "manage_settings",
  ];

  if (!adminProfile) {
    adminProfile = await adminSchema.create({
      user: user._id,
      role: config.role,
      permissions: defaultPermissions,
      isActive: true,
    });
  } else {
    adminProfile.role = config.role || adminProfile.role;
    if (!Array.isArray(adminProfile.permissions) || adminProfile.permissions.length === 0) {
      adminProfile.permissions = defaultPermissions;
    }
    adminProfile.isActive = true;
    await adminProfile.save();
  }

  return {
    userId: String(user._id),
    adminId: String(adminProfile._id),
    email: user.email,
    role: adminProfile.role,
  };
};

module.exports = { syncAdminFromEnv, getEnvAdminConfig };
