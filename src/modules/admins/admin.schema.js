const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
{
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, default: "moderator" },
  permissions: [{ type: String }],
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date }
},
  { timestamps: true }
);

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

