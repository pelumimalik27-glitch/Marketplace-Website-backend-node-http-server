const jwt = require("jsonwebtoken");
const userSchema = require("../modules/users/user.schema");

const validateUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization || req.headers.Authorization || "";
    const bearerToken =
      typeof header === "string"
        ? (header.startsWith("Bearer ") ? header.slice(7) : header).trim()
        : "";
    const fallbackToken = String(
      req.headers["x-access-token"] ||
        req.headers["x-auth-token"] ||
        req.body?.token ||
        req.query?.token ||
        ""
    ).trim();
    const token = bearerToken || fallbackToken;

    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRETE || "dev-secret");
    const userId = payload?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Invalid token payload" });
    }

    const user = await userSchema.findById(userId).select("_id email roles").lean();
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    req.userData = {
      ...payload,
      userId: String(user._id),
      email: user.email,
      roles: Array.isArray(user.roles) ? user.roles : [],
    };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = { validateUser };
