const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
{
  name: { type: String, required: true, trim: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
  slug: { type: String, unique: true, sparse: true },
  isActive: { type: Boolean, default: true }
},
  { timestamps: true }
);

module.exports = mongoose.models.Category || mongoose.model("Category", categorySchema);

