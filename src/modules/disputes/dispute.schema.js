const mongoose = require("mongoose");

const disputeSchema = new mongoose.Schema(
{
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ["open", "resolved", "closed"], default: "open" }
},
  { timestamps: true }
);

module.exports = mongoose.models.Dispute || mongoose.model("Dispute", disputeSchema);

