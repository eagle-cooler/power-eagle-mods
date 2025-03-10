/* eslint-disable no-undef */
const LibraryIDToPath = new Map();

/**
 * Get the library ID for a given path
 * @param {string} [path] - The path to get the library ID for
 * @return {string} The library ID
 */
function getLibraryId(path = null) {
  if (!path) {
    path = eagle.library.path;
  }

  if (LibraryIDToPath.has(path)) {
    return LibraryIDToPath.get(path);
  }

  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  hash.update(path);
  const hex = hash.digest('hex');
  LibraryIDToPath.set(path, hex);
  return hex;
}

export { getLibraryId };
