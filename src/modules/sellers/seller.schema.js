const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema(
{
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  storeName: { type: String, required: true, trim: true },
  storeLogo: { type: String, default: "" },
  contactPhone: { type: String, default: "", trim: true },
  businessAddress: { type: String, default: "", trim: true },
  paymentDetails: { type: String, default: "", trim: true },
  paystackSubaccountCode: { type: String, default: "", trim: true },
  paystackRecipientCode: { type: String, default: "", trim: true },
  bankName: { type: String, default: "", trim: true },
  bankCode: { type: String, default: "", trim: true },
  accountNumber: { type: String, default: "", trim: true },
  accountName: { type: String, default: "", trim: true },
  walletBalance: { type: Number, default: 0 },
  idNumber: { type: String, default: "", trim: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  verificationNotes: { type: String, default: "" }
},
  { timestamps: true }
);

module.exports = mongoose.models.Seller || mongoose.model("Seller", sellerSchema);

