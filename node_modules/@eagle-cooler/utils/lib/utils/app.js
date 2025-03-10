import os from 'os';
import path from 'path';

/*global eagle*/

// eslint-disable-next-line jsdoc/require-returns-check
/**
 * Get the roaming directory path for the application
 * @return {string} The roaming directory path
 */
function roamingPath() {
  if (eagle.app.isWindows) {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Eagle');
  } else if (eagle.app.isMac) {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Eagle');
  }
}

export { roamingPath };
