import { execSync } from 'child_process';
import path from 'path';

/**
 * Unzip a file using native OS commands
 * @param {string} zipPath - Path to the zip file
 * @param {string} destPath - Destination directory
 * @param {boolean} overwrite - Whether to overwrite existing files
 * @returns {Promise<void>}
 */
export async function nativeUnzip(zipPath, destPath, overwrite = false) {
  if (!eagle.app.isWindows && !eagle.app.isMac) {
    throw new Error('Unsupported operating system');
  }

  // Ensure paths are absolute and properly formatted
  const absoluteZipPath = path.resolve(zipPath);
  const absoluteDestPath = path.resolve(destPath);

  if (eagle.app.isWindows) {
    // Use PowerShell's Expand-Archive on Windows
    const overwriteFlag = overwrite ? '-Force' : '';
    const command = `powershell.exe -Command "Expand-Archive -Path '${absoluteZipPath}' -DestinationPath '${absoluteDestPath}' ${overwriteFlag}"`;
    execSync(command, { stdio: 'inherit' });
  } else if (eagle.app.isMac) {
    // Use unzip command on macOS
    const overwriteFlag = overwrite ? '-o' : '';
    const command = `unzip ${overwriteFlag} "${absoluteZipPath}" -d "${absoluteDestPath}"`;
    execSync(command, { stdio: 'inherit' });
  }
}

/**
 * Check if a command is available in the system
 * @param {string} command - Command to check
 * @returns {boolean}
 */
export function isCommandAvailable(command) {
  try {
    if (eagle.app.isWindows) {
      execSync(`where ${command}`, { stdio: 'ignore' });
    } else {
      execSync(`which ${command}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}
