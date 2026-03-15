const cartSchema = require("./cart.schema.js");
const productSchema = require("../products/product.schema");

const asId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const buildCartResponse = (cartDoc) => {
  const items = Array.isArray(cartDoc?.items) ? cartDoc.items : [];
  const mapped = items
    .map((row) => {
      const product = row?.product;
      if (!product) return null;
      const sellerRef = product?.sellerId;
      const sellerId = asId(sellerRef?._id || sellerRef);
      const sellerName = sellerRef?.storeName || "";
      const image =
        String(product?.image || "") ||
        (Array.isArray(product?.images) && product.images[0] ? product.images[0] : "");
      const inventoryQty = Number(product?.inventory?.quantity || 0);

      return {
        id: asId(product?._id),
        _id: asId(product?._id),
        name: String(product?.name || ""),
        image,
        price: Number(row?.price || product?.price || 0),
        qty: Number(row?.quantity || 1),
        sellerId: sellerId || "unknown-seller",
        sellerName,
        seller: sellerName,
        freeShipping: Boolean(product?.freeShipping),
        inStock: Boolean(product?.inStock ?? inventoryQty > 0),
        inventory: product?.inventory || { quantity: inventoryQty },
      };
    })
    .filter(Boolean);

  return {
    cartId: cartDoc?._id || null,
    items: mapped,
  };
};

const findUserCart = async (userId) => {
  return cartSchema.findOne({ user: userId }).populate({
    path: "items.product",
    select: "name image images price freeShipping sellerId inventory inStock status",
    populate: { path: "sellerId", select: "storeName" },
  });
};

const reserveInventory = async (productId, quantity) => {
  if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
  return productSchema.findOneAndUpdate(
    { _id: productId, "inventory.quantity": { $gte: quantity } },
    { $inc: { "inventory.quantity": -quantity } },
    { new: true }
  );
};

const releaseInventory = async (productId, quantity) => {
  if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
  return productSchema.findByIdAndUpdate(
    productId,
    { $inc: { "inventory.quantity": quantity } },
    { new: true }
  );
};

const getMyCart = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const cart = await findUserCart(userId);
    if (!cart) {
      return res.status(200).json({ success: true, data: { cartId: null, items: [] } });
    }
    return res.status(200).json({ success: true, data: buildCartResponse(cart) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const addItem = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const productId = asId(req.body?.productId || req.body?.product || "");
    const quantity = Number(req.body?.quantity || 1);
    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: "quantity must be greater than 0" });
    }

    const product = await productSchema.findById(productId).select("price inventory");
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const reserved = await reserveInventory(productId, quantity);
    if (!reserved) {
      return res.status(400).json({ success: false, message: "Insufficient stock" });
    }

    let cart = await cartSchema.findOne({ user: userId });
    if (!cart) {
      cart = await cartSchema.create({ user: userId, items: [] });
    }

    const existing = cart.items.find((item) => asId(item.product) === productId);
    if (existing) {
      existing.quantity += quantity;
      existing.price = Number(product.price || 0);
      existing.total = existing.quantity * existing.price;
    } else {
      cart.items.push({
        product: productId,
        quantity,
        price: Number(product.price || 0),
        total: Number(product.price || 0) * quantity,
      });
    }

    await cart.save();
    const populated = await findUserCart(userId);
    return res.status(200).json({ success: true, data: buildCartResponse(populated) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateItem = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const productId = asId(req.params.productId || req.body?.productId || "");
    const quantity = Number(req.body?.quantity || 0);
    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }
    if (!Number.isFinite(quantity)) {
      return res.status(400).json({ success: false, message: "quantity is required" });
    }

    const cart = await cartSchema.findOne({ user: userId });
    if (!cart) {
      return res.status(200).json({ success: true, data: { cartId: null, items: [] } });
    }

    const itemIndex = cart.items.findIndex((item) => asId(item.product) === productId);
    if (itemIndex === -1) {
      const populated = await findUserCart(userId);
      return res.status(200).json({ success: true, data: buildCartResponse(populated) });
    }

    const currentQty = Number(cart.items[itemIndex].quantity || 0);
    const delta = quantity - currentQty;

    if (quantity <= 0) {
      await releaseInventory(productId, currentQty);
      cart.items.splice(itemIndex, 1);
    } else {
      if (delta > 0) {
        const reserved = await reserveInventory(productId, delta);
        if (!reserved) {
          return res.status(400).json({ success: false, message: "Insufficient stock" });
        }
      } else if (delta < 0) {
        await releaseInventory(productId, Math.abs(delta));
      }

      const product = await productSchema.findById(productId).select("price");
      const price = Number(product?.price || cart.items[itemIndex].price || 0);
      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].price = price;
      cart.items[itemIndex].total = price * quantity;
    }

    await cart.save();
    const populated = await findUserCart(userId);
    return res.status(200).json({ success: true, data: buildCartResponse(populated) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const removeItem = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const productId = asId(req.params.productId || req.body?.productId || "");
    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const cart = await cartSchema.findOne({ user: userId });
    if (!cart) {
      return res.status(200).json({ success: true, data: { cartId: null, items: [] } });
    }

    const toRemove = cart.items.find((item) => asId(item.product) === productId);
    if (toRemove) {
      await releaseInventory(productId, Number(toRemove.quantity || 0));
    }
    cart.items = cart.items.filter((item) => asId(item.product) !== productId);
    await cart.save();
    const populated = await findUserCart(userId);
    return res.status(200).json({ success: true, data: buildCartResponse(populated) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const clearMyCart = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const cart = await cartSchema.findOne({ user: userId });
    if (cart) {
      for (const item of cart.items) {
        await releaseInventory(asId(item.product), Number(item.quantity || 0));
      }
      cart.items = [];
      await cart.save();
    }
    return res.status(200).json({
      success: true,
      data: { cartId: cart?._id || null, items: [] },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const create = async (req, res) => {
  try {
    const doc = await cartSchema.create(req.body);
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const docs = await cartSchema.find().sort("-createdAt");
    return res.status(200).json({ success: true, data: docs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await cartSchema.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateById = async (req, res) => {
  try {
    const doc = await cartSchema.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeById = async (req, res) => {
  try {
    const doc = await cartSchema.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    return res.status(200).json({ success: true, message: "Cart deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  findUserCart,
  buildCartResponse,
  getMyCart,
  addItem,
  updateItem,
  removeItem,
  clearMyCart,
  create,
  list,
  getById,
  updateById,
  removeById,
};

