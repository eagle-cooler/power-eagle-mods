const { Py } = require('@eagle-cooler/utils');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class PythonEnvironmentManager {
    constructor() {
        this.version = '3.12.8';
        this.sourceUrl = '';
        this.localPath = '';
        this.sourceType = 'version'; // 'version', 'url', or 'local'
        this.isEnvSet = false;
        this.isLoading = false;
        this.shellOutput = '';
        this.subscriber = null;
        this.availableVersions = [];
        this.cacheFile = path.join(eagle.os.homedir(), '.eaglecooler', 'pythonenv', 'cache', 'versions.json');
    }

    async ensureCacheDirectory() {
        const cacheDir = path.dirname(this.cacheFile);
        try {
            await fs.promises.mkdir(cacheDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create cache directory:', error);
        }
    }

    async loadVersionsFromCache() {
        try {
            const cacheData = await fs.promises.readFile(this.cacheFile, 'utf8');
            const cache = JSON.parse(cacheData);
            
            // Check if cache is older than 24 hours
            const now = Date.now();
            if (now - cache.timestamp > 24 * 60 * 60 * 1000) {
                return null; // Cache is too old
            }
            
            return cache.versions;
        } catch (error) {
            return null; // Cache doesn't exist or is invalid
        }
    }

    async saveVersionsToCache(versions) {
        try {
            await this.ensureCacheDirectory();
            const cacheData = {
                versions: versions,
                timestamp: Date.now()
            };
            await fs.promises.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
        } catch (error) {
            console.error('Failed to save versions cache:', error);
        }
    }

    async loadAvailableVersions() {
        try {
            // Try to load from cache first
            const cachedVersions = await this.loadVersionsFromCache();
            if (cachedVersions) {
                this.availableVersions = cachedVersions;
                // Update UI with cached versions
                const versionLabel = document.querySelector('label[for="python-version"]');
                if (versionLabel) {
                    versionLabel.textContent = `Python Version (Available: ${this.availableVersions.join(', ')})`;
                }
                return; // Use cached versions
            }

            // If cache is invalid or old, fetch new versions
            const downloadInfo = await Py.Setup.get_release_download_url(this.version);
            console.log('Received download info:', downloadInfo); // Debug log
            
            if (!downloadInfo || !downloadInfo.versions) {
                throw new Error('No version information received');
            }
            
            this.availableVersions = downloadInfo.versions;
            
            // Save the new versions to cache
            await this.saveVersionsToCache(this.availableVersions);
            
            // Update the version input label with available versions
            const versionLabel = document.querySelector('label[for="python-version"]');
            if (versionLabel) {
                versionLabel.textContent = `Python Version (Available: ${this.availableVersions.join(', ')})`;
            }
        } catch (error) {
            console.error('Failed to load available versions:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });

            // Try to load from cache as fallback
            const cachedVersions = await this.loadVersionsFromCache();
            if (cachedVersions) {
                this.availableVersions = cachedVersions;
            } else {
                // If no cache available, use default version
                this.availableVersions = [this.version];
            }

            const versionLabel = document.querySelector('label[for="python-version"]');
            if (versionLabel) {
                versionLabel.textContent = `Python Version (${cachedVersions ? 'Cached' : 'Default'}: ${this.availableVersions.join(', ')})`;
            }
        }
    }

    async checkEnvironment() {
        try {
            console.log('Checking Python environment...');
            const pythonPath = await Py.resolve_python_env();
            console.log('Resolved Python path:', pythonPath);
            
            // Actually verify the Python executable exists
            if (!pythonPath || !fs.existsSync(pythonPath)) {
                console.log('Python executable not found at:', pythonPath);
                this.isEnvSet = false;
                return false;
            }

            this.isEnvSet = true;
            console.log('Environment check successful:', {
                isEnvSet: this.isEnvSet,
                pythonPath,
                sourceType: this.sourceType,
                version: this.version,
                sourceUrl: this.sourceUrl,
                localPath: this.localPath,
                exists: fs.existsSync(pythonPath)
            });
            return true;
        } catch (error) {
            console.error('Environment check failed:', error);
            this.isEnvSet = false;
            return false;
        }
    }

    async resetEnvironment() {
        if (this.subscriber) {
            this.subscriber.cleanup();
            this.subscriber = null;
        }

        // If it's a local environment, just clear the path
        if (this.sourceType === 'local') {
            this.localPath = '';
            this.isEnvSet = false;
            console.log('Reset local environment');
            return true;
        }

        // For version or URL, attempt to remove the environment
        try {
            // TODO: Implement environment removal in Setup module
            // For now, just reset the state
            this.isEnvSet = false;
            console.log('Reset environment state');
            return true;
        } catch (error) {
            eagle.dialog.showMessageBox({
                type: 'error',
                message: 'Failed to reset environment: ' + error.message
            });
            return false;
        }
    }

    async setupEnvironment() {
        this.isLoading = true;
        try {
            let options = {};
            switch (this.sourceType) {
                case 'version':
                    options = { version: this.version };
                    break;
                case 'url':
                    options = { downloadUrl: this.sourceUrl };
                    break;
                case 'local':
                    if (!this.localPath) {
                        throw new Error('Local path not selected');
                    }
                    options = { localPath: this.localPath };
                    break;
            }

            await Py.Setup.ensure_environment(options);
            this.isEnvSet = true;
            console.log('Setup environment:', {
                sourceType: this.sourceType,
                options,
                isEnvSet: this.isEnvSet
            });
            eagle.dialog.showMessageBox({
                type: 'info',
                message: 'Python environment has been set up successfully.'
            });
            return true;
        } catch (error) {
            console.error('Setup environment failed:', error);
            eagle.dialog.showMessageBox({
                type: 'error',
                message: 'Failed to set up Python environment: ' + error.message
            });
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    async startShell() {
        if (!this.isEnvSet) {
            console.error('Cannot start shell: Python environment is not set up');
            eagle.dialog.showMessageBox({
                type: 'error',
                message: 'Please set up Python environment first.'
            });
            return;
        }

        try {
            const pythonPath = await Py.resolve_python_env();
            
            // Spawn Python in interactive mode
            this.pythonProcess = spawn(pythonPath, ['-i'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Helper function to escape HTML
            const escapeHtml = (text) => {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            };
            
            // Handle stdout
            this.pythonProcess.stdout.on('data', (data) => {
                const text = escapeHtml(data.toString());
                this.shellOutput += text;
                // Update the output
                const outputArea = document.getElementById('shell-output');
                if (outputArea) {
                    outputArea.innerHTML = this.shellOutput;
                    outputArea.scrollTop = outputArea.scrollHeight;
                }
            });

            // Handle stderr (including Python's startup messages and prompts)
            this.pythonProcess.stderr.on('data', (data) => {
                const text = escapeHtml(data.toString());
                this.shellOutput += text;
                // Update the output
                const outputArea = document.getElementById('shell-output');
                if (outputArea) {
                    outputArea.innerHTML = this.shellOutput;
                    outputArea.scrollTop = outputArea.scrollHeight;
                }
            });

            // Handle process exit
            this.pythonProcess.on('exit', (code) => {
                console.log(`Python process exited with code ${code}`);
                this.pythonProcess = null;
                const startButton = document.getElementById('start-shell');
                const inputField = document.getElementById('shell-input');
                if (startButton && inputField) {
                    startButton.textContent = 'Start Shell';
                    startButton.disabled = false;
                    inputField.disabled = true;
                }
            });

        } catch (error) {
            console.error('Failed to start Python shell:', error);
            eagle.dialog.showMessageBox({
                type: 'error',
                message: 'Failed to start Python shell: ' + error.message
            });
        }
    }

    async sendCommand(command) {
        if (!this.pythonProcess) return;

        try {
            // Add the command to the output with HTML for blue color
            const escapedCommand = command.replace(/[<>&"']/g, c => ({
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#39;'
            })[c]);
            this.shellOutput += `<span class="user-input">${escapedCommand}</span>\n`;
            
            const outputArea = document.getElementById('shell-output');
            if (outputArea) {
                outputArea.innerHTML = this.shellOutput;
                outputArea.scrollTop = outputArea.scrollHeight;
            }
            
            // Send the command to the Python process
            this.pythonProcess.stdin.write(command + '\n');
        } catch (error) {
            console.error('Failed to send command:', error);
            eagle.dialog.showMessageBox({
                type: 'error',
                message: 'Failed to send command: ' + error.message
            });
        }
    }

    cleanup() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
    }
}

module.exports = {
    name: 'Python Environment',
    styles: ['styles.css'],
    render: () => `
        <div class="python-env">
            <div class="env-section">
                <h2>Python Environment Setup</h2>
                <div class="source-type-selector">
                    <label class="radio-label">
                        <input type="radio" name="source-type" value="version" checked>
                        Use Version
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="source-type" value="url">
                        Use URL
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="source-type" value="local">
                        Use Local Directory
                    </label>
                </div>

                <div id="version-input" class="source-input">
                    <div class="form-group">
                        <label for="python-version">Python Version (Loading available versions...)</label>
                        <input type="text" id="python-version" value="3.12.8" placeholder="e.g., 3.12.8">
                    </div>
                </div>

                <div id="url-input" class="source-input" style="display: none;">
                    <div class="form-group">
                        <label for="source-url">Download URL</label>
                        <input type="text" id="source-url" placeholder="Enter Python distribution URL">
                    </div>
                </div>

                <div id="local-input" class="source-input" style="display: none;">
                    <div class="form-group">
                        <label for="local-path">Python Directory</label>
                        <div class="path-input-container">
                            <input type="text" id="local-path" readonly placeholder="Select Python directory">
                            <button id="select-directory" class="secondary-button">Browse</button>
                        </div>
                    </div>
                </div>

                <div class="button-container">
                    <button id="setup-env" class="primary-button">Set up Python Environment</button>
                    <button id="reset-env" class="secondary-button" style="display: none;">Reset Environment</button>
                </div>
                <div id="env-status" class="status-message" style="display: none;">
                    Environment is already set up
                </div>
            </div>

            <div class="shell-section">
                <h2>Python Interactive Shell</h2>
                <pre id="shell-output" class="shell-output" readonly></pre>
                <div class="shell-input-container">
                    <input type="text" id="shell-input" class="shell-input" placeholder="Enter Python commands..." disabled>
                    <button id="start-shell" class="primary-button">Start Shell</button>
                </div>
            </div>
        </div>
    `,

    mount: (container) => {
        const manager = new PythonEnvironmentManager();

        // Load available versions on mount
        manager.loadAvailableVersions();

        // Debounce function
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Add version input change handler with debouncing
        const versionInput = document.getElementById('python-version');
        if (versionInput) {
            const debouncedLoadVersions = debounce(() => {
                manager.loadAvailableVersions();
            }, 500); // Wait 500ms after last input before making API call

            versionInput.addEventListener('input', (e) => {
                manager.version = e.target.value;
                debouncedLoadVersions();
            });
        }

        function updateUIState(isEnvSet) {
            const statusEl = document.getElementById('env-status');
            const setupButton = document.getElementById('setup-env');
            const resetButton = document.getElementById('reset-env');
            const startShellButton = document.getElementById('start-shell');
            const shellInput = document.getElementById('shell-input');
            const radioButtons = document.querySelectorAll('input[name="source-type"]');

            statusEl.style.display = isEnvSet ? 'block' : 'none';
            setupButton.disabled = isEnvSet;
            resetButton.style.display = isEnvSet ? 'inline-block' : 'none';
            
            // Disable/enable radio buttons
            radioButtons.forEach(radio => {
                radio.disabled = isEnvSet;
            });
            
            if (!isEnvSet) {
                startShellButton.disabled = true;
                shellInput.disabled = true;
                startShellButton.textContent = 'Start Shell';
            }
        }

        // Check environment status on mount
        manager.checkEnvironment().then(isSet => {
            updateUIState(isSet);
        });

        // Source type radio buttons
        const radioButtons = document.querySelectorAll('input[name="source-type"]');
        const sourceInputs = {
            version: document.getElementById('version-input'),
            url: document.getElementById('url-input'),
            local: document.getElementById('local-input')
        };

        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // Only allow changes if environment is not set
                if (!manager.isEnvSet) {
                    // Hide all inputs
                    Object.values(sourceInputs).forEach(input => {
                        input.style.display = 'none';
                    });
                    // Show selected input
                    sourceInputs[e.target.value].style.display = 'block';
                    manager.sourceType = e.target.value;
                }
            });
        });

        // Directory selection
        document.getElementById('select-directory').addEventListener('click', async () => {
            const result = await eagle.dialog.showOpenDialog({
                properties: ['openDirectory']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                document.getElementById('local-path').value = result.filePaths[0];
                manager.localPath = result.filePaths[0];
            }
        });

        // Reset environment button
        document.getElementById('reset-env').addEventListener('click', async () => {
            if (await manager.resetEnvironment()) {
                // Clear input fields based on source type
                if (manager.sourceType === 'local') {
                    document.getElementById('local-path').value = '';
                }
                updateUIState(false);
            }
        });

        // Setup environment button
        document.getElementById('setup-env').addEventListener('click', async () => {
            switch (manager.sourceType) {
                case 'version':
                    manager.version = document.getElementById('python-version').value;
                    break;
                case 'url':
                    manager.sourceUrl = document.getElementById('source-url').value;
                    break;
                case 'local':
                    manager.localPath = document.getElementById('local-path').value;
                    break;
            }

            await manager.setupEnvironment();
            updateUIState(manager.isEnvSet);
        });

        // Start shell button
        document.getElementById('start-shell').addEventListener('click', async () => {
            const startButton = document.getElementById('start-shell');
            const inputField = document.getElementById('shell-input');
            
            if (!manager.pythonProcess) {
                await manager.startShell();
                if (manager.pythonProcess) {
                    startButton.textContent = 'Shell Running';
                    startButton.disabled = true;
                    inputField.disabled = false;
                }
            }
        });

        // Shell input handling
        const shellInput = document.getElementById('shell-input');
        shellInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Allow multiline input with Shift+Enter
                    return;
                }
                e.preventDefault();
                const command = shellInput.value;
                if (command.trim()) {
                    await manager.sendCommand(command);
                    shellInput.value = '';
                }
            }
        });

        // Cleanup on unmount
        return () => {
            manager.cleanup();
        };
    }
};
