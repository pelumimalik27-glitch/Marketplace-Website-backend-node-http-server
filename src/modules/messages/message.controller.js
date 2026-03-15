const mongoose = require("mongoose");
const messageSchema = require("./message.schema.js");
const conversationSchema = require("../conversations/conversation.schema");
const userSchema = require("../users/user.schema");
const sellerSchema = require("../sellers/seller.schema");
const messageNotificationSchema = require("./message.notification.schema");
const { emitToUsers, isUserOnline } = require("../../lib/socket");
const { notifyNewMessage } = require("../../lib/mail.notifier");

const NOTIFICATION_COOLDOWN_MS = Number(process.env.MESSAGE_NOTIFICATION_COOLDOWN_MS) || 10 * 60 * 1000;

const asObjectId = (value) => {
  const text = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(text)) return null;
  return new mongoose.Types.ObjectId(text);
};

const ensureConversationMember = async (conversationId = "", userId = "") => {
  const conversationObjectId = asObjectId(conversationId);
  const userObjectId = asObjectId(userId);
  if (!conversationObjectId || !userObjectId) return null;

  return conversationSchema.findOne({
    _id: conversationObjectId,
    participants: userObjectId,
  });
};

const serializeMessage = (doc = {}) => {
  const raw = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  return {
    ...raw,
    conversationId: String(raw?.conversationId || ""),
    senderId: String(raw?.senderId || ""),
  };
};

const getFrontendBaseUrl = () =>
  String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

const shouldSendOfflineEmail = async (recipientId, conversationId) => {
  const now = Date.now();
  const cooldownCutoff = new Date(now - NOTIFICATION_COOLDOWN_MS);

  const existing = await messageNotificationSchema.findOne({
    recipient: recipientId,
    conversationId,
  });

  if (existing && existing.lastSentAt && existing.lastSentAt > cooldownCutoff) {
    return false;
  }

  if (existing) {
    existing.lastSentAt = new Date(now);
    await existing.save();
    return true;
  }

  try {
    await messageNotificationSchema.create({
      recipient: recipientId,
      conversationId,
      lastSentAt: new Date(now),
    });
    return true;
  } catch (error) {
    // Handle race on unique index.
    if (error?.code !== 11000) throw error;
    const latest = await messageNotificationSchema.findOne({
      recipient: recipientId,
      conversationId,
    });
    if (!latest || !latest.lastSentAt || latest.lastSentAt <= cooldownCutoff) {
      await messageNotificationSchema.findOneAndUpdate(
        { recipient: recipientId, conversationId },
        { $set: { lastSentAt: new Date(now) } }
      );
      return true;
    }
    return false;
  }
};

const triggerOfflineMessageEmails = async ({ conversation, senderId, content }) => {
  const participantIds = Array.isArray(conversation?.participants)
    ? conversation.participants.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const recipientIds = participantIds.filter((id) => id !== String(senderId || ""));
  if (recipientIds.length === 0) return;

  const senderUser = await userSchema.findById(senderId).select("name email").lean();
  const sellerProfile = await sellerSchema
    .findOne({ user: senderId })
    .select("storeName")
    .lean();
  const senderName =
    String(sellerProfile?.storeName || "").trim() ||
    String(senderUser?.name || "").trim() ||
    String(senderUser?.email || "").trim() ||
    "Marketplace User";

  for (const recipientId of recipientIds) {
    if (isUserOnline(recipientId)) continue;

    const shouldNotify = await shouldSendOfflineEmail(recipientId, conversation._id);
    if (!shouldNotify) continue;

    const recipientUser = await userSchema
      .findById(recipientId)
      .select("name email")
      .lean();
    if (!recipientUser?.email) continue;

    const actionUrl = `${getFrontendBaseUrl()}/messages?conversation=${conversation._id}`;
    await notifyNewMessage({
      recipientEmail: recipientUser.email,
      recipientName: recipientUser.name || "",
      senderName,
      preview: content,
      conversationId: String(conversation._id),
      actionUrl,
    });
  }
};

const create = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const senderObjectId = asObjectId(userId);
    if (!senderObjectId) {
      return res.status(401).json({ success: false, message: "Invalid authenticated user" });
    }

    const conversationId = String(req.body?.conversationId || "").trim();
    const content = String(req.body?.content || "").trim();
    if (!conversationId || !content) {
      return res.status(400).json({
        success: false,
        message: "conversationId and content are required",
      });
    }

    const conversation = await ensureConversationMember(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found for this user",
      });
    }

    const doc = await messageSchema.create({
      conversationId: conversation._id,
      senderId: senderObjectId,
      content,
    });

    conversation.lastMessage = content;
    await conversation.save();

    const payload = serializeMessage(doc);
    emitToUsers(
      (conversation.participants || []).map((participant) => String(participant)),
      "chat:message",
      {
        message: payload,
        conversationId: String(conversation._id),
      }
    );

    emitToUsers(
      (conversation.participants || []).map((participant) => String(participant)),
      "chat:conversation",
      {
        conversation: {
          _id: String(conversation._id),
          participants: conversation.participants,
          lastMessage: conversation.lastMessage,
          updatedAt: conversation.updatedAt,
          createdAt: conversation.createdAt,
        },
      }
    );

    triggerOfflineMessageEmails({
      conversation,
      senderId: userId,
      content,
    }).catch((error) => {
      console.error(`Message offline notification failed: ${error?.message || error}`);
    });

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

  const list = async (req, res) => {
    try {
      const userId = req.userData?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const userObjectId = asObjectId(userId);
      if (!userObjectId) {
        return res.status(401).json({ success: false, message: "Invalid authenticated user" });
      }
      const visibilityFilter = { deletedFor: { $nin: [userObjectId] } };

    const conversationId = String(req.query?.conversationId || "").trim();

    if (conversationId) {
      const conversation = await ensureConversationMember(conversationId, userId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found for this user",
        });
      }

      const docs = await messageSchema
        .find({ conversationId: conversation._id, ...visibilityFilter })
        .sort("createdAt")
        .lean();
      return res.status(200).json({ success: true, data: docs.map(serializeMessage) });
    }

    const conversations = await conversationSchema
      .find({ participants: asObjectId(userId) })
      .select("_id")
      .lean();
    const conversationIds = conversations.map((item) => item._id);

    const docs = await messageSchema
      .find({ conversationId: { $in: conversationIds }, ...visibilityFilter })
      .sort("-createdAt")
      .lean();
    return res.status(200).json({ success: true, data: docs.map(serializeMessage) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

  const getById = async (req, res) => {
    try {
      const userId = req.userData?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const doc = await messageSchema.findById(req.params.id).lean();
      if (!doc) {
        return res.status(404).json({ success: false, message: "Message not found" });
      }

      const conversation = await ensureConversationMember(doc.conversationId, userId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Message not found" });
      }
      const userObjectId = asObjectId(userId);
      const deletedFor = Array.isArray(doc?.deletedFor) ? doc.deletedFor : [];
      if (userObjectId && deletedFor.some((id) => String(id) === String(userObjectId))) {
        return res.status(404).json({ success: false, message: "Message not found" });
      }

    return res.status(200).json({ success: true, data: serializeMessage(doc) });
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

    const existing = await messageSchema.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    const conversation = await ensureConversationMember(existing.conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    const payload = {};
    if (typeof req.body?.isRead === "boolean") {
      payload.isRead = req.body.isRead;
    }
    if (String(existing.senderId) === String(userId) && typeof req.body?.content === "string") {
      payload.content = req.body.content.trim();
    }

    const doc = await messageSchema.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({ success: true, data: serializeMessage(doc) });
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

      const existing = await messageSchema.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Message not found" });
      }
      const conversation = await ensureConversationMember(existing.conversationId, userId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Message not found" });
      }

      const userObjectId = asObjectId(userId);
      if (!userObjectId) {
        return res.status(401).json({ success: false, message: "Invalid authenticated user" });
      }

      const updated = await messageSchema.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { deletedFor: userObjectId } },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({ success: false, message: "Message not found" });
      }

      const participantIds = Array.isArray(conversation?.participants)
        ? conversation.participants.map((value) => String(value))
        : [];
      const deletedForIds = Array.isArray(updated?.deletedFor)
        ? updated.deletedFor.map((value) => String(value))
        : [];
      const allDeleted =
        participantIds.length > 0 && participantIds.every((id) => deletedForIds.includes(id));
      if (allDeleted) {
        await messageSchema.deleteOne({ _id: updated._id });
      }

      return res.status(200).json({ success: true, message: "Message deleted" });
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
