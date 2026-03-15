const mongoose = require("mongoose");
const { syncAdminFromEnv } = require("../src/modules/admins/admin.bootstrap");

const connectDB = async () => {
  const uri = process.env.DBSTRING?.trim();

  if (!uri) {
    console.warn("DBSTRING is not set. Skipping MongoDB connection.");
    return;
  }

  try {
    mongoose.set("strictPopulate", false);
    await mongoose.connect(uri);
    console.log("✅✅✅MongoDB connected");
      const admin = await syncAdminFromEnv()
    console.log("✅ Admin ready:", admin.email);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

