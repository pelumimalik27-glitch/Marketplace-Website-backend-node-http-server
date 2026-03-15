const express = require("express");
const {
  createOrder,
  getOrders,
  getBuyerOrders,
  getSellerOrders,
  trackOrder,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
} = require("./order.controller.js");
const { validateUser } = require("../../middleware/validate_user");
const { sellerAuth } = require("../../middleware/seller_auth");

const orderRouter = express.Router();

orderRouter.post("/", validateUser, createOrder);
orderRouter.get("/", validateUser, getOrders);
orderRouter.get("/buyer/:userId", validateUser, getBuyerOrders);
orderRouter.get("/seller/:sellerId", validateUser, sellerAuth, getSellerOrders);
orderRouter.get("/track/:orderId", trackOrder);
orderRouter.get("/:id", validateUser, getOrderById);
orderRouter.patch("/:id", validateUser, sellerAuth, updateOrderStatus);
orderRouter.patch("/:id/cancel", validateUser, cancelOrder);

module.exports = { orderRouter };
