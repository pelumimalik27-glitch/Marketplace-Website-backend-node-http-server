const sellerSchema = require("./seller.schema.js");
const { isDataUrl, uploadImageData } = require("../../lib/cloudinary");

const SELLER_LOGO_FOLDER =
  process.env.CLOUDINARY_SELLER_FOLDER || "projectmarketplace/sellers";

const normalizeStoreLogo = async (payload = {}) => {
  const hasLogo = Object.prototype.hasOwnProperty.call(payload, "storeLogo");
  if (!hasLogo) return null;
  const raw = String(payload.storeLogo || "").trim();
  if (!raw) return { storeLogo: "" };
  if (isDataUrl(raw)) {
    const uploaded = await uploadImageData(raw, { folder: SELLER_LOGO_FOLDER });
    const url = uploaded?.secure_url || uploaded?.url || "";
    return { storeLogo: url || raw };
  }
  return { storeLogo: raw };
};

const create = async (req, res) => {
  try {
    const logoPatch = await normalizeStoreLogo(req.body);
    const payload = { ...req.body, ...(logoPatch || {}) };
    const doc = await sellerSchema.create(payload);
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const docs = await sellerSchema.find().sort("-createdAt");
    return res.status(200).json({ success: true, data: docs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await sellerSchema.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateById = async (req, res) => {
  try {
    const logoPatch = await normalizeStoreLogo(req.body);
    const payload = { ...req.body, ...(logoPatch || {}) };
    const doc = await sellerSchema.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeById = async (req, res) => {
  try {
    const doc = await sellerSchema.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    return res.status(200).json({ success: true, message: "Seller deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  create,
  list,
  getById,
  updateById,
  removeById,
};

