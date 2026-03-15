const disputeSchema = require("./dispute.schema.js");

const create = async (req, res) => {
  try {
    const doc = await disputeSchema.create(req.body);
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const docs = await disputeSchema.find().sort("-createdAt");
    return res.status(200).json({ success: true, data: docs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await disputeSchema.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Dispute not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateById = async (req, res) => {
  try {
    const doc = await disputeSchema.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Dispute not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeById = async (req, res) => {
  try {
    const doc = await disputeSchema.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Dispute not found" });
    }

    return res.status(200).json({ success: true, message: "Dispute deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  create,
  list,
  getById,
  updateById,
  removeById,
};

