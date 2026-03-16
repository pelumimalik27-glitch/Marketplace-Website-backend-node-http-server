const mongoose = require("mongoose");
const reviewSchema = require("./review.schema.js");
const orderSchema = require("../orders/order.schema");
const productSchema = require("../products/product.schema");

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const isAdmin = (req) => {
  const roles = Array.isArray(req.userData?.roles) ? req.userData.roles : [];
  return roles.some((role) => ADMIN_ROLES.has(String(role || "").toLowerCase()));
};

const recalcProductRating = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) return;
  const objectId = new mongoose.Types.ObjectId(productId);
  const [stats] = await reviewSchema.aggregate([
    { $match: { product: objectId, status: "active" } },
    { $group: { _id: "$product", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const avgRating = Number(stats?.avgRating || 0);
  const count = Number(stats?.count || 0);
  await productSchema.findByIdAndUpdate(objectId, {
    rating: avgRating,
    reviews: count,
  });
};

const createReview = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { product, rating, comment, order } = req.body || {};
    const safeRating = Number(rating);
    if (!product || !order || !Number.isFinite(safeRating)) {
      return res.status(400).json({ success: false, message: "Product, order and rating are required" });
    }
    if (safeRating < 1 || safeRating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const orderDoc = await orderSchema.findById(order).lean();
    if (!orderDoc) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (String(orderDoc.status || "").toLowerCase() !== "completed") {
      return res.status(400).json({ success: false, message: "Reviews are allowed only after order completion" });
    }
    if (String(orderDoc.buyer) !== String(userId)) {
      return res.status(403).json({ success: false, message: "You can only review your own completed orders" });
    }

    const matchingItem = Array.isArray(orderDoc.items)
      ? orderDoc.items.find((item) => String(item?.product) === String(product))
      : null;
    if (!matchingItem) {
      return res.status(400).json({ success: false, message: "Product was not found in this order" });
    }

    const review = await reviewSchema.create({
      user: userId,
      product,
      seller: matchingItem?.seller || null,
      order,
      rating: safeRating,
      comment: String(comment || "").trim(),
      isVerifiedPurchase: true,
    });

    try {
      await recalcProductRating(product);
    } catch (_) {
      // Do not fail review creation if rating aggregation fails.
    }

    return res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this product.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


const getProductReviews = async (req, res) => {
  try {
    const productId = req.params.productId || req.params.id;
    if (!productId) {
      return res.status(400).json({ success: false, message: "Product id is required" });
    }

    const reviews = await reviewSchema
      .find({
        product: productId,
        status: "active",
      })
      .populate("user", "name")
      .sort("-createdAt");

    return res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateReview = async (req, res) => {
  try {
    const review = await reviewSchema.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const userId = String(req.userData?.userId || "");
    if (!isAdmin(req) && String(review.user) !== userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const allowed = ["rating", "comment", "title", "images"];
    const updates = {};
    allowed.forEach((field) => {
      if (field in req.body) {
        updates[field] = req.body[field];
      }
    });

    if (isAdmin(req) && "status" in req.body) {
      updates.status = req.body.status;
    }

    const updated = await reviewSchema.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });

    if ("rating" in updates || "status" in updates) {
      try {
        await recalcProductRating(updated?.product);
      } catch (_) {
        // ignore aggregation failures
      }
    }

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteReview = async (req, res) => {
  try {
    const review = await reviewSchema.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const userId = String(req.userData?.userId || "");
    if (!isAdmin(req) && String(review.user) !== userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await reviewSchema.findByIdAndDelete(req.params.id);

    try {
      await recalcProductRating(review?.product);
    } catch (_) {
      // ignore aggregation failures
    }

    return res.json({
      success: true,
      message: "Review deleted",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { createReview, getProductReviews, updateReview, deleteReview };
