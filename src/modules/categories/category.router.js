const express = require("express");
const {
  create,
  list,
  getById,
  updateById,
  removeById,
} = require("./category.controller.js");

const categoryRouter = express.Router();

categoryRouter.post("/", create);
categoryRouter.get("/", list);
categoryRouter.get("/:id", getById);
categoryRouter.patch("/:id", updateById);
categoryRouter.delete("/:id", removeById);

module.exports = { categoryRouter };

