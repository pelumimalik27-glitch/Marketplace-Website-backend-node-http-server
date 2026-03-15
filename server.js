require("dotenv").config();
const mongoose = require("mongoose");
mongoose.set("strictPopulate", false);
const express = require("express");
const http = require("http");
const path = require("path");
const { createProxyMiddleware } = require("http-proxy-middleware");
const connectDB = require("./database/dbconnection");
const { authRouter } = require("./src/modules/users/user.router");
const { initSocket } = require("./src/lib/socket");

const app = express();
const cors = require('cors');
const { sellerRouter } = require("./src/modules/sellers/seller.router");
const { adminRouter } = require("./src/modules/admins/admin.router");
const { productRouter } = require("./src/modules/products/product.router");
const { categoryRouter } = require("./src/modules/categories/category.router");
const { cartRouter } = require("./src/modules/carts/cart.router");
const { orderRouter } = require("./src/modules/orders/order.router");
const { disputeRouter } = require("./src/modules/disputes/dispute.router");
const { reviewRouter } = require("./src/modules/reviews/review.router");
const { messageRouter } = require("./src/modules/messages/message.router");
const { conversationRouter } = require("./src/modules/conversations/conversation.router");
const { syncAdminFromEnv } = require("./src/modules/admins/admin.bootstrap");
const { paymentRouter } = require("./src/modules/payment/payment.router");
const { payoutRouter } = require("./src/modules/payouts/payout.router");
const { settingsRouter } = require("./src/modules/settings/settings.router");

const EXPRESSPORT = Number(process.env.PORT) || 6001;
const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];
const configuredOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Keep local development flexible across changing dev-server ports.
    if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
}));
const resolveServiceUrl = (value, fallback) => {
  const raw = String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!raw.length) return fallback;
  if (raw.length > 1) {
    console.warn("MESSAGE_SERVICE_URL has multiple values. Using the first one.");
  }
  return raw[0];
};

const mailServiceTarget = resolveServiceUrl(
  process.env.MESSAGE_SERVICE_URL,
  "http://localhost:7000"
).replace(/\/+$/, "");

app.use(
  "/api/v1/mail",
  createProxyMiddleware({
    target: mailServiceTarget,
    changeOrigin: true,
    proxyTimeout: 15000,
    timeout: 15000,
    pathRewrite: (path) => {
      if (path.startsWith("/api/v1/mail/")) return path;
      if (path === "/api/v1/mail") return "/api/v1/mail";
      if (path.startsWith("/")) return `/api/v1/mail${path}`;
      return `/api/v1/mail/${path}`;
    },
    onError(err, req, res) {
      if (res.headersSent) return;
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          message: `Mail service unavailable: ${err?.message || "proxy error"}`,
        })
      );
    },
  })
);
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});


app.use('/api/v1/auth', authRouter);
app.use('/api/v1/seller', sellerRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/categories', categoryRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/disputes', disputeRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/payouts', payoutRouter);
app.use('/api/v1/messages', messageRouter);
app.use('/api/v1/conversations', conversationRouter);
app.use('/api/v1/payment',paymentRouter)
app.use('/api/v1/setting',settingsRouter)



// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err?.name === "MulterError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(err?.statusCode || 500).json({
      success: false,
      message: err?.message || "Something went wrong!",
    });
});



app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

const startServer = async () => {
  await connectDB();

  if (process.env.ADMIN_SYNC_ON_STARTUP === "true") {
    try {
      const admin = await syncAdminFromEnv();
      console.log(`Admin synced from .env: ${admin.email}`);
    } catch (error) {
      console.error(`Admin sync skipped: ${error.message}`);
    }
  }

  const server = http.createServer(app);
  initSocket({
    server,
    corsOrigins: allowedOrigins,
    jwtSecret: process.env.JWT_SECRETE || "dev-secret",
  });

  server.listen(EXPRESSPORT, () => {
    console.log(`Server is running on http://localhost:${EXPRESSPORT}/`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${EXPRESSPORT} is already in use. Stop the old process or change PORT in .env.`);
      process.exit(1);
    }

    throw error;
  });
};

startServer();
