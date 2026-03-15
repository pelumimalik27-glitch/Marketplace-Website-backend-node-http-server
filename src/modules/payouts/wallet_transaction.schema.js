const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    source: {
      type: String,
      enum: ["order", "withdrawal", "adjustment", "withdrawal_reversal"],
      default: "order",
    },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "success",
    },
    reference: { type: String, default: "" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    payout: { type: mongoose.Schema.Types.ObjectId, ref: "Payout" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.WalletTransaction ||
  mongoose.model("WalletTransaction", walletTransactionSchema);
