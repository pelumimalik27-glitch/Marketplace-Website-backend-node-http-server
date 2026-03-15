const express = require("express");
const {
  create,
  list,
  getById,
  updateById,
  removeById,
} = require("./dispute.controller.js");

const disputeRouter = express.Router();

disputeRouter.post("/", create);
disputeRouter.get("/", list);
disputeRouter.get("/:id", getById);
disputeRouter.patch("/:id", updateById);
disputeRouter.delete("/:id", removeById);

module.exports = { disputeRouter };

