const express = require("express");
const {
  create,
  list,
  getById,
  updateById,
  removeById,
} = require("./seller.controller.js");
const { validateUser } = require("../../middleware/validate_user");
const { sellerAuth } = require("../../middleware/seller_auth");

const sellerRouter = express.Router();

sellerRouter.post("/", validateUser, create);
sellerRouter.get("/", validateUser, sellerAuth, list);
sellerRouter.get("/:id", validateUser, sellerAuth, getById);
sellerRouter.patch("/:id", validateUser, sellerAuth, updateById);
sellerRouter.delete("/:id", validateUser, sellerAuth, removeById);

module.exports = { sellerRouter };

