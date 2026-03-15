const paymentSchema = require("../payment/payment.schema");
const orderSchema = require("../orders/order.schema");
const userSchema = require("../users/user.schema");
const sellerSchema = require("../sellers/seller.schema");
const walletTransactionSchema = require("../payouts/wallet_transaction.schema");
const { handlePaystackTransferEvent, verifyPaystackSignature } = require("../payouts/payout.controller");
const commissionRuleSchema = require("../commission_rules/commission.schema");
const settingsSchema = require("../settings/settings.schema");
const QRCode = require("qrcode");
const { notifyOrderTracking } = require("../../lib/mail.notifier");
const paystack = require("paystack-api")(process.env.PSSECRETE);

const getFrontendBaseUrl = () =>
  String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

const DEFAULT_COMMISSION_RATE = Number(process.env.DEFAULT_COMMISSION_RATE || 0);
const DEFAULT_COMMISSION_TYPE =
  String(process.env.DEFAULT_COMMISSION_TYPE || "percentage").toLowerCase() === "flat"
    ? "flat"
    : "percentage";
const DEFAULT_COMMISSION_RULE =
  Number.isFinite(DEFAULT_COMMISSION_RATE) && DEFAULT_COMMISSION_RATE > 0
    ? { commissionRate: DEFAULT_COMMISSION_RATE, commissionType: DEFAULT_COMMISSION_TYPE }
    : null;

const PAYSTACK_CURRENCY = String(process.env.PAYSTACK_CURRENCY || "NGN").toUpperCase();
const PAYOUT_MODE = String(process.env.PAYOUT_MODE || "wallet").toLowerCase() === "split"
  ? "split"
  : "wallet";
const PAYSTACK_BEARER_TYPE =
  String(process.env.PAYSTACK_BEARER_TYPE || "account").toLowerCase() === "subaccount"
    ? "subaccount"
    : "account";
const PAYSTACK_BEARER_SUBACCOUNT = String(process.env.PAYSTACK_BEARER_SUBACCOUNT || "").trim();

const toKobo = (value) => Math.round(Number(value || 0) * 100);

const getSettingsSnapshot = async (cache) => {
  const key = "__settings";
  if (cache && cache.has(key)) return cache.get(key);
  let settings = null;
  try {
    settings = await settingsSchema.findOne().lean();
  } catch (_) {
    settings = null;
  }
  if (cache) cache.set(key, settings);
  return settings;
};

const getDefaultCommissionRule = async (cache) => {
  const key = "__defaultCommission";
  if (cache && cache.has(key)) return cache.get(key);

  const settings = await getSettingsSnapshot(cache);
  let rule = null;
  const rate = Number(settings?.adminCommissionRate || 0);
  if (Number.isFinite(rate) && rate > 0) {
    const type =
      String(settings?.adminCommissionType || "percentage").toLowerCase() === "flat"
        ? "flat"
        : "percentage";
    rule = { commissionRate: rate, commissionType: type };
  } else {
    rule = DEFAULT_COMMISSION_RULE;
  }

  if (cache) cache.set(key, rule);
  return rule;
};

const resolvePayoutMode = async () => {
  try {
    const settings = await settingsSchema.findOne().lean();
    if (String(settings?.payoutMode || "").toLowerCase() === "split") return "split";
  } catch (_) {
    // ignore
  }
  return PAYOUT_MODE;
};

const computeCommissionKobo = (amountKobo, rule) => {
  if (!rule) return 0;
  const rate = Number(rule.commissionRate || 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (rule.commissionType === "flat") {
    const flatKobo = toKobo(rate);
    return Math.min(amountKobo, flatKobo);
  }
  return Math.min(amountKobo, Math.round(amountKobo * (rate / 100)));
};

const resolveCommissionRule = async ({ sellerId, category, cache }) => {
  const key = `${sellerId || "global"}|${category || ""}`;
  if (cache.has(key)) return cache.get(key);

  const now = new Date();
  let rule = null;

  if (sellerId) {
    rule = await commissionRuleSchema
      .findOne({ scope: "seller", sellerId, effectiveFrom: { $lte: now } })
      .sort("-effectiveFrom -createdAt")
      .lean();
  }

  if (!rule && category) {
    rule = await commissionRuleSchema
      .findOne({ scope: "category", category, effectiveFrom: { $lte: now } })
      .sort("-effectiveFrom -createdAt")
      .lean();
  }

  if (!rule) {
    rule = await commissionRuleSchema
      .findOne({ scope: "global", effectiveFrom: { $lte: now } })
      .sort("-effectiveFrom -createdAt")
      .lean();
  }

  const resolved = rule || (await getDefaultCommissionRule(cache)) || null;
  cache.set(key, resolved);
  return resolved;
};

const buildSplitPayload = async (order, { requireSubaccount = true } = {}) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) {
    return { error: "Order items are required for payment." };
  }

  const amountKobo = toKobo(order?.summary?.total || 0);
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
    return { error: "Order total must be greater than zero" };
  }

  const itemsTotalKobo = items.reduce((sum, item) => {
    const qty = Number(item?.quantity || 1);
    const price = Number(item?.price || 0);
    const total = Number(item?.total || qty * price || 0);
    return sum + Math.max(0, toKobo(total));
  }, 0);

  if (!Number.isFinite(itemsTotalKobo) || itemsTotalKobo <= 0) {
    return { error: "Order items total must be greater than zero" };
  }

  const scale = amountKobo < itemsTotalKobo ? amountKobo / itemsTotalKobo : 1;
  const sellerMap = new Map();
  const ruleCache = new Map();

  for (const item of items) {
    const sellerDoc = item?.seller;
    const sellerId = String(sellerDoc?._id || item?.seller || "").trim();
    if (!sellerId) continue;

    const productDoc = item?.product;
    const category = String(productDoc?.category || "").trim();

    const qty = Number(item?.quantity || 1);
    const price = Number(item?.price || 0);
    const rawTotal = Number(item?.total || qty * price || 0);
    const baseTotalKobo = Math.max(0, toKobo(rawTotal));
    const effectiveTotalKobo = Math.max(0, Math.round(baseTotalKobo * scale));

    const rule = await resolveCommissionRule({ sellerId, category, cache: ruleCache });
    const commissionKobo = computeCommissionKobo(effectiveTotalKobo, rule);
    const payoutKobo = Math.max(0, effectiveTotalKobo - commissionKobo);

    const existing = sellerMap.get(sellerId) || {
      sellerId,
      subaccountCode: String(sellerDoc?.paystackSubaccountCode || "").trim(),
      payoutKobo: 0,
      commissionKobo: 0,
    };

    if (!existing.subaccountCode && sellerDoc?.paystackSubaccountCode) {
      existing.subaccountCode = String(sellerDoc.paystackSubaccountCode || "").trim();
    }

    existing.payoutKobo += payoutKobo;
    existing.commissionKobo += commissionKobo;
    sellerMap.set(sellerId, existing);
  }

  const payouts = Array.from(sellerMap.values());
  if (payouts.length === 0) {
    return { error: "Unable to resolve seller payouts for this order." };
  }
  const missingSubaccounts = payouts.filter((entry) => !entry.subaccountCode);
  if (requireSubaccount && missingSubaccounts.length > 0) {
    return { error: "One or more sellers are missing Paystack subaccount codes." };
  }

  const subaccounts = payouts
    .filter((entry) => entry.payoutKobo > 0 && entry.subaccountCode)
    .map((entry) => ({
      subaccount: entry.subaccountCode,
      share: Math.round(entry.payoutKobo),
    }));

  let totalShare = subaccounts.reduce((sum, entry) => sum + entry.share, 0);
  if (totalShare > amountKobo && subaccounts.length > 0) {
    const diff = totalShare - amountKobo;
    subaccounts.sort((a, b) => b.share - a.share);
    subaccounts[0].share = Math.max(0, subaccounts[0].share - diff);
    totalShare = subaccounts.reduce((sum, entry) => sum + entry.share, 0);
  }

  const commissionTotalKobo = payouts.reduce(
    (sum, entry) => sum + Math.max(0, entry.commissionKobo || 0),
    0
  );

  return { amountKobo, subaccounts, payouts, commissionTotalKobo };
};

const creditSellerWallets = async (payment) => {
  if (!payment) return { credited: false };
  if (String(payment.payoutMode || "wallet") === "split") return { credited: false };
  if (payment.walletCreditedAt) return { credited: false };

  const payouts = Array.isArray(payment.sellerPayouts) ? payment.sellerPayouts : [];
  const creditable = payouts.filter(
    (entry) => entry?.seller && Number(entry?.amount || 0) > 0
  );
  if (creditable.length === 0) return { credited: false };

  let processed = 0;
  for (const entry of creditable) {
    const sellerId = String(entry.seller || "").trim();
    const amount = Number(entry.amount || 0);
    if (!sellerId || amount <= 0) {
      continue;
    }

    const existingTx = await walletTransactionSchema.findOne({
      seller: sellerId,
      payment: payment._id,
      type: "credit",
    });
    if (existingTx) {
      processed += 1;
      continue;
    }

    await sellerSchema.findByIdAndUpdate(sellerId, { $inc: { walletBalance: amount } });
    await walletTransactionSchema.create({
      seller: sellerId,
      type: "credit",
      source: "order",
      amount,
      status: "success",
      reference: payment.reference,
      order: payment.order,
      payment: payment._id,
      metadata: { commission: Number(entry.commission || 0) },
    });
    processed += 1;
  }

  if (processed >= creditable.length) {
    payment.walletCreditedAt = new Date();
    await payment.save();
    return { credited: true };
  }

  return { credited: false };
};

const finalizePaymentSuccess = async (reference) => {
  if (!reference) {
    throw new Error("reference is required");
  }
  const payment = await paymentSchema.findOne({ reference });
  if (!payment) {
    throw new Error("Payment record not found");
  }

  const wasPaid = String(payment.status || "").toLowerCase() === "success";
  payment.status = "success";
  await payment.save();

  const order = await orderSchema.findById(payment.order).populate("buyer", "name email");
  if (order) {
    if (order.status === "pending") {
      order.status = "processing";
    }
    if (!order.paymentReference) {
      order.paymentReference = reference;
    }
    await order.save();
  }

  await creditSellerWallets(payment);

  if (order && order.orderId && !order.trackingEmailSentAt) {
    const buyer =
      typeof order.buyer === "object" && order.buyer?.email
        ? order.buyer
        : await userSchema.findById(order.buyer).select("name email").lean();
    const recipientEmail = buyer?.email || "";
    const recipientName = buyer?.name || "";
    if (recipientEmail) {
      const trackingUrl = `${getFrontendBaseUrl()}/track-order/${order.orderId}`;
      QRCode.toDataURL(trackingUrl)
        .then((qrCode) =>
          notifyOrderTracking({
            recipientEmail,
            recipientName,
            orderId: order.orderId,
            trackingUrl,
            qrCode,
          }).then(() =>
            orderSchema.findByIdAndUpdate(order._id, {
              $set: { trackingEmailSentAt: new Date() },
            })
          )
        )
        .catch((error) => {
          console.error(`Order tracking email failed: ${error?.message || error}`);
        });
    }
  }

  return { payment, order, wasPaid };
};

const initializePayment = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    const email = req.userData?.email;
    const { orderId, callbackUrl } = req.body || {};

    if (!userId || !email) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const order = await orderSchema
      .findById(orderId)
      .populate("items.product", "category")
      .populate("items.seller", "paystackSubaccountCode storeName");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (String(order.buyer) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "You can only pay for your own order",
      });
    }

    const payoutMode = await resolvePayoutMode();
    const requireSubaccount = payoutMode === "split";
    const splitResult = await buildSplitPayload(order, { requireSubaccount });
    if (splitResult?.error) {
      return res.status(400).json({
        success: false,
        message: splitResult.error,
      });
    }

    const { amountKobo, subaccounts, payouts, commissionTotalKobo } = splitResult;
    const reference = `ORD-${order._id}-${Date.now()}`;

    const payment = await paymentSchema.create({
      user: userId,
      order: order._id,
      amount: amountKobo,
      commissionAmount: commissionTotalKobo,
      sellerPayouts: payouts.map((entry) => ({
        seller: entry.sellerId,
        subaccount: entry.subaccountCode,
        amount: entry.payoutKobo,
        commission: entry.commissionKobo,
      })),
      payoutMode,
      reference,
    });

    const payload = {
      email,
      amount: amountKobo,
      reference,
    };

    if (payoutMode === "split" && subaccounts.length > 0) {
      payload.split = {
        type: "flat",
        currency: PAYSTACK_CURRENCY,
        subaccounts,
        bearer_type: PAYSTACK_BEARER_TYPE,
        ...(PAYSTACK_BEARER_TYPE === "subaccount" && PAYSTACK_BEARER_SUBACCOUNT
          ? { bearer_subaccount: PAYSTACK_BEARER_SUBACCOUNT }
          : {}),
      };
    }

    if (typeof callbackUrl === "string" && callbackUrl.trim()) {
      payload.callback_url = callbackUrl.trim();
    }

    const paystackResponse = await paystack.transaction.initialize(payload);
    order.paymentReference = reference;
    await order.save();

    return res.status(200).json({
      success: true,
      authorization_url: paystackResponse?.data?.authorization_url,
      reference,
      paymentId: payment._id,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "reference is required",
      });
    }

    const verify = await paystack.transaction.verify({ reference });
    const gatewayStatus = String(verify?.data?.status || "").toLowerCase();
    const gatewaySuccess = verify?.status === true && gatewayStatus === "success";

    if (!gatewaySuccess) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    const { payment, order } = await finalizePaymentSuccess(reference);

    return res.status(200).json({
      success: true,
      data: {
        reference,
        paymentStatus: payment?.status || "success",
        orderId: order?._id || null,
        orderStatus: order?.status || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const handlePaystackWebhook = async (req, res) => {
  try {
    if (!verifyPaystackSignature(req)) {
      return res.status(400).json({ success: false, message: "Invalid Paystack signature" });
    }

    const event = String(req.body?.event || "").trim();
    const data = req.body?.data || {};
    if (!event) {
      return res.status(200).json({ success: true });
    }

    if (event === "charge.success") {
      const reference = String(data?.reference || "").trim();
      if (reference) {
        await finalizePaymentSuccess(reference);
      }
    }

    if (event.startsWith("transfer.")) {
      await handlePaystackTransferEvent(event, data);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { initializePayment, verifyPayment, handlePaystackWebhook };
