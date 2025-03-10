const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico'];
const MAX_FILE_SIZE = 512 * 1024; // 512KB in bytes

module.exports = {
    name: 'Base64 Image Converter',
    styles: ['styles.css'],
    render: () => `
        <div class="base64-converter">
            <div id="header-message" class="header-message hidden">
                This file type is not supported. Supported types: ${SUPPORTED_EXTENSIONS.join(', ')}
            </div>
            <div class="converter-container">
                <div class="preview-container">
                    <img id="image-preview" class="image-preview hidden" />
                </div>
                <div class="text-container">
                    <div class="text-header">
                        <span id="size-info"></span>
                        <button id="copy-button" class="copy-button" title="Copy to clipboard">
                            📋 Copy
                        </button>
                    </div>
                    <textarea id="base64-output" readonly></textarea>
                </div>
            </div>
        </div>
    `,

    async mount(container) {
        // Get current selection on mount
        const items = await eagle.item.getSelected();
        if (items && items.length === 1) {
            await handleItemSelection(items[0]);
        }

        // Add click handler for copy button
        document.getElementById('copy-button').addEventListener('click', copyToClipboard);

        // Return cleanup function
        return () => {
            const copyButton = document.getElementById('copy-button');
            if (copyButton) {
                copyButton.removeEventListener('click', copyToClipboard);
            }
        };
    },

    async onItemSelected(items) {
        if (!items || items.length !== 1) {
            resetUI();
            return;
        }
        await handleItemSelection(items[0]);
    }
};

async function handleItemSelection(item) {
    if (!item || !item.filePath) {
        resetUI();
        return;
    }

    const ext = path.extname(item.filePath).toLowerCase();
    const headerMessage = document.getElementById('header-message');
    const converterContainer = document.querySelector('.converter-container');

    // Check if file type is supported
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        headerMessage.classList.remove('hidden');
        converterContainer.classList.add('hidden');
        return;
    }

    headerMessage.classList.add('hidden');
    converterContainer.classList.remove('hidden');

    try {
        const stats = fs.statSync(item.filePath);
        const sizeInfo = document.getElementById('size-info');
        const useOriginal = stats.size <= MAX_FILE_SIZE;
        
        sizeInfo.textContent = `File size: ${formatFileSize(stats.size)} - ${useOriginal ? 'Using original' : 'Using thumbnail'}`;
        console.log(sizeInfo.textContent);
        let imageData;
        if (useOriginal) {
            // Use original file
            imageData = await processImage(item.filePath);
        } else {
            // Use thumbnail
            if (item.thumbnailPath) {
                imageData = await processImage(item.thumbnailPath);
            } else {
                throw new Error('Thumbnail not available');
            }
        }

        // Update preview
        const preview = document.getElementById('image-preview');
        preview.src = imageData;
        preview.classList.remove('hidden');

        // Update textarea
        const textarea = document.getElementById('base64-output');
        textarea.value = imageData;

    } catch (error) {
        console.error('Error processing image:', error);
        headerMessage.textContent = 'Failed to process image: ' + error.message;
        headerMessage.classList.remove('hidden');
        resetUI();
    }
}

async function processImage(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    
    // For files that canvas can't handle or might have issues with, read directly
    if (ext === '.ico' || ext === '.webp' || ext === '.gif') {
        try {
            const buffer = fs.readFileSync(imagePath);
            const mimeType = getMimeType(ext);
            return `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch (error) {
            throw new Error(`Failed to read image file: ${error.message}`);
        }
    }

    // For standard image types, use canvas
    try {
        const image = await loadImage(imagePath);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return canvas.toDataURL(getMimeType(ext));
    } catch (error) {
        // If canvas fails, fall back to direct reading
        const buffer = fs.readFileSync(imagePath);
        const mimeType = getMimeType(ext);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
}

function getMimeType(ext) {
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon'
    };
    return mimeTypes[ext] || 'image/png';
}

function copyToClipboard() {
    const textarea = document.getElementById('base64-output');
    textarea.select();
    document.execCommand('copy');
    
    // Visual feedback
    const copyButton = document.getElementById('copy-button');
    const originalText = copyButton.textContent;
    copyButton.textContent = '✅ Copied!';
    setTimeout(() => {
        copyButton.textContent = originalText;
    }, 2000);
}

function resetUI() {
    const headerMessage = document.getElementById('header-message');
    const converterContainer = document.querySelector('.converter-container');
    const preview = document.getElementById('image-preview');
    const textarea = document.getElementById('base64-output');
    const sizeInfo = document.getElementById('size-info');

    headerMessage.classList.add('hidden');
    converterContainer.classList.add('hidden');
    preview.classList.add('hidden');
    preview.src = '';
    textarea.value = '';
    sizeInfo.textContent = '';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}