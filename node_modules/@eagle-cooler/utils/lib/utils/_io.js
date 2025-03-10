import fs from 'fs';

/**
 * Creates an empty file or updates the access and modification times of an existing file
 * @param {string} filepath - Path to the file to touch
 * @param {string} [fileContent] - Content to write to the file if it doesn't exist
 * @return {Promise} Resolves when file is touched, rejects on error
 */
function touch(filepath, fileContent = '') {
    return new Promise((resolve, reject) => {
        const time = new Date();
        fs.utimes(filepath, time, time, (err) => {
            if (err) {
                // If file doesn't exist, create it
                if (err.code === 'ENOENT') {
                    fs.writeFile(filepath, fileContent, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                } else {
                    reject(err);
                }
            } else {
                resolve();
            }
        });
    });
}

/**
 * Creates an empty file or updates the access and modification times of an existing file
 * @param {string} filepath - Path to the file to touch
 * @param {object} jsonContent - JSON content to write to the file if it doesn't exist
 * @return {Promise} Resolves when file is touched, rejects on error
 */
function touchJson(filepath, jsonContent = {}) {
    return touch(filepath, JSON.stringify(jsonContent, null, 2));
}


export { touch, touchJson };
