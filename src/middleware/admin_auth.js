const jwt = require("jsonwebtoken");

const adminAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = header.slice(7).trim();
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRETE || "dev-secret");
    const roles = Array.isArray(payload.roles)
      ? payload.roles
      : payload.role
        ? [payload.role]
        : [];

    if (!roles.includes("admin")) {
      return res.status(403).json({ success: false, message: "Forbidden: Admin access only" });
    }

    req.userData = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = { adminAuth };
