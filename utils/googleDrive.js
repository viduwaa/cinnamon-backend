import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load client secrets
const CLIENT_SECRET_PATH = path.join(__dirname, '../config/client_secret.json');
const credentials = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf8'));

const { client_id, client_secret, redirect_uris } = credentials.web;

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
);

// Set credentials (you'll need to get refresh token first)
// For now, we'll use a simple approach with API key or service account
// But since you have OAuth credentials, we'll set up the OAuth flow

/**
 * Upload file to Google Drive
 * @param {Object} fileObject - File object with buffer, originalname, mimetype, path
 * @param {string} folderName - Folder name in Google Drive
 * @param {string} customFileName - Optional custom filename (without extension). If not provided, uses originalname with timestamp
 * @returns {Promise<Object>} - File metadata with webViewLink and id
 */
export const uploadToGoogleDrive = async (fileObject, folderName = 'Organic Certification', customFileName = null) => {
    try {
        // Note: You need to set refresh token in environment variable
        // or implement full OAuth flow for production
        if (process.env.GOOGLE_REFRESH_TOKEN) {
            oauth2Client.setCredentials({
                refresh_token: process.env.GOOGLE_REFRESH_TOKEN
            });
        } else {
            throw new Error('GOOGLE_REFRESH_TOKEN not set in environment variables');
        }

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Check if folder exists, create if not
        let folderId = await findOrCreateFolder(drive, folderName);

        // Generate unique filename
        const fileExtension = path.extname(fileObject.originalname);
        let fileName;
        if (customFileName) {
            // Use custom filename with timestamp to ensure uniqueness
            const timestamp = Date.now();
            fileName = `${customFileName}-${timestamp}${fileExtension}`;
        } else {
            // Use original name with timestamp to ensure uniqueness
            const timestamp = Date.now();
            const nameWithoutExt = path.basename(fileObject.originalname, fileExtension);
            fileName = `${nameWithoutExt}-${timestamp}${fileExtension}`;
        }

        // Upload file
        const fileMetadata = {
            name: fileName,
            parents: [folderId]
        };

        const media = {
            mimeType: fileObject.mimetype,
            body: fs.createReadStream(fileObject.path)
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink, webContentLink'
        });

        // Make file publicly readable (optional)
        await drive.permissions.create({
            fileId: response.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        // Delete temporary file
        fs.unlinkSync(fileObject.path);

        return {
            fileId: response.data.id,
            fileName: response.data.name,
            webViewLink: response.data.webViewLink,
            webContentLink: response.data.webContentLink
        };
    } catch (error) {
        console.error('Error uploading to Google Drive:', error);
        // Clean up temp file on error
        if (fileObject.path && fs.existsSync(fileObject.path)) {
            fs.unlinkSync(fileObject.path);
        }
        throw error;
    }
};

/**
 * Upload buffer directly to Google Drive
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File mime type
 * @param {string} originalName - Original filename
 * @param {string} folderName - Folder name in Google Drive
 * @param {string} customFileName - Optional custom filename
 * @returns {Promise<Object>} - File metadata
 */
export const uploadBufferToGoogleDrive = async (buffer, mimeType, originalName, folderName = 'Organic Certification', customFileName = null) => {
    try {
        if (process.env.GOOGLE_REFRESH_TOKEN) {
            oauth2Client.setCredentials({
                refresh_token: process.env.GOOGLE_REFRESH_TOKEN
            });
        } else {
            throw new Error('GOOGLE_REFRESH_TOKEN not set in environment variables');
        }

        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        let folderId = await findOrCreateFolder(drive, folderName);

        const fileExtension = path.extname(originalName);
        let fileName;
        if (customFileName) {
            const timestamp = Date.now();
            fileName = `${customFileName}-${timestamp}${fileExtension}`;
        } else {
            const timestamp = Date.now();
            const nameWithoutExt = path.basename(originalName, fileExtension);
            fileName = `${nameWithoutExt}-${timestamp}${fileExtension}`;
        }

        const fileMetadata = {
            name: fileName,
            parents: [folderId]
        };

        const media = {
            mimeType: mimeType,
            body: Readable.from(buffer)
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink, webContentLink'
        });

        await drive.permissions.create({
            fileId: response.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        return {
            fileId: response.data.id,
            fileName: response.data.name,
            webViewLink: response.data.webViewLink,
            webContentLink: response.data.webContentLink
        };
    } catch (error) {
        console.error('Error uploading buffer to Google Drive:', error);
        throw error;
    }
};

/**
 * Find or create folder in Google Drive
 * @param {Object} drive - Google Drive API instance
 * @param {string} folderName - Folder name
 * @returns {Promise<string>} - Folder ID
 */
const findOrCreateFolder = async (drive, folderName) => {
    try {
        // Search for folder
        const response = await drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (response.data.files.length > 0) {
            return response.data.files[0].id;
        }

        // Create folder if not found
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const folder = await drive.files.create({
            requestBody: folderMetadata,
            fields: 'id'
        });

        return folder.data.id;
    } catch (error) {
        console.error('Error finding/creating folder:', error);
        throw error;
    }
};

/**
 * Generate OAuth2 URL for getting authorization code
 * Use this once to get the authorization code, then exchange for refresh token
 */
export const getAuthUrl = () => {
    const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
    
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
    
    return authUrl;
};

/**
 * Get tokens using authorization code
 * @param {string} code - Authorization code from OAuth flow
 * @returns {Promise<Object>} - Tokens including refresh_token
 */
export const getTokensFromCode = async (code) => {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
};

