const mongoose = require("mongoose");

const messageNotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    lastSentAt: { type: Date, default: () => new Date(0) },
  },
  { timestamps: true }
);

messageNotificationSchema.index({ recipient: 1, conversationId: 1 }, { unique: true });
messageNotificationSchema.index({ lastSentAt: 1 });

module.exports =
  mongoose.models.MessageNotification ||
  mongoose.model("MessageNotification", messageNotificationSchema);
