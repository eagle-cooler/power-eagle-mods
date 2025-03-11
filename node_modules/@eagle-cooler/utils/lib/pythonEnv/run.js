import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { getPythonExeFromDir } from './setup.js';

/**
 * Resolve the Python environment path based on plugin context
 * @param {Object} [options] - Options for resolving Python path
 * @param {string} [options.localPath] - Local path to Python executable
 * @returns {Promise<string|null>} Path to the Python executable or null if not found
 */
async function resolve_python_env(options = {}) {
  const { localPath } = options;

  // If localPath is provided, check if it's valid
  if (localPath) {
    const pythonPath = getPythonExeFromDir(localPath);
    if (pythonPath) {
      return pythonPath;
    }
    console.warn('Local Python path invalid');
  }

  const baseDir = path.join(os.homedir(), '.eaglecooler');
  const globalEnvDir = path.join(baseDir, 'pythonenv', 'env');

  // If we have a plugin context, try plugin-specific environment first
  if (global.eagle?.plugin?.manifest?.id) {
    const pluginId = global.eagle.plugin.manifest.id;
    const pluginEnvDir = path.join(baseDir, 'pythonenv', 'perPlugin', pluginId);

    const pluginPythonPath = getPythonExeFromDir(pluginEnvDir);
    if (pluginPythonPath) {
      return pluginPythonPath;
    }
  }

  // Always check global environment as fallback
  const globalPythonPath = getPythonExeFromDir(globalEnvDir);
  if (globalPythonPath) {
    return globalPythonPath;
  }

  // No valid Python environment found
  return null;
}

/**
 * Run a Python file with given arguments
 * @param {string} filePath - Path to the Python file
 * @param {string[]} args - Arguments to pass to the script
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function stateless_run_file(filePath, args = []) {
  const pythonPath = await resolve_python_env();
  const absoluteFilePath = path.resolve(filePath);

  return new Promise((resolve, reject) => {
    const argsStr = args.map((arg) => `"${arg}"`).join(' ');
    const command = `"${pythonPath}" "${absoluteFilePath}" ${argsStr}`;

    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      resolve({ stdout: result, stderr: '' });
    } catch (error) {
      reject(new Error(`Failed to run Python file: ${error.message}`));
    }
  });
}

/**
 * Import and run a specific function from a Python file
 * @param {string} filePath - Path to the Python file
 * @param {string} funcName - Name of the function to run
 * @param {Object} kwargs - Keyword arguments to pass to the function
 * @returns {Promise<any>} Result of the function execution
 */
async function stateless_run_func(filePath, funcName, kwargs = {}) {
  const pythonPath = await resolve_python_env();
  const absoluteFilePath = path.resolve(filePath);
  const tempDir = path.join(os.homedir(), '.eaglecooler', 'temp', 'pythonenv');
  const tempScriptPath = path.join(tempDir, 'run_func.py');

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create temporary Python script
  const tempScript = `
import json
import sys
from pathlib import Path

# Add the script's directory to Python path
sys.path.append(str(Path("${absoluteFilePath}").parent))

# Import the module
module = __import__("${path.basename(filePath, '.py')}")

# Get the function
func = getattr(module, "${funcName}")

# Parse arguments from command line
kwargs = json.loads(sys.argv[1])

# Run the function
result = func(**kwargs)

# Print result as JSON
print(json.dumps(result))
  `.trim();

  fs.writeFileSync(tempScriptPath, tempScript);

  try {
    const { stdout } = await stateless_run_file(tempScriptPath, [
      JSON.stringify(kwargs),
    ]);
    return JSON.parse(stdout);
  } finally {
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
}

// Export all necessary functions and classes
export {
  resolve_python_env,
  stateless_run_file,
  stateless_run_func
};
