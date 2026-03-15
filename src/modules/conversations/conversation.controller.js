const mongoose = require("mongoose");
const conversationSchema = require("./conversation.schema.js");
const { emitToUsers } = require("../../lib/socket");

const asObjectId = (value) => {
  const text = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(text)) return null;
  return new mongoose.Types.ObjectId(text);
};

const toParticipantIds = (participants = [], currentUserId = "") => {
  const unique = new Set(
    [currentUserId, ...participants]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  return Array.from(unique)
    .map((value) => asObjectId(value))
    .filter(Boolean);
};

const memberQuery = (userId = "") => ({
  participants: asObjectId(userId),
});

const populateParticipants = (query) => query.populate("participants", "_id name email");

const create = async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const participantIds = toParticipantIds(req.body?.participants, userId);
    if (participantIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: "A conversation must contain at least two participants.",
      });
    }

    const existing = await populateParticipants(
      conversationSchema.findOne({
        participants: { $all: participantIds, $size: participantIds.length },
      })
    );

    if (existing) {
      return res.status(200).json({ success: true, data: existing });
    }

    const doc = await conversationSchema.create({
      participants: participantIds,
      lastMessage: String(req.body?.lastMessage || "").trim(),
    });
    const hydrated = await populateParticipants(conversationSchema.findById(doc._id));

    emitToUsers(
      participantIds.map((item) => String(item)),
      "chat:conversation",
      { conversation: hydrated }
    );

    return res.status(201).json({ success: true, data: hydrated });
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

    const participantFilter = String(req.query?.participantId || "").trim();
    const query = {
      ...memberQuery(userId),
    };
    if (participantFilter && mongoose.Types.ObjectId.isValid(participantFilter)) {
      query.participants = {
        $all: [asObjectId(userId), asObjectId(participantFilter)],
      };
    }

    const docs = await populateParticipants(
      conversationSchema.find(query).sort("-updatedAt")
    );
    return res.status(200).json({ success: true, data: docs });
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

    const doc = await populateParticipants(
      conversationSchema.findOne({
        _id: req.params.id,
        ...memberQuery(userId),
      })
    );
    if (!doc) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    return res.status(200).json({ success: true, data: doc });
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

    const payload = {};
    if (typeof req.body?.lastMessage === "string") {
      payload.lastMessage = req.body.lastMessage.trim();
    }

    const doc = await populateParticipants(
      conversationSchema.findOneAndUpdate(
        { _id: req.params.id, ...memberQuery(userId) },
        payload,
        { new: true, runValidators: true }
      )
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    emitToUsers(
      (doc.participants || []).map((participant) => String(participant?._id || participant)),
      "chat:conversation",
      { conversation: doc }
    );

    return res.status(200).json({ success: true, data: doc });
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

    const doc = await conversationSchema.findOneAndDelete({
      _id: req.params.id,
      ...memberQuery(userId),
    });
    if (!doc) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    return res.status(200).json({ success: true, message: "Conversation deleted" });
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
