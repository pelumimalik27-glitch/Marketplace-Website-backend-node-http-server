const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    adminCommissionRate: { type: Number, default: 0, min: 0 },
    adminCommissionType: {
      type: String,
      enum: ["percentage", "flat"],
      default: "percentage",
    },
    minimumWithdrawal: { type: Number, default: 5000, min: 0 },
    currency: { type: String, default: "NGN" },
    payoutMode: { type: String, enum: ["wallet", "split"], default: "wallet" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
