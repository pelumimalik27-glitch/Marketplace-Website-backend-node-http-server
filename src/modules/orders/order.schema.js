const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
{
    orderId:{
        type:String,
    },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      seller: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true },
      total: { type: Number, required: true }
    }
  ],
  summary: {
    subtotal: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  status: { type: String, enum: ["pending", "processing", "shipped", "completed", "cancelled"], default: "pending" },
  paymentReference:String,
  trackingEmailSentAt: { type: Date, default: null },
   deliveryAddress:{
        type:String,
        minLength:10
    },
    deliveryPhone:{
        type:String,
        minLength:11,
        maxLength:15,
        required:true
    },

},
  { timestamps: true }
);

orderSchema.virtual("user", {
  ref: "User",
  localField: "buyer",
  foreignField: "_id",
  justOne: true,
});

orderSchema.set("toObject", { virtuals: true });
orderSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);

