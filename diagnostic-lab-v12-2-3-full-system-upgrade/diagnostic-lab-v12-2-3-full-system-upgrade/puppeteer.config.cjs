const path = require("node:path");

module.exports = {
  // Prevent Puppeteer's dependency installer from downloading twice.
  // The package postinstall script checks for a system browser first and
  // installs the required Puppeteer Chrome build only when necessary.
  skipDownload: true,
  cacheDirectory: path.join(__dirname, ".cache", "puppeteer")
};
