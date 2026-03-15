const categorySchema = require("./category.schema.js");

const create = async (req, res) => {
  try {
    const doc = await categorySchema.create(req.body);
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const docs = await categorySchema.find().sort("-createdAt");
    return res.status(200).json({ success: true, data: docs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await categorySchema.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateById = async (req, res) => {
  try {
    const doc = await categorySchema.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const removeById = async (req, res) => {
  try {
    const doc = await categorySchema.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.status(200).json({ success: true, message: "Category deleted" });
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

