const settingsSchema = require("./settings.schema");

const ensureSettings = async () => {
  let settings = await settingsSchema.findOne();
  if (!settings) {
    settings = await settingsSchema.create({});
  }
  return settings;
};

const normalizePayload = (payload = {}) => {
  const rateRaw = payload.adminCommissionRate;
  const minRaw = payload.minimumWithdrawal;

  return {
    adminCommissionRate:
      rateRaw === 0 || rateRaw
        ? Number(rateRaw)
        : Number.NaN,
    adminCommissionType:
      String(payload.adminCommissionType || "").toLowerCase() === "flat"
        ? "flat"
        : "percentage",
    minimumWithdrawal:
      minRaw === 0 || minRaw
        ? Number(minRaw)
        : Number.NaN,
    currency: payload.currency ? String(payload.currency || "").toUpperCase() : undefined,
    payoutMode: String(payload.payoutMode || "").toLowerCase() === "split" ? "split" : "wallet",
  };
};

const getSettings = async (req, res) => {
  try {
    const settings = await ensureSettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});
    const patch = {};

    if (Number.isFinite(payload.adminCommissionRate)) {
      patch.adminCommissionRate = payload.adminCommissionRate;
      patch.adminCommissionType = payload.adminCommissionType;
    }
    if (Number.isFinite(payload.minimumWithdrawal)) {
      patch.minimumWithdrawal = payload.minimumWithdrawal;
    }
    if (payload.currency) {
      patch.currency = payload.currency;
    }
    if (payload.payoutMode) {
      patch.payoutMode = payload.payoutMode;
    }

    if (req.userData?.userId) {
      patch.updatedBy = req.userData.userId;
    }

    const settings = await settingsSchema.findOneAndUpdate({}, patch, {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    });

    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getSettings, updateSettings };
