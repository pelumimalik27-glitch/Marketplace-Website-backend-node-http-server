const express = require("express");
const { createReview, getProductReviews, updateReview, deleteReview } = require("./review.controller");
const { validateUser } = require("../../middleware/validate_user");

const reviewRouter = express.Router();

reviewRouter.post("/", validateUser, createReview);
reviewRouter.get("/product/:productId", getProductReviews);
reviewRouter.get("/:id", getProductReviews);
reviewRouter.patch("/:id", validateUser, updateReview);
reviewRouter.delete("/:id", validateUser, deleteReview);

module.exports = { reviewRouter };

