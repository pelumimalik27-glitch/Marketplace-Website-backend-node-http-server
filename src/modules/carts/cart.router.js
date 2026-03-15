const express = require("express");
const {
  create,
  list,
  getById,
  updateById,
  removeById,
  getMyCart,
  addItem,
  updateItem,
  removeItem,
  clearMyCart,
} = require("./cart.controller.js");
const { validateUser } = require("../../middleware/validate_user");

const cartRouter = express.Router();

cartRouter.post("/", create);
cartRouter.get("/", list);
cartRouter.get("/my", validateUser, getMyCart);
cartRouter.post("/items", validateUser, addItem);
cartRouter.patch("/items/:productId", validateUser, updateItem);
cartRouter.delete("/items/:productId", validateUser, removeItem);
cartRouter.delete("/clear", validateUser, clearMyCart);
cartRouter.get("/:id", getById);
cartRouter.patch("/:id", updateById);
cartRouter.delete("/:id", removeById);

module.exports = { cartRouter };

