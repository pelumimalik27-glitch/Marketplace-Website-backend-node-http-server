const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { syncAdminFromEnv } = require("../src/modules/admins/admin.bootstrap");

async function createAdmin() {
  try {
    const uri = process.env.DBSTRING?.trim();
    if (!uri) {
      throw new Error("DBSTRING is required in backend/.env");
    }
    await mongoose.connect(uri);

    const result = await syncAdminFromEnv();
    console.log(`Admin setup complete for ${result.email} (${result.role}).`);
  } catch (error) {
    console.error("createAdmin failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

createAdmin();
