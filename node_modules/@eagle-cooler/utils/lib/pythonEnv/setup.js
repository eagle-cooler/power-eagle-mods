import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { nativeUnzip } from '../utils/native';

/**
 * Check if a path points to a valid Python executable
 * @param {string} pythonPath - Path to check
 * @returns {boolean} Whether the path is valid
 */
export function isValidPythonPath(pythonPath) {
  if (!fs.existsSync(pythonPath)) {
    return false;
  }

  try {
    const result = execSync(`"${pythonPath}" --version`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.toLowerCase().includes('python');
  } catch (error) {
    return false;
  }
}

/**
 * Get Python executable path from a base directory
 * @param {string} baseDir - Base directory to check
 * @returns {string|null} Path to Python executable or null if not found
 */
export function getPythonExeFromDir(baseDir) {
  const possiblePaths = global.eagle?.app?.isWindows
    ? [
        path.join(baseDir, 'bin', 'python.exe'),
        path.join(baseDir, 'Scripts', 'python.exe'),
        path.join(baseDir, 'python.exe'),
      ]
    : [path.join(baseDir, 'bin', 'python'), path.join(baseDir, 'python')];

  for (const pythonPath of possiblePaths) {
    if (fs.existsSync(pythonPath) && isValidPythonPath(pythonPath)) {
      return pythonPath;
    }
  }
  return null;
}

/**
 * Compare version strings
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {number} Comparison result (-1, 0, 1)
 */
function compareVersions(a, b) {
  const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
  const [bMajor, bMinor, bPatch] = b.split('.').map(Number);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/**
 * Find the closest version and its latest build
 * @param {Array<{version: string, build: string}>} versions - Available versions
 * @param {string} targetVersion - Requested version
 * @returns {{version: string, build: string, assets: Array}} Closest version info
 */
function findClosestVersion(versions, targetVersion) {
  // First try exact match
  const exactMatch = versions
    .filter((v) => v.version === targetVersion)
    .sort((a, b) => parseInt(b.build) - parseInt(a.build))[0];

  if (exactMatch) return exactMatch;

  // Get major.minor from target
  const [targetMajor, targetMinor] = targetVersion.split('.').map(Number);

  // Find all versions with same major.minor
  const sameMinor = versions.filter((v) => {
    const [major, minor] = v.version.split('.').map(Number);
    return major === targetMajor && minor === targetMinor;
  });

  if (sameMinor.length > 0) {
    // Return the highest patch version with highest build number
    return sameMinor.sort((a, b) => {
      const versionCompare = compareVersions(b.version, a.version);
      if (versionCompare !== 0) return versionCompare;
      return parseInt(b.build) - parseInt(a.build);
    })[0];
  }

  // Find closest major version
  const sameMajor = versions.filter((v) => {
    const [major] = v.version.split('.').map(Number);
    return major === targetMajor;
  });

  if (sameMajor.length > 0) {
    return sameMajor.sort((a, b) => {
      const versionCompare = compareVersions(b.version, a.version);
      if (versionCompare !== 0) return versionCompare;
      return parseInt(b.build) - parseInt(a.build);
    })[0];
  }

  // Return latest version as fallback
  return versions.sort((a, b) => {
    const versionCompare = compareVersions(b.version, a.version);
    if (versionCompare !== 0) return versionCompare;
    return parseInt(b.build) - parseInt(a.build);
  })[0];
}

/**
 * Get available Python versions from GitHub releases
 * @returns {Promise<Array<{version: string, build: string}>>}
 */
async function getAvailableVersions() {
  try {
    const response = await fetch(
      'https://api.github.com/repos/bjia56/portable-python/releases'
    );
    const releases = await response.json();

    return releases
      .map((release) => {
        const match = release.tag_name.match(
          /cpython-v(\d+\.\d+\.\d+)-build\.(\d+)/
        );
        if (match) {
          return {
            version: match[1],
            build: match[2],
            assets: release.assets,
            tag: release.tag_name,
          };
        }
        return null;
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Failed to fetch Python versions:', error);
    return [];
  }
}

/**
 * Get the download URL for a specific Python version
 * @param {string} version - Python version (e.g., '3.12.8')
 * @param {string} arch - Architecture (default: 'x86_64')
 * @param {string} os - Operating system (default: 'windows')
 * @returns {Promise<string>} Download URL
 */
export async function get_release_download_url(
  version = '3.12.8',
  arch = 'x86_64',
  os = 'windows'
) {
  const response = await fetch(
    'https://api.github.com/repos/bjia56/portable-python/releases'
  );
  const releases = await response.json();

  // Find first release that starts with this version
  const release = releases.find((r) =>
    r.tag_name.startsWith(`cpython-v${version}`)
  );
  if (!release) {
    throw new Error(`No release found for Python ${version}`);
  }

  const assetName = `python-full-${version}-${os}-${arch}.zip`;
  const asset = release.assets.find((a) => a.name === assetName);

  if (!asset) {
    throw new Error(
      `Asset ${assetName} not found in release ${release.tag_name}`
    );
  }

  return asset.browser_download_url;
}

/**
 * Ensure Python environment is set up in the specified location
 * @param {string|Object} options - Either download URL or options object
 * @param {string} [options.downloadUrl] - URL to download Python distribution from
 * @param {string} [options.localPath] - Local path to Python executable
 * @param {string} [options.version] - Python version to download (e.g., '3.12.8')
 * @returns {Promise<string>} Path to the Python executable
 */
export async function ensure_environment(options = { version: '3.12.8' }) {
  console.log('ensure_environment called with options:', options);

  // Handle string input for backward compatibility
  if (typeof options === 'string') {
    options = { downloadUrl: options };
  }

  // Ensure options is an object
  if (!options || typeof options !== 'object') {
    options = { version: '3.12.8' };
  }

  let { downloadUrl, localPath, version = '3.12.8' } = options;
  console.log('Resolved options:', { downloadUrl, localPath, version });

  // If localPath is provided and valid, use it
  if (localPath) {
    const pythonPath = getPythonExeFromDir(localPath);
    if (pythonPath) {
      console.log('Using local Python installation:', pythonPath);
      return pythonPath;
    }
    console.warn('Local Python path invalid, falling back to download');
  }

  // Get download URL from version if not provided
  if (!downloadUrl && version) {
    console.log('Getting download URL for version:', version);
    downloadUrl = await get_release_download_url(version);
    console.log('Resolved download URL:', downloadUrl);
  }

  // Proceed with download if no valid local path
  if (!downloadUrl) {
    throw new Error(
      'Either downloadUrl, valid localPath, or version must be provided'
    );
  }

  const baseDir = path.join(os.homedir(), '.eaglecooler');
  const envDir = path.join(baseDir, 'pythonenv', 'env');
  const tempDir = path.join(baseDir, 'temp', 'pythonenv');

  // Create directories if they don't exist
  [envDir, tempDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const pythonExe = getPythonExeFromDir(envDir);
  if (pythonExe) {
    console.log('Using existing Python installation:', pythonExe);
    return pythonExe;
  }

  // Download and extract Python
  const zipPath = path.join(tempDir, 'python.zip');

  // Download the file
  console.log('Downloading Python...');
  const response = await fetch(downloadUrl);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(zipPath, Buffer.from(buffer));

  // Extract to env directory
  console.log('Extracting Python...');
  await nativeUnzip(zipPath, envDir, true);

  // Move contents from nested directory to root env directory
  const files = fs.readdirSync(envDir);
  const pythonDir = files.find((f) => f.startsWith('python-'));
  if (pythonDir) {
    const nestedDir = path.join(envDir, pythonDir);
    const nestedFiles = fs.readdirSync(nestedDir);

    console.log('Moving files from nested directory to root...');
    for (const file of nestedFiles) {
      const srcPath = path.join(nestedDir, file);
      const destPath = path.join(envDir, file);
      fs.renameSync(srcPath, destPath);
    }

    // Remove the now-empty nested directory
    fs.rmdirSync(nestedDir);
  }

  // Clean up temp file
  fs.unlinkSync(zipPath);

  const finalPythonPath = getPythonExeFromDir(envDir);
  if (!finalPythonPath) {
    throw new Error('Failed to find Python executable after installation');
  }

  console.log('Python environment setup completed.');
  return finalPythonPath;
}

/**
 * Install Python packages using pip
 * @param {string[]} packages - List of packages to install
 * @returns {Promise<void>}
 */
export async function pip_install(packages) {
  const pythonPath = await ensure_environment();

  const command = `"${pythonPath}" -m pip install ${packages.join(' ')}`;
  console.log('Running pip install:', command);
  execSync(command, { stdio: 'inherit' });
}

/**
 * Set up a virtual environment for a specific plugin
 * @param {string} pluginId - The plugin's manifest ID
 * @returns {Promise<string>} Path to the virtual environment
 */
export async function setup_plugin_venv(pluginId) {
  const baseDir = path.join(os.homedir(), '.eaglecooler');
  const pluginEnvDir = path.join(baseDir, 'pythonenv', 'perPlugin', pluginId);

  // Create plugin-specific venv directory
  if (!fs.existsSync(pluginEnvDir)) {
    fs.mkdirSync(pluginEnvDir, { recursive: true });
  }

  const pythonPath = await ensure_environment();

  // Create virtual environment
  console.log(`Creating virtual environment for plugin ${pluginId}...`);
  execSync(`"${pythonPath}" -m venv "${pluginEnvDir}"`, { stdio: 'inherit' });

  return pluginEnvDir;
}
