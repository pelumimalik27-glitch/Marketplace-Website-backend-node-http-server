const express = require("express");
const {
  create,
  list,
  getById,
  updateById,
  removeById,
} = require("./commission.controller.js");

const commissionRuleRouter = express.Router();

commissionRuleRouter.post("/", create);
commissionRuleRouter.get("/", list);
commissionRuleRouter.get("/:id", getById);
commissionRuleRouter.patch("/:id", updateById);
commissionRuleRouter.delete("/:id", removeById);

module.exports = { commissionRuleRouter };

