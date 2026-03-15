const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
{
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Seller"
  },
    order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order"
  },
  rating: { type: Number, min: 1, max: 5, required: true },
    title: {
    type: String,
    maxLength: 120
  },
   images: [
    {
      type: String
    }
  ],
  comment: { type: String, default: "" },
    isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
   helpfulVotes: {
    type: Number,
    default: 0
  },
    status: {
    type: String,
    enum: ["active", "hidden", "flagged"],
    default: "active"
  }
},
  { timestamps: true }
);
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
module.exports = mongoose.models.Review || mongoose.model("Review", reviewSchema);

