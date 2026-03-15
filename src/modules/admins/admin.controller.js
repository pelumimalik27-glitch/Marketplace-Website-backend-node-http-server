const adminSchema = require("./admin.schema.js");
const sellerSchema = require("../sellers/seller.schema");
const disputeSchema = require("../disputes/dispute.schema");
const orderSchema = require("../orders/order.schema");
const userSchema = require("../users/user.schema");
const settingsSchema = require("../settings/settings.schema");
const { notifySellerApproval } = require("../../lib/mail.notifier");

const create = async (req, res) => {
  try {
    const doc = await adminSchema.create(req.body);
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const docs = await adminSchema.find().sort("-createdAt");
    return res.status(200).json({ success: true, data: docs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getPendingSellers = async (req, res) => {
  try {
    const sellers = await sellerSchema
      .find({ status: "pending" })
      .populate("user", "name email")
      .sort("-createdAt");

    return res.status(200).json({ success: true, data: sellers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveSellerApplication = async (req, res) => {
  try {
    const seller = await sellerSchema.findById(req.params.sellerId).populate("user");
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller application not found" });
    }

    seller.status = "approved";
    if (typeof req.body?.verificationNotes === "string") {
      seller.verificationNotes = req.body.verificationNotes.trim();
    }
    await seller.save();

    const user = await userSchema.findById(seller.user?._id || seller.user);
    if (user) {
      const roles = Array.isArray(user.roles) ? user.roles : [];
      if (!roles.includes("seller")) {
        user.roles = [...new Set([...roles, "seller"])];
        await user.save();
      }

      notifySellerApproval({ email: user.email, name: user.name }).catch((error) => {
        console.error(`Failed to send seller approval email to ${user.email}: ${error.message}`);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Seller application approved",
      data: seller,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const rejectSellerApplication = async (req, res) => {
  try {
    const seller = await sellerSchema.findById(req.params.sellerId).populate("user");
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller application not found" });
    }

    seller.status = "rejected";
    if (typeof req.body?.verificationNotes === "string") {
      seller.verificationNotes = req.body.verificationNotes.trim();
    }
    await seller.save();

    const user = await userSchema.findById(seller.user?._id || seller.user);
    if (user) {
      const roles = (Array.isArray(user.roles) ? user.roles : []).filter((role) => role !== "seller");
      user.roles = roles;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "Seller application rejected",
      data: seller,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const getDisputes = async (req, res) => {
  try {
    const status = req.query.status;
    const filter = status ? { status } : {};
    const disputes = await disputeSchema
      .find(filter)
      .populate("orderId", "summary status")
      .populate("buyerId", "name email")
      .populate("sellerId", "storeName")
      .sort("-createdAt");

    return res.status(200).json({ success: true, data: disputes });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getPlatformAnalytics = async (req, res) => {
  try {
    const [totalSellers, totalUsers, totalOrders, openDisputes, revenueAgg] =
      await Promise.all([
        sellerSchema.countDocuments({}),
        userSchema.countDocuments({}),
        orderSchema.countDocuments({}),
        disputeSchema.countDocuments({ status: "open" }),
        orderSchema.aggregate([
          { $group: { _id: null, totalRevenue: { $sum: "$summary.total" } } },
        ]),
      ]);

    const data = {
      sellers: totalSellers,
      users: totalUsers,
      orders: totalOrders,
      openDisputes,
      revenue: revenueAgg[0]?.totalRevenue || 0,
    };

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAnalytics = async (req, res) => getPlatformAnalytics(req, res);

const getSettings = async (req, res) => {
  try {
    const settings = await settingsSchema.findOne().lean();
    if (!settings) {
      return res.status(200).json({ success: true, data: null });
    }

    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await adminSchema.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateById = async (req, res) => {
  try {
    const doc = await adminSchema.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeById = async (req, res) => {
  try {
    const doc = await adminSchema.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    return res.status(200).json({ success: true, message: "Admin deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};

