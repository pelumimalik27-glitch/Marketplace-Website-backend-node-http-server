const mongoose = require("mongoose");

const commissionRuleSchema = new mongoose.Schema(
{
  scope: { type: String, enum: ["global", "category", "seller"], default: "global" },
  category: { type: String, default: null },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null },
  commissionRate: { type: Number, required: true, min: 0 },
  commissionType: { type: String, enum: ["percentage", "flat"], default: "percentage" },
  effectiveFrom: { type: Date, default: Date.now }
},
  { timestamps: true }
);

module.exports = mongoose.models.CommissionRule || mongoose.model("CommissionRule", commissionRuleSchema);

