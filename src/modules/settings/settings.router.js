const express = require("express");
const { getSettings, updateSettings } = require("./settings.controller");

const settingsRouter = express.Router();

settingsRouter.get("/", getSettings);
settingsRouter.put("/", updateSettings);

module.exports = { settingsRouter };
