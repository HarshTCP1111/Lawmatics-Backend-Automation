const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ========================
// 🔐 Google OAuth Setup
// ========================
const CREDENTIALS = require('./client_secret_266554319533-r7ljr05o771iq5j3ubnsq1k4i6km938h.apps.googleusercontent.com.json');

const { client_secret, client_id, redirect_uris } = CREDENTIALS.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// ========================
// 🔑 Load token.json (no more hardcoding!)
// ========================
const TOKEN_PATH = path.join(__dirname, 'token.json');

if (fs.existsSync(TOKEN_PATH)) {
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oAuth2Client.setCredentials(token);
} else {
  console.error("❌ No token.json found. Run your auth script first to generate it.");
  process.exit(1);
}

// Auto-refresh: save updated access tokens back to token.json
oAuth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token || tokens.access_token) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({
      ...JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')),
      ...tokens
    }, null, 2));
    console.log("🔄 Token refreshed and saved to token.json");
  }
});

// ========================
// 📂 Upload Helper
// ========================
async function uploadToDrive(filePath, fileName, folderId) {
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
