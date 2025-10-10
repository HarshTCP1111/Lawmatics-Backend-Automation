const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ========================
// 🔐 Google OAuth Setup
// ========================
const { getOAuthCredentials, getTokenCredentials } = require('./config/googleAuth');
const CREDENTIALS = getOAuthCredentials();
const { client_secret, client_id, redirect_uris } = CREDENTIALS.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// ========================
// 🔑 Load token from environment or file
// ========================
const tokenData = getTokenCredentials();

if (tokenData) {
  oAuth2Client.setCredentials(tokenData);
  console.log("✅ Token loaded successfully");
} else {
  console.error("❌ No token found. Please set GOOGLE_TOKEN_JSON environment variable or run auth script locally.");
  // Don't exit in production - just log the error
  if (process.env.NODE_ENV === 'production') {
    console.log("🔄 Continuing without Google Drive authentication");
  } else {
    process.exit(1);
  }
}

// Auto-refresh: save updated access tokens
oAuth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token || tokens.access_token) {
    // In production, you might want to update the environment variable
    // or store the token in a database
    console.log("🔄 Token refreshed:", tokens);
    
    // For local development, still write to file
    if (process.env.NODE_ENV !== 'production') {
      const TOKEN_PATH = path.join(__dirname, 'token.json');
      const currentToken = fs.existsSync(TOKEN_PATH) 
        ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
        : {};
      
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({
        ...currentToken,
        ...tokens
      }, null, 2));
      console.log("💾 Token saved to token.json");
    }
  }
});

// ========================
// 📂 Upload Helper (rest of your code remains the same)
// ========================
async function uploadToDrive(filePath, fileName, folderId) {
  // If no token is available, skip Google Drive upload
  if (!tokenData) {
    console.log("⏭️  Skipping Google Drive upload - no authentication token");
    return null;
  }

  console.log("📂 Upload debug:", {
    filePath,
    fileExists: fs.existsSync(filePath),
    fileName,
    folderId
  });

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  try {
    const media = { body: fs.createReadStream(filePath) };

    const res = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id, webViewLink',
    });

    return res.data;
  } catch (err) {
    console.error("🚨 Drive API error:", err.response?.data || err.message);
    throw err;
  }
}

module.exports = { uploadToDrive, oAuth2Client };