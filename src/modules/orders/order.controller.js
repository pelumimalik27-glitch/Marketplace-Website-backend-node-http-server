const Order = require("./order.schema.js");
const sellerSchema = require("../sellers/seller.schema");
const userSchema = require("../users/user.schema");
const { emitToUsers, emitToTracking } = require("../../lib/socket");
const { notifyOrderConfirmation, notifySellerNewOrder } = require("../../lib/mail.notifier");

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const STATUS_OPTIONS = new Set(["pending", "processing", "shipped", "completed", "cancelled"]);
const TRACKING_PREFIX = "ORD";

const resolveFrontendUrl = () => {
  const raw = String(process.env.FRONTEND_URL || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  return raw[0] || "";
};

const buildOrderUrl = (orderId) => {
  const base = resolveFrontendUrl();
  return base ? `${base.replace(/\/+$/, "")}/orders/${orderId}` : "";
};

const isAdmin = (req) => {
  const roles = Array.isArray(req.userData?.roles) ? req.userData.roles : [];
  return roles.some((role) => ADMIN_ROLES.has(String(role || "").toLowerCase()));
};

const buildDeliveryAddress = (shippingInfo = {}) => {
  const parts = [
    shippingInfo.address,
    shippingInfo.city,
    shippingInfo.zipCode,
    shippingInfo.country,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.join(", ");
};

const createOrder = async (req, res) => {
  try {
    const buyerId = req.userData?.userId || req.body?.buyer;
    if (!buyerId) {
      return res.status(400).json({ success: false, message: "Buyer is required" });
    }

    const {
      items,
      summary,
      deliveryAddress,
      deliveryPhone,
      paymentReference,
      shippingInfo,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Order items are required" });
    }

    const resolvedAddress =
      String(deliveryAddress || "").trim() || buildDeliveryAddress(shippingInfo || {});
    const resolvedPhone =
      String(deliveryPhone || "").trim() || String(shippingInfo?.phone || "").trim();

    if (!resolvedAddress) {
      return res.status(400).json({ success: false, message: "Delivery address is required" });
    }
    if (!resolvedPhone) {
      return res.status(400).json({ success: false, message: "Delivery phone is required" });
    }

    const order = await Order.create({
      orderId: `${TRACKING_PREFIX}-${Date.now()}`,
      buyer: buyerId,
      items,
      summary,
      deliveryAddress: resolvedAddress,
      deliveryPhone: resolvedPhone,
      paymentReference,
    });

    res.status(201).json({
      success: true,
      data: order,
    });

    const orderUrl = buildOrderUrl(order._id);
    const orderTotal = order?.summary?.total ? String(order.summary.total) : "";

    userSchema
      .findById(buyerId)
      .select("name email")
      .lean()
      .then((buyer) => {
        if (!buyer?.email) return;
        return notifyOrderConfirmation({
          recipientEmail: buyer.email,
          recipientName: buyer.name,
          orderId: order.orderId,
          total: orderTotal,
          orderUrl,
        });
      })
      .catch((error) => {
        console.error(`Order confirmation email failed: ${error?.message || error}`);
      });

    const sellerIds = Array.from(
      new Set(
        (order.items || [])
          .map((item) => String(item?.seller || ""))
          .filter(Boolean)
      )
    );

    if (sellerIds.length) {
      sellerSchema
        .find({ _id: { $in: sellerIds } })
        .populate("user", "name email")
        .lean()
        .then((sellers) => {
          sellers.forEach((seller) => {
            const user = seller?.user || {};
            if (!user?.email) return;
            notifySellerNewOrder({
              recipientEmail: user.email,
              recipientName: user.name || seller?.storeName,
              orderId: order.orderId,
              total: orderTotal,
              orderUrl,
            }).catch((error) => {
              console.error(`Seller new order email failed: ${error?.message || error}`);
            });
          });
        })
        .catch((error) => {
          console.error(`Seller lookup for order emails failed: ${error?.message || error}`);
        });
    }

    return;
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getOrders = async (req, res) => {
  try {

    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const orders = await Order.find()
      .populate("buyer", "name email")
      .populate("items.product")
      .populate("items.seller")
      .sort("-createdAt");

    return res.status(200).json({
      success: true,
      data: orders
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const trackOrder = async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order id is required" });
    }

    const order = await Order.findOne({ orderId })
      .populate("items.product", "name image price")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getBuyerOrders = async (req, res) => {
  try {
    const userId = String(req.params.userId || "");
    const requesterId = String(req.userData?.userId || "");
    if (!userId) {
      return res.status(400).json({ success: false, message: "User id is required" });
    }
    if (userId !== requesterId && !isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const orders = await Order.find({ buyer: userId })
      .populate("buyer", "name email")
      .populate("items.product")
      .populate("items.seller")
      .sort("-createdAt");

    return res.status(200).json({
      success: true,
      data: orders
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};


const getSellerOrders = async (req, res) => {
  try {
    const sellerId = String(req.params.sellerId || "");
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "Seller id is required" });
    }

    if (!isAdmin(req)) {
      const sellerProfile = await sellerSchema
        .findOne({ user: req.userData?.userId })
        .select("_id")
        .lean();
      if (!sellerProfile || String(sellerProfile._id) !== sellerId) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    const orders = await Order.find({
      "items.seller": sellerId,
    })
      .populate("buyer", "name email")
      .populate("items.product")
      .populate("items.seller")
      .sort("-createdAt");

    return res.status(200).json({
      success: true,
      data: orders
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const getOrderById = async (req, res) => {
  try {

    const order = await Order.findById(req.params.id)
      .populate("buyer", "name email")
      .populate("items.product")
      .populate("items.seller");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (!isAdmin(req)) {
      const requesterId = String(req.userData?.userId || "");
      const isBuyer = String(order?.buyer?._id || order?.buyer || "") === requesterId;
      if (!isBuyer) {
        const sellerProfile = await sellerSchema
          .findOne({ user: req.userData?.userId })
          .select("_id")
          .lean();
        const sellerId = String(sellerProfile?._id || "");
        const matchesSeller = Array.isArray(order?.items)
          ? order.items.some((item) => String(item?.seller?._id || item?.seller || "") === sellerId)
          : false;
        if (!matchesSeller) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: order,
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const updateOrderStatus = async (req, res) => {
  try {

    const nextStatus = String(req.body?.status || "").toLowerCase();
    if (!STATUS_OPTIONS.has(nextStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    if (!isAdmin(req)) {
      const sellerProfile = await sellerSchema
        .findOne({ user: req.userData?.userId })
        .select("_id")
        .lean();
      const sellerId = String(sellerProfile?._id || "");
      if (!sellerId) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      const orderMatch = await Order.findOne({
        _id: req.params.id,
        "items.seller": sellerId,
      }).select("_id");
      if (!orderMatch) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: nextStatus },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    if (order?.buyer) {
      emitToUsers([String(order.buyer)], "order:updated", {
        orderId: String(order._id),
        orderCode: order.orderId,
        status: order.status,
        updatedAt: order.updatedAt || new Date().toISOString(),
      });
    }
    if (order?.orderId) {
      emitToTracking(order.orderId, "order:tracked", {
        orderId: String(order._id),
        orderCode: order.orderId,
        status: order.status,
        updatedAt: order.updatedAt || new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};

const cancelOrder = async (req, res) => {
  try {

    if (!isAdmin(req)) {
      const requesterId = String(req.userData?.userId || "");
      const orderMatch = await Order.findOne({
        _id: req.params.id,
        buyer: requesterId,
      }).select("_id");
      if (!orderMatch) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });

  }
};
module.exports = { 
   createOrder,
  getOrders,
  getBuyerOrders,
  getSellerOrders,
  trackOrder,
  getOrderById,
  updateOrderStatus,
  cancelOrder
};
