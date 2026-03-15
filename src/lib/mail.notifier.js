const resolveServiceUrl = (value, fallback) => {
  const raw = String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  return raw[0] || fallback;
};

const MAIL_BASE_URL = resolveServiceUrl(
  process.env.MESSAGE_SERVICE_URL,
  "http://localhost:7000"
).replace(/\/+$/, "");

const normalizePath = (path = "") => {
  const safePath = String(path || "").trim();
  if (!safePath) return "/api/v1/mail";
  return safePath.startsWith("/") ? `/api/v1/mail${safePath}` : `/api/v1/mail/${safePath}`;
};

const requestMailService = async (path, payload = {}, options = {}) => {
  const extraHeaders = options?.headers || {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const internalNotifyKey = String(process.env.INTERNAL_NOTIFY_KEY || "").trim();

  try {
    const response = await fetch(`${MAIL_BASE_URL}${normalizePath(path)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalNotifyKey ? { "x-internal-key": internalNotifyKey } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Mail service request failed with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
};

const notifyWelcome = async ({ email, name }) => requestMailService("/welcome", { email, name });
const notifyLoginAlert = async ({ email, name }) => requestMailService("/login-alert", { email, name });
const notifySellerApproval = async ({ email, name }) =>
  requestMailService("/seller-approval", { email, name });
const notifyNewMessage = async ({
  recipientEmail,
  recipientName,
  senderName,
  preview,
  conversationId,
  actionUrl,
}) =>
  requestMailService("/message-notification", {
    recipientEmail,
    recipientName,
    senderName,
    preview,
    conversationId,
    actionUrl,
  });

const notifyOrderTracking = async ({
  recipientEmail,
  recipientName,
  orderId,
  trackingUrl,
  qrCode,
}) =>
  requestMailService("/order-tracking", {
    recipientEmail,
    recipientName,
    orderId,
    trackingUrl,
    qrCode,
  });

const notifyOrderConfirmation = async ({
  recipientEmail,
  recipientName,
  orderId,
  total,
  orderUrl,
}) =>
  requestMailService("/order-confirmation", {
    recipientEmail,
    recipientName,
    orderId,
    total,
    orderUrl,
  });

const notifySellerNewOrder = async ({
  recipientEmail,
  recipientName,
  orderId,
  total,
  orderUrl,
}) =>
  requestMailService("/seller-new-order", {
    recipientEmail,
    recipientName,
    orderId,
    total,
    orderUrl,
  });

const notifyPasswordReset = async ({
  recipientEmail,
  recipientName,
  resetUrl,
  expiresIn,
}) =>
  requestMailService("/password-reset", {
    recipientEmail,
    recipientName,
    resetUrl,
    expiresIn,
  });

module.exports = {
  notifyWelcome,
  notifyLoginAlert,
  notifySellerApproval,
  notifyNewMessage,
  notifyOrderTracking,
  notifyOrderConfirmation,
  notifySellerNewOrder,
  notifyPasswordReset,
};
