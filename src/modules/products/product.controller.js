const productSchema = require("./product.schema.js");
const sellerSchema = require("../sellers/seller.schema");
const { isDataUrl, uploadImageData } = require("../../lib/cloudinary");

const toClientProduct = (doc = {}) => {
  const raw = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  const sellerRef = raw?.sellerId;
  const sellerId = sellerRef?._id || sellerRef || null;
  const sellerName = raw?.sellerName || sellerRef?.storeName || "";
  return {
    ...raw,
    sellerId,
    sellerName,
  };
};

const normalizeImages = async (items, folder) => {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const results = [];

  for (const item of list) {
    const value = String(item || "").trim();
    if (!value) continue;
    if (isDataUrl(value)) {
      const uploaded = await uploadImageData(value, { folder });
      const url = uploaded?.secure_url || uploaded?.url || "";
      if (url) results.push(url);
    } else {
      results.push(value);
    }
  }

  return results;
};

const normalizeProductImages = async (payload) => {
  const data = payload || {};
  const hasImageField = Object.prototype.hasOwnProperty.call(data, "image");
  const hasImagesField = Object.prototype.hasOwnProperty.call(data, "images");
  if (!hasImageField && !hasImagesField) {
    return null;
  }

  const folder = process.env.CLOUDINARY_PRODUCT_FOLDER || "projectmarketplace/products";
  const images = await normalizeImages(data?.images, folder);
  let image = String(data?.image || "").trim();

  if (images.length > 0) {
    if (image && !isDataUrl(image) && !images.includes(image)) {
      images.unshift(image);
    }
    image = images[0] || "";
  } else if (image) {
    if (isDataUrl(image)) {
      const uploaded = await uploadImageData(image, { folder });
      image = uploaded?.secure_url || uploaded?.url || image;
    }
    images.push(image);
  }

  return { image, images };
};

const create = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const sellerProfile = await sellerSchema.findOne({ user: userId }).select("_id status");
    if (!sellerProfile) {
      return res.status(400).json({
        success: false,
        message: "Seller profile not found. Complete seller setup first.",
      });
    }

    if (sellerProfile.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Seller account is not approved yet.",
      });
    }

    const normalizedImages = await normalizeProductImages(req.body);
    const payload = {
      ...req.body,
      ...(normalizedImages || {}),
      sellerId: sellerProfile._id,
    };

    const doc = await productSchema.create(payload);
    const hydrated = await productSchema.findById(doc._id).populate("sellerId", "storeName");
    return res.status(201).json({ success: true, data: toClientProduct(hydrated) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const projection =
      "sellerId sellerName name description image images price category rating reviews freeShipping inStock specs inventory status createdAt";
    const requestedSort = String(req.query?.sort || "-createdAt").trim();
    const safeSort = requestedSort === "createdAt" ? "createdAt" : "-createdAt";
    const limitValue = Number(req.query?.limit);
    const safeLimit = Number.isFinite(limitValue)
      ? Math.min(Math.max(Math.trunc(limitValue), 1), 200)
      : 0;

    let query = productSchema
      .find({ sellerId: { $ne: null } })
      .select(projection)
      .sort(safeSort)
      .populate("sellerId", "storeName");

    if (safeLimit > 0) {
      query = query.limit(safeLimit);
    }

    const docs = await query.lean();
    return res.status(200).json({ success: true, data: docs.map((doc) => toClientProduct(doc)) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await productSchema.findById(req.params.id).populate("sellerId", "storeName");
    if (!doc) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({ success: true, data: toClientProduct(doc) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateById = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const sellerProfile = await sellerSchema.findOne({ user: userId }).select("_id");
    if (!sellerProfile) {
      return res.status(400).json({ success: false, message: "Seller profile not found." });
    }

    const normalizedImages = await normalizeProductImages(req.body);
    const payload = { ...req.body, ...(normalizedImages || {}) };
    delete payload.sellerId;

    const doc = await productSchema.findOneAndUpdate(
      { _id: req.params.id, sellerId: sellerProfile._id },
      payload,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const hydrated = await productSchema.findById(doc._id).populate("sellerId", "storeName");
    return res.status(200).json({ success: true, data: toClientProduct(hydrated) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeById = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const sellerProfile = await sellerSchema.findOne({ user: userId }).select("_id");
    if (!sellerProfile) {
      return res.status(400).json({ success: false, message: "Seller profile not found." });
    }

    const doc = await productSchema.findOneAndDelete({
      _id: req.params.id,
      sellerId: sellerProfile._id,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({ success: true, message: "Product deleted" });
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

