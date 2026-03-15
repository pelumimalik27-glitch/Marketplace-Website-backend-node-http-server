const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
{
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", default: null },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  image: { type: String, default: "" },
  images: [{ type: String }],
  price: { type: Number, required: true, min: 0 },
  category: { type: String, default: "" },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 },
  freeShipping: { type: Boolean, default: false },
  inStock: { type: Boolean, default: true },
  specs: { type: mongoose.Schema.Types.Mixed, default: {} },
  inventory: {
    quantity: { type: Number, default: 0 }
  },
  status: { type: String, enum: ["pending", "approved", "rejected", "active", "inactive"], default: "pending" }
},
  { timestamps: true }
);

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);

