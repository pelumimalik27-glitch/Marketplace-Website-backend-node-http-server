const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;

const Product = require("../src/modules/products/product.schema");
const Seller = require("../src/modules/sellers/seller.schema");
const User = require("../src/modules/users/user.schema");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const IMAGE_DIR = path.join(REPO_ROOT, "frontend", "public", "images");
const MAP_PATH = path.join(__dirname, "cloudinary-map.json");
const CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_PRODUCT_FOLDER || "projectmarketplace/products";
const DEFAULT_PASSWORD = process.env.SEED_SELLER_PASSWORD || "Seller123!";
const DEFAULT_INVENTORY = 25;

const PRODUCTS = [
  {
    name: "PlayStation 3 Slim Console",
    price: 399.99,
    category: "Electronics",
    rating: 4.5,
    reviews: 312,
    freeShipping: true,
    inStock: true,
    seller: "Sony Store",
    imageFile: "ps.jpg",
    description:
      "The PlayStation 3 Slim Console delivers high-definition gaming with advanced graphics and multimedia capabilities.",
    specs: {
      brand: "Sony",
      model: "PS3 Slim",
      storage: "250GB",
      color: "Black",
    },
  },
  {
    name: "iPhone 13 Pro Max",
    price: 279.99,
    category: "Electronics",
    rating: 4.8,
    reviews: 234,
    freeShipping: true,
    inStock: true,
    seller: "Apple Store",
    imageFile: "iphone.jpg",
    description:
      "Latest iPhone with Pro camera system, A15 Bionic chip, and Super Retina XDR display.",
    specs: {
      brand: "Apple",
      storage: "256GB",
      color: "Sierra Blue",
      network: "5G",
    },
  },
  {
    name: "Men's Casual Sneakers",
    price: 159.99,
    category: "Fashion",
    rating: 4.2,
    reviews: 198,
    freeShipping: true,
    inStock: true,
    seller: "Urban Wears",
    imageFile: "shoes.jpg",
    description:
      "Comfortable casual sneakers with premium leather and cushioned insoles.",
    specs: {
      brand: "UrbanWear",
      material: "Leather",
      size: "7-13",
      color: "White / Black",
    },
  },
  {
    name: "Unisex Cotton Hoodie",
    price: 349.99,
    category: "Fashion",
    rating: 4.0,
    reviews: 287,
    freeShipping: false,
    inStock: true,
    seller: "Street Style",
    imageFile: "cloth.jpg",
    description:
      "Premium cotton hoodie with kangaroo pocket and adjustable drawstring hood.",
    specs: {
      brand: "StreetStyle",
      material: "100% Cotton",
      sizes: "S-XXL",
      colors: "Black, Gray, Navy",
    },
  },
  {
    name: "Modern Table Lamp",
    price: 259.99,
    category: "Home & Garden",
    rating: 4.6,
    reviews: 201,
    freeShipping: false,
    inStock: true,
    seller: "HomeGlow",
    imageFile: "lamp.jpg",
    description: "Contemporary table lamp with dimmable LED and touch control.",
    specs: {
      brand: "HomeGlow",
      power: "10W LED",
      height: "18 inches",
      material: "Ceramic",
    },
  },
  {
    name: "Sports Running Sneakers",
    price: 139.99,
    category: "Fashion",
    rating: 4.3,
    reviews: 176,
    freeShipping: true,
    inStock: true,
    seller: "ActiveFit",
    imageFile: "shoes.jpg",
    description:
      "Lightweight running shoes with responsive cushioning and breathable mesh.",
    specs: {
      brand: "ActiveFit",
      type: "Running",
      weight: "280g",
      colors: "Multiple",
    },
  },
  {
    name: "Rechargeable Standing Fan",
    price: 429.99,
    category: "Home & Garden",
    rating: 4.1,
    reviews: 351,
    freeShipping: true,
    inStock: true,
    seller: "CoolAir",
    imageFile: "fans.jpg",
    description:
      "Portable rechargeable fan with 3 speed settings and 8-hour battery life.",
    specs: {
      brand: "CoolAir",
      runtime: "8 hours",
      speeds: "3",
    },
  },
  {
    name: "Car Interior Accessories Set",
    price: 299.99,
    category: "Electronics",
    rating: 4.4,
    reviews: 187,
    freeShipping: false,
    inStock: true,
    seller: "AutoCare",
    imageFile: "caracces.jpg",
    description:
      "Complete car interior accessory kit including mats, organizers, and cleaners.",
    specs: {
      brand: "AutoCare",
      items: "12 pieces",
      fit: "Universal",
    },
  },
  {
    name: "Wireless Gaming Headset",
    price: 129.99,
    category: "Electronics",
    rating: 4.7,
    reviews: 89,
    freeShipping: true,
    inStock: false,
    seller: "Sony Store",
    imageFile: "headset.jpg",
    description:
      "Wireless gaming headset with 7.1 surround sound and noise cancellation.",
    specs: {
      battery: "20 hours",
      connectivity: "Bluetooth 5.0",
    },
  },
  {
    name: "Wireless Mouse",
    price: 49.99,
    category: "Electronics",
    rating: 4.5,
    reviews: 156,
    freeShipping: true,
    inStock: true,
    seller: "ActiveFit",
    imageFile: "mouse.jpg",
    description:
      "Ergonomic wireless mouse with smooth tracking and long battery life.",
    specs: {
      dpi: "1600",
      connectivity: "Wireless USB",
    },
  },
  {
    name: "Electric Coffee Grinder",
    price: 129.99,
    category: "Home Appliances",
    rating: 4.7,
    reviews: 89,
    freeShipping: true,
    inStock: false,
    seller: "Sony Store",
    imageFile: "grinder.jpg",
    description:
      "High-performance electric coffee grinder with stainless steel blades.",
    specs: {
      power: "200W",
      capacity: "80g",
    },
  },
  {
    name: "Double Door Refrigerator",
    price: 499.99,
    category: "Home Appliances",
    rating: 4.5,
    reviews: 156,
    freeShipping: true,
    inStock: true,
    seller: "ActiveFit",
    imageFile: "fridge.jpg",
    description:
      "Energy-efficient double door refrigerator with fast cooling technology.",
    specs: {
      capacity: "250 Liters",
      energyRating: "A+",
      color: "Silver",
    },
  },
];

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const loadMap = () => {
  if (!fs.existsSync(MAP_PATH)) return {};
  try {
    const raw = fs.readFileSync(MAP_PATH, "utf8");
    return JSON.parse(raw) || {};
  } catch (_) {
    return {};
  }
};

const saveMap = (map) => {
  fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
};

const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Missing Cloudinary credentials in backend/.env");
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
};

const ensureImageUrl = async (fileName, map) => {
  const key = String(fileName || "").trim();
  if (!key) throw new Error("Missing image file name");
  if (map[key]) return map[key];
  const filePath = path.join(IMAGE_DIR, key);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Image file not found: ${filePath}`);
  }
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "image",
    folder: CLOUDINARY_FOLDER,
  });
  const url = result?.secure_url || result?.url;
  if (!url) throw new Error(`Cloudinary upload failed for ${key}`);
  map[key] = url;
  saveMap(map);
  return url;
};

const getOrCreateSeller = async (storeName) => {
  const slug = slugify(storeName);
  const email = `seller+${slug}@seed.local`;
  const name = storeName;
  let user = await User.findOne({ email });
  if (!user) {
    const password = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    user = await User.create({
      name,
      email,
      password,
      roles: ["seller"],
      isVerified: true,
    });
  } else {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.includes("seller")) {
      user.roles = [...new Set([...roles, "seller"])];
      await user.save();
    }
  }

  let seller = await Seller.findOne({ user: user._id });
  if (!seller) {
    seller = await Seller.create({
      user: user._id,
      storeName,
      contactPhone: "0000000000",
      businessAddress: "Seeded address",
      paymentDetails: "Seeded payment",
      idNumber: `SEED-${slug || "seller"}`,
      status: "approved",
    });
  } else if (seller.status !== "approved") {
    seller.status = "approved";
    await seller.save();
  }

  return seller;
};

const seedProducts = async ({ reset = false } = {}) => {
  configureCloudinary();

  const uri = process.env.DBSTRING?.trim();
  if (!uri) throw new Error("DBSTRING is required in backend/.env");
  await mongoose.connect(uri);

  const map = loadMap();
  const sellerNames = Array.from(new Set(PRODUCTS.map((product) => product.seller)));
  const sellers = new Map();

  for (const name of sellerNames) {
    const seller = await getOrCreateSeller(name);
    sellers.set(name, seller);
  }

  if (reset) {
    const sellerIds = Array.from(sellers.values()).map((seller) => seller._id);
    await Product.deleteMany({ sellerId: { $in: sellerIds } });
  }

  let created = 0;
  let updated = 0;

  for (const product of PRODUCTS) {
    const seller = sellers.get(product.seller);
    if (!seller) {
      throw new Error(`Seller not found for ${product.name}`);
    }

    const imageUrl = await ensureImageUrl(product.imageFile, map);
    const payload = {
      sellerId: seller._id,
      name: product.name,
      description: product.description,
      image: imageUrl,
      images: [imageUrl],
      price: product.price,
      category: product.category,
      rating: product.rating,
      reviews: product.reviews,
      freeShipping: product.freeShipping,
      inStock: product.inStock,
      specs: product.specs,
      inventory: { quantity: product.inStock ? DEFAULT_INVENTORY : 0 },
      status: "active",
    };

    const existing = await Product.findOne({
      sellerId: seller._id,
      name: product.name,
    });
    if (existing) {
      await Product.updateOne({ _id: existing._id }, { $set: payload });
      updated += 1;
    } else {
      await Product.create(payload);
      created += 1;
    }
  }

  console.log(`Seeded products: ${created} created, ${updated} updated.`);
};

const args = new Set(process.argv.slice(2));
const reset = args.has("--reset");

seedProducts({ reset })
  .catch((error) => {
    console.error("seedProducts failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
