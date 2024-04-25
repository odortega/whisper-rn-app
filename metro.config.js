const { getDefaultConfig } = require("expo/metro-config");

const defaultConfig = getDefaultConfig(__dirname);

const defaultAssetExts =
  require("metro-config/src/defaults/defaults").assetExts;

module.exports = {
  // Use the default Expo configuration as the base
  ...defaultConfig,
  // Add your custom configuration options here
  resolver: {
    assetExts: [
      ...defaultAssetExts,
      "bin", // whisper.rn: ggml model binary
      "mil", // whisper.rn: CoreML model asset
    ],
  },
  // You can also customize other options like transformer, serializer etc.
};
