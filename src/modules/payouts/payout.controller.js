const crypto = require("crypto");
const payoutSchema = require("./payout.schema");
const walletTransactionSchema = require("./wallet_transaction.schema");
const sellerSchema = require("../sellers/seller.schema");
const settingsSchema = require("../settings/settings.schema");
const paystack = require("paystack-api")(process.env.PSSECRETE);

const PAYSTACK_CURRENCY = String(process.env.PAYSTACK_CURRENCY || "NGN").toUpperCase();
const PAYSTACK_BANK_COUNTRY = String(process.env.PAYSTACK_BANK_COUNTRY || "nigeria").toLowerCase();
const PAYSTACK_BANK_TYPE = String(process.env.PAYSTACK_BANK_TYPE || "nuban").toLowerCase();
const MIN_WITHDRAWAL_AMOUNT = Number(process.env.MIN_WITHDRAWAL_AMOUNT || 0);

const toKobo = (value) => Math.round(Number(value || 0) * 100);

const bankCache = {
  data: null,
  fetchedAt: 0,
  key: "",
  ttlMs: 1000 * 60 * 60,
};

const getSettingsSnapshot = async () => {
  try {
    return await settingsSchema.findOne().lean();
  } catch (_) {
    return null;
  }
};

const normalizeBankRow = (row) => ({
  name: String(row?.name || "").trim(),
  code: String(row?.code || "").trim(),
  slug: String(row?.slug || "").trim(),
  currency: String(row?.currency || "").trim(),
});

const normalizeBankDetails = (payload = {}) => ({
  bankName: String(payload.bankName || "").trim(),
  bankCode: String(payload.bankCode || "").trim(),
  accountNumber: String(payload.accountNumber || "").trim(),
  accountName: String(payload.accountName || "").trim(),
});

const pickSellerBankDetails = (seller, overrides = {}) => {
  const input = normalizeBankDetails(overrides);
  return {
    bankName: input.bankName || String(seller?.bankName || "").trim(),
    bankCode: input.bankCode || String(seller?.bankCode || "").trim(),
    accountNumber: input.accountNumber || String(seller?.accountNumber || "").trim(),
    accountName: input.accountName || String(seller?.accountName || "").trim(),
  };
};

const getSellerProfile = async (userId) => {
  if (!userId) return null;
  return sellerSchema.findOne({ user: userId });
};

const getWalletSummary = async (req, res) => {
  try {
    const seller = await getSellerProfile(req.userData?.userId);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller profile not found" });
    }

    const pendingTotal = await payoutSchema
      .aggregate([
        { $match: { seller: seller._id, status: { $in: ["pending", "processing"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .then((rows) => (rows && rows[0] ? rows[0].total : 0))
      .catch(() => 0);

    const settings = await getSettingsSnapshot();
    const currency = String(settings?.currency || PAYSTACK_CURRENCY).toUpperCase();

    return res.status(200).json({
      success: true,
      data: {
        walletBalance: Number(seller.walletBalance || 0),
        pendingPayouts: Number(pendingTotal || 0),
        currency,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getBankList = async (req, res) => {
  try {
    const settings = await getSettingsSnapshot();
    const country = String(req.query?.country || PAYSTACK_BANK_COUNTRY).toLowerCase();
    const currency = String(req.query?.currency || settings?.currency || PAYSTACK_CURRENCY).toUpperCase();
    const type = String(req.query?.type || PAYSTACK_BANK_TYPE).toLowerCase();
    const key = `${country}|${currency}|${type}`;

    const now = Date.now();
    if (
      bankCache.data &&
      bankCache.key === key &&
      now - bankCache.fetchedAt < bankCache.ttlMs
    ) {
      return res.status(200).json({ success: true, data: bankCache.data });
    }

    const response = await paystack.misc.list_banks({
      country,
      currency,
      type,
      perPage: 200,
    });
    const rows = Array.isArray(response?.data) ? response.data : [];
    const banks = rows
      .map(normalizeBankRow)
      .filter((bank) => bank.name && bank.code);

    bankCache.data = banks;
    bankCache.fetchedAt = now;
    bankCache.key = key;

    return res.status(200).json({ success: true, data: banks });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getWalletTransactions = async (req, res) => {
  try {
    const seller = await getSellerProfile(req.userData?.userId);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller profile not found" });
    }

    const rows = await walletTransactionSchema
      .find({ seller: seller._id })
      .sort("-createdAt")
      .limit(200);

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const requestWithdrawal = async (req, res) => {
  let payout = null;
  let debited = false;
  let sellerId = null;
  let amountKobo = 0;
  try {
    const seller = await getSellerProfile(req.userData?.userId);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller profile not found" });
    }
    sellerId = seller._id;

    const settings = await getSettingsSnapshot();
    const currency = String(settings?.currency || PAYSTACK_CURRENCY).toUpperCase();
    const minWithdrawal =
      Number(settings?.minimumWithdrawal ?? MIN_WITHDRAWAL_AMOUNT) || 0;

    const rawAmount = Number(req.body?.amount || 0);
    amountKobo = toKobo(rawAmount);
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      return res.status(400).json({ success: false, message: "Withdrawal amount is required" });
    }

    if (minWithdrawal > 0 && rawAmount < minWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal is ${currency} ${minWithdrawal}`,
      });
    }

    const bankDetails = pickSellerBankDetails(seller, req.body || {});
    if (!bankDetails.bankCode || !bankDetails.accountNumber || !bankDetails.accountName) {
      return res.status(400).json({
        success: false,
        message: "Bank details are required to withdraw",
      });
    }

    if (bankCache.data && bankCache.data.length > 0) {
      const exists = bankCache.data.some((bank) => bank.code === bankDetails.bankCode);
      if (!exists) {
        return res.status(400).json({
          success: false,
          message:
            "Bank code is invalid. Please select a bank from the dropdown list.",
        });
      }
    }

    const updatedSeller = await sellerSchema.findOneAndUpdate(
      { _id: seller._id, walletBalance: { $gte: amountKobo } },
      { $inc: { walletBalance: -amountKobo } },
      { new: true }
    );

    if (!updatedSeller) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }
    debited = true;

    payout = await payoutSchema.create({
      seller: seller._id,
      amount: amountKobo,
      currency,
      status: "processing",
      ...bankDetails,
    });

    const recipientCode = String(updatedSeller.paystackRecipientCode || "").trim();
    const bankChanged =
      String(updatedSeller.bankCode || "").trim() !== bankDetails.bankCode ||
      String(updatedSeller.accountNumber || "").trim() !== bankDetails.accountNumber;
    let finalRecipientCode = bankChanged ? "" : recipientCode;
    if (!finalRecipientCode) {
      const recipientResponse = await paystack.transfer_recipient.create({
        type: "nuban",
        name: bankDetails.accountName,
        account_number: bankDetails.accountNumber,
        bank_code: bankDetails.bankCode,
        currency,
      });
      finalRecipientCode = recipientResponse?.data?.recipient_code || "";
    }

    if (!finalRecipientCode) {
      throw new Error("Unable to create Paystack transfer recipient");
    }

    if (finalRecipientCode !== recipientCode) {
      updatedSeller.paystackRecipientCode = finalRecipientCode;
    }

    updatedSeller.bankName = bankDetails.bankName;
    updatedSeller.bankCode = bankDetails.bankCode;
    updatedSeller.accountNumber = bankDetails.accountNumber;
    updatedSeller.accountName = bankDetails.accountName;
    await updatedSeller.save();

    payout.recipientCode = finalRecipientCode;
    payout.paystackReference = `PAYOUT-${payout._id}-${Date.now()}`;
    await payout.save();

    const transferResponse = await paystack.transfer.create({
      source: "balance",
      amount: amountKobo,
      recipient: finalRecipientCode,
      reason: "Seller withdrawal",
      reference: payout.paystackReference,
    });

    payout.paystackTransferCode = String(transferResponse?.data?.transfer_code || "").trim();
    payout.status = "processing";
    await payout.save();

    await walletTransactionSchema.create({
      seller: seller._id,
      type: "debit",
      source: "withdrawal",
      amount: amountKobo,
      status: "pending",
      reference: payout.paystackReference,
      payout: payout._id,
    });

    return res.status(201).json({ success: true, data: payout });
  } catch (error) {
    if (debited && sellerId && amountKobo > 0) {
      await sellerSchema.findByIdAndUpdate(sellerId, {
        $inc: { walletBalance: amountKobo },
      });
    }
    if (payout) {
      payout.status = "failed";
      payout.failureReason = error?.message || "Withdrawal failed";
      payout.processedAt = new Date();
      await payout.save();
    }
    const message = error?.message || "Withdrawal failed";
    return res.status(500).json({ success: false, message });
  }
};

const refundFailedPayout = async (payout, reason = "") => {
  if (!payout) return null;
  if (["failed", "reversed", "cancelled"].includes(payout.status)) {
    return payout;
  }
  payout.status = reason === "transfer.reversed" ? "reversed" : "failed";
  payout.failureReason = reason;
  payout.processedAt = new Date();
  await payout.save();

  await sellerSchema.findByIdAndUpdate(payout.seller, {
    $inc: { walletBalance: Number(payout.amount || 0) },
  });

  await walletTransactionSchema.create({
    seller: payout.seller,
    type: "credit",
    source: "withdrawal_reversal",
    amount: Number(payout.amount || 0),
    status: "success",
    reference: payout.paystackReference || "",
    payout: payout._id,
  });

  await walletTransactionSchema.updateMany(
    { payout: payout._id, type: "debit" },
    { $set: { status: "failed" } }
  );

  return payout;
};

const markPayoutSuccess = async (payout) => {
  if (!payout) return null;
  if (payout.status === "success") return payout;
  payout.status = "success";
  payout.processedAt = new Date();
  await payout.save();
  await walletTransactionSchema.updateMany(
    { payout: payout._id, type: "debit" },
    { $set: { status: "success" } }
  );
  return payout;
};

const handlePaystackTransferEvent = async (event, data) => {
  if (!data) return null;
  const reference = String(data?.reference || "").trim();
  const transferCode = String(data?.transfer_code || "").trim();
  if (!reference && !transferCode) return null;

  const payout = await payoutSchema.findOne({
    $or: [
      ...(reference ? [{ paystackReference: reference }] : []),
      ...(transferCode ? [{ paystackTransferCode: transferCode }] : []),
    ],
  });

  if (!payout) return null;

  if (event === "transfer.success") {
    return markPayoutSuccess(payout);
  }
  if (event === "transfer.failed" || event === "transfer.reversed") {
    return refundFailedPayout(payout, event);
  }
  return payout;
};

const verifyPaystackSignature = (req) => {
  const signature = req.headers["x-paystack-signature"];
  if (!signature || !process.env.PSSECRETE) return false;
  const hash = crypto
    .createHmac("sha512", process.env.PSSECRETE)
    .update(req.rawBody || "")
    .digest("hex");
  return signature === hash;
};

module.exports = {
  getBankList,
  getWalletSummary,
  getWalletTransactions,
  requestWithdrawal,
  handlePaystackTransferEvent,
  verifyPaystackSignature,
};
