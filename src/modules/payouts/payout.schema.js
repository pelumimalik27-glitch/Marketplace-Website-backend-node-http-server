const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    status: {
      type: String,
      enum: ["pending", "processing", "success", "failed", "reversed", "cancelled"],
      default: "processing",
    },
    bankName: { type: String, default: "" },
    bankCode: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    accountName: { type: String, default: "" },
    recipientCode: { type: String, default: "" },
    paystackTransferCode: { type: String, default: "" },
    paystackReference: { type: String, default: "" },
    failureReason: { type: String, default: "" },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Payout || mongoose.model("Payout", payoutSchema);
