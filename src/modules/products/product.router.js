const express = require("express");
const {
  create,
  list,
  getById,
  updateById,
  removeById,
} = require("./product.controller.js");
const { validateUser } = require("../../middleware/validate_user");
const { sellerAuth } = require("../../middleware/seller_auth");

const productRouter = express.Router();

productRouter.post("/", validateUser, sellerAuth, create);
productRouter.get("/", list);
productRouter.get("/:id", getById);
productRouter.patch("/:id", validateUser, sellerAuth, updateById);
productRouter.delete("/:id", validateUser, sellerAuth, removeById);

module.exports = { productRouter };

