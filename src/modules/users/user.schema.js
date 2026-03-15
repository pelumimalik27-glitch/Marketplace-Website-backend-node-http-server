const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    roles: { type: [String], "type":["buyer","seller","admin"],  default: ["buyer"] },
    isVerified:{
        type: Boolean,
       default: false,
    },
    refreshTokenHash: { type: String, default: "" },
    refreshTokenExpiresAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: "" },
    passwordResetExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
