const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const execAsync = util.promisify(exec);
const {EagleApi} = require('@eagle-cooler/utils');

module.exports = {
    name: 'System Library Map',
    description: 'Query Eagle folders using wildcards',

    async queryFolders(query) {
        try {
            // Use the es.exe from the same directory as index.js
            const esPath = path.join(__dirname, 'es.exe');
            // Construct the Eagle folder search command
            const command = `"${esPath}" /ad -p "**${query}**.library"`;
            
            // Execute the command
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr) {
                console.error('Error executing folder query:', stderr);
                return [];
            }
            
            // Split the output into lines and filter empty lines
            const folders = stdout.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
                
            return folders;
        } catch (error) {
            console.error('Failed to execute folder query:', error);
            return [];
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
        <div class="eagle-folder-query-container">
            <div class="folder-search-section">
                <div class="search-container">
                    <input type="text" id="folder-search" placeholder="Search Eagle folders...">
                </div>
                <div class="button-container">
                    <button id="refresh-folders" class="refresh-btn">Refresh Folders</button>
                </div>
            </div>
            <div class="content-section">
                <div id="folder-results"></div>
            </div>
        </div>
    `,

    mount: (container) => {
        const searchInput = container.querySelector('#folder-search');
        const resultsDiv = container.querySelector('#folder-results');
        let searchTimeout = null;

        function formatFolderItem(folderPath) {
            const dirname = path.dirname(folderPath);
            const basename = path.basename(folderPath, '.library');
            
            return `
                <li class="folder-item" data-path="${folderPath}">
                    <div class="folder-name">${basename}</div>
                    <div class="folder-path">${dirname}</div>
                </li>
            `;
        }

        async function handleFolderClick(e) {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) return;

            const libraryPath = folderItem.dataset.path;
            folderItem.classList.add('switching');

            try {
                await module.exports.switchLibrary(libraryPath);
                // Add success state briefly
                folderItem.classList.remove('switching');
                folderItem.classList.add('success');
                setTimeout(() => folderItem.classList.remove('success'), 1000);
            } catch (error) {
                // Show error state
                folderItem.classList.remove('switching');
                folderItem.classList.add('error');
                setTimeout(() => folderItem.classList.remove('error'), 2000);
            }
        }

        async function performSearch() {
            const query = searchInput.value.trim();
            resultsDiv.innerHTML = '<p>Searching...</p>';
            
            try {
                const folders = await module.exports.queryFolders(query);
                
                if (folders.length === 0) {
                    resultsDiv.innerHTML = '<p class="no-results">No folders found</p>';
                    return;
                }

                resultsDiv.innerHTML = `
                    <ul class="folder-list">
                        ${folders.map(folder => formatFolderItem(folder)).join('')}
                    </ul>
                `;

                // Add click handler to the results container
                resultsDiv.querySelector('.folder-list').addEventListener('click', handleFolderClick);
            } catch (error) {
                resultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            }
        }

        // Debounced search on input
        function handleInput() {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            searchTimeout = setTimeout(performSearch, 300);
        }

        // Add input event listener for real-time search
        searchInput.addEventListener('input', handleInput);

        // Initial search on mount
        performSearch();
    }
}; 