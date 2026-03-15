const express = require("express");
const {
  create,
  list,
  getById,
  updateById,
  removeById,
} = require("./conversation.controller.js");
const { validateUser } = require("../../middleware/validate_user");

const conversationRouter = express.Router();

conversationRouter.use(validateUser);
conversationRouter.post("/", create);
conversationRouter.get("/", list);
conversationRouter.get("/:id", getById);
conversationRouter.patch("/:id", updateById);
conversationRouter.delete("/:id", removeById);

module.exports = { conversationRouter };

