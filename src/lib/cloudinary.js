const cloudinary = require("cloudinary").v2;

let isConfigured = false;

const ensureConfigured = () => {
  if (isConfigured) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary credentials are not configured");
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  isConfigured = true;
};

const isDataUrl = (value) => {
  if (!value) return false;
  return /^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(String(value));
};

const uploadImageData = async (dataUrl, options = {}) => {
  ensureConfigured();
  return cloudinary.uploader.upload(dataUrl, {
    resource_type: "image",
    ...options,
  });
};

module.exports = {
  isDataUrl,
  uploadImageData,
};
