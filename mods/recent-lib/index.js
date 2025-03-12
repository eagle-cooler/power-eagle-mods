const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const {EagleApi} = require('@eagle-cooler/utils');

const execAsync = util.promisify(exec);
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

module.exports = {
    name: 'Recent Libraries',
    description: 'View and manage your recent Eagle libraries',

    async getRecentLibraries() {
        try {
            // Get the roaming path for Eagle settings
            const roamingPath = process.env.APPDATA || 
                              (process.platform === 'darwin' ? 
                               process.env.HOME + '/Library/Application Support' : 
                               process.env.HOME + "/.local/share");
            const settingsPath = path.join(roamingPath, 'eagle', 'Settings');
            
            const settingsData = await readFileAsync(settingsPath, 'utf8');
            const settings = JSON.parse(settingsData);
            
            return settings.libraryHistory || [];
        } catch (error) {
            console.error('Failed to read recent libraries:', error);
            return [];
        }
    },

    async checkLibraryValidity(libraryPath) {
        try {
            await fs.promises.access(libraryPath);
            return true;
        } catch {
            return false;
        }
    },

    async clearInvalidPaths() {
        try {
            const roamingPath = process.env.APPDATA || 
                              (process.platform === 'darwin' ? 
                               process.env.HOME + '/Library/Application Support' : 
                               process.env.HOME + "/.local/share");
            const settingsPath = path.join(roamingPath, 'eagle', 'Settings');
            
            const settingsData = await readFileAsync(settingsPath, 'utf8');
            const settings = JSON.parse(settingsData);
            
            // Filter out invalid paths
            const validPaths = [];
            for (const path of settings.libraryHistory) {
                if (await this.checkLibraryValidity(path)) {
                    validPaths.push(path);
                }
            }
            
            settings.libraryHistory = validPaths;
            await writeFileAsync(settingsPath, JSON.stringify(settings, null, 2));
            
            return validPaths;
        } catch (error) {
            console.error('Failed to clear invalid paths:', error);
            throw error;
        }
    },

    async switchLibrary(libraryPath) {
        try {
            return await EagleApi.library.switch(libraryPath);
        } catch (error) {
            console.error('Failed to switch library:', error);
            throw error;
        }
    },

    styles: ['styles.css'],
    
    render: () => `
        <div class="recent-libraries-container">
            <div class="recent-lib-search-section">
                <div class="search-container">
                    <input type="text" id="library-search" placeholder="Filter libraries...">
                </div>
                <div class="button-container">
                    <button id="clear-invalid" class="clear-invalid-btn">Clear Invalid Paths</button>
                </div>
            </div>
            <div class="content-section">
                <div id="library-results"></div>
            </div>
        </div>
    `,

    mount: async (container) => {
        const searchInput = container.querySelector('#library-search');
        const resultsDiv = container.querySelector('#library-results');
        const clearInvalidBtn = container.querySelector('#clear-invalid');
        let searchTimeout = null;
        let libraries = [];

        function formatLibraryItem(libraryPath, isValid) {
            const dirname = path.dirname(libraryPath);
            const basename = path.basename(libraryPath, '.library');
            const statusIcon = isValid ? 
                '<span class="status-icon valid">✓</span>' : 
                '<span class="status-icon invalid">⚠</span>';
            
            return `
                <li class="library-item ${isValid ? 'valid' : 'invalid'}" data-path="${libraryPath}">
                    <div class="library-info">
                        <div class="library-name">${basename} ${statusIcon}</div>
                        <div class="library-path">${dirname}</div>
                    </div>
                </li>
            `;
        }

        async function handleLibraryClick(e) {
            const libraryItem = e.target.closest('.library-item');
            if (!libraryItem) return;

            const libraryPath = libraryItem.dataset.path;
            libraryItem.classList.add('switching');

            try {
                await module.exports.switchLibrary(libraryPath);
                libraryItem.classList.remove('switching');
                libraryItem.classList.add('success');
                setTimeout(() => libraryItem.classList.remove('success'), 1000);
            } catch (error) {
                libraryItem.classList.remove('switching');
                libraryItem.classList.add('error');
                setTimeout(() => libraryItem.classList.remove('error'), 2000);
            }
        }

        async function displayLibraries(filterText = '') {
            resultsDiv.innerHTML = '<p>Loading...</p>';
            
            try {
                const filteredLibraries = libraries.filter(lib => 
                    path.basename(lib, '.library').toLowerCase().includes(filterText.toLowerCase()));

                if (filteredLibraries.length === 0) {
                    resultsDiv.innerHTML = '<p class="no-results">No libraries found</p>';
                    return;
                }

                const libraryElements = await Promise.all(filteredLibraries.map(async lib => {
                    const isValid = await module.exports.checkLibraryValidity(lib);
                    return formatLibraryItem(lib, isValid);
                }));

                resultsDiv.innerHTML = `
                    <ul class="library-list">
                        ${libraryElements.join('')}
                    </ul>
                `;

                resultsDiv.querySelector('.library-list').addEventListener('click', handleLibraryClick);
            } catch (error) {
                resultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            }
        }

        async function handleClearInvalid() {
            clearInvalidBtn.disabled = true;
            clearInvalidBtn.textContent = 'Clearing...';
            
            try {
                libraries = await module.exports.clearInvalidPaths();
                await displayLibraries(searchInput.value);
                clearInvalidBtn.textContent = 'Cleared!';
                setTimeout(() => {
                    clearInvalidBtn.textContent = 'Clear Invalid Paths';
                    clearInvalidBtn.disabled = false;
                }, 1000);
            } catch (error) {
                clearInvalidBtn.textContent = 'Error!';
                setTimeout(() => {
                    clearInvalidBtn.textContent = 'Clear Invalid Paths';
                    clearInvalidBtn.disabled = false;
                }, 2000);
            }
        }

        function handleSearch() {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            searchTimeout = setTimeout(() => displayLibraries(searchInput.value), 300);
        }

        // Initialize
        libraries = await module.exports.getRecentLibraries();
        searchInput.addEventListener('input', handleSearch);
        clearInvalidBtn.addEventListener('click', handleClearInvalid);
        await displayLibraries();
    }
};
