const sellerAuth = (req, res, next) => {
  const roles = Array.isArray(req.userData?.roles)
    ? req.userData.roles
    : req.userData?.role
      ? [req.userData.role]
      : [];

  if (roles.includes("seller") || roles.includes("admin")) {
    return next();
  }

  return res.status(403).json({ success: false, message: "Forbidden: Seller access only" });
};

module.exports = { sellerAuth };
