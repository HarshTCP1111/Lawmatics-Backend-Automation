require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const axios = require('axios');
const xml2js = require('xml2js');
const app = express();
const PORT = process.env.PORT || 5000;
const mongoose = require('mongoose');
const qs = require('qs');
const fs = require('fs');
const path = require('path');

// Import automation routes
const automationRoutes = require('./routes/automation');

const MAP_FILE_PATH = path.join(__dirname, 'map.json');

app.get('/api/env', (req, res) => {
  res.json(process.env);
});

// Add this before your routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});
// Read map.json
function readMapFile() {
  try {
    if (!fs.existsSync(MAP_FILE_PATH)) {
      console.log('📁 map.json not found, creating empty file');
      writeMapFile([]);
      return [];
    }
    const data = fs.readFileSync(MAP_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error reading map.json:', error.message);
    return [];
  }
}

// Write to map.json
function writeMapFile(data) {
  try {
    fs.writeFileSync(MAP_FILE_PATH, JSON.stringify(data, null, 2));
    console.log('💾 map.json updated with', data.length, 'matters');
  } catch (error) {
    console.error('❌ Error writing to map.json:', error.message);
  }
}

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Explicit OPTIONS handler as fallback
app.options('*', cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========================
// 🚀 AUTOMATION ROUTES
// ========================
app.use('/api/automation', automationRoutes);

// ========================
// 📋 MATTER MANAGEMENT ROUTES
// ========================

// Get all matters
app.get('/api/matters', (req, res) => {
  try {
    const mapData = readMapFile();
    console.log(`📋 GET /api/matters - Returning ${mapData.length} matters`);
    res.json(mapData);
  } catch (error) {
    console.error('❌ Error in GET /api/matters:', error.message);
    res.status(500).json({ error: 'Failed to fetch matters' });
  }
});

// Add new matter to map.json - FIXED VERSION
app.post('/api/matters', (req, res) => {
  try {
    const { applicationNumber, lawmaticsID, type } = req.body;
    
    console.log('📝 POST /api/matters - Adding matter:', { 
      applicationNumber, 
      lawmaticsID, 
      type 
    });

    // Validate required fields
    if (!applicationNumber || !lawmaticsID || !type) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        error: 'Missing required fields: applicationNumber, lawmaticsID, type' 
      });
    }

    const mapData = readMapFile();
    
    // Check if matter already exists by applicationNumber OR lawmaticsID
    const existsByAppNumber = mapData.find(item => 
      item.applicationNumber === applicationNumber
    );
    
    const existsByLawmaticsID = mapData.find(item => 
      item.lawmaticsID === lawmaticsID
    );

    if (existsByAppNumber) {
      console.log('❌ Matter already exists with applicationNumber:', applicationNumber);
      return res.status(400).json({ 
        error: 'Matter already exists with this application number' 
      });
    }

    if (existsByLawmaticsID) {
      console.log('❌ Matter already exists with lawmaticsID:', lawmaticsID);
      return res.status(400).json({ 
        error: 'Matter already exists with this Lawmatics ID' 
      });
    }
    
    // Create new matter with all required fields
    const newMatter = { 
      applicationNumber, 
      lawmaticsID, 
      type,
      status: 'Pending Automation',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    mapData.push(newMatter);
    writeMapFile(mapData);
    
    console.log('✅ Matter added successfully:', newMatter);
    res.json({ 
      success: true, 
      matter: newMatter,
      message: 'Matter added successfully'
    });
    
  } catch (error) {
    console.error('❌ Error in POST /api/matters:', error.message);
    res.status(500).json({ 
      error: 'Failed to add matter: ' + error.message 
    });
  }
});

// Update matter status
app.put('/api/matters/:lawmaticsID', (req, res) => {
  try {
    const lawmaticsID = req.params.lawmaticsID;
    const { status } = req.body;
    
    console.log(`🔄 PUT /api/matters/${lawmaticsID} - Status: ${status}`);
    
    const mapData = readMapFile();
    
    const matter = mapData.find(item => item.lawmaticsID === lawmaticsID);
    if (matter) {
      const oldStatus = matter.status;
      matter.status = status;
      matter.lastUpdated = new Date().toISOString();
      writeMapFile(mapData);
      
      console.log(`✅ Status updated: ${oldStatus} → ${status}`);
      res.json({ 
        success: true, 
        matter,
        message: `Status updated to ${status}`
      });
    } else {
      console.log('❌ Matter not found:', lawmaticsID);
      res.status(404).json({ 
        error: 'Matter not found' 
      });
    }
  } catch (error) {
    console.error('❌ Error in PUT /api/matters:', error.message);
    res.status(500).json({ 
      error: 'Failed to update matter status' 
    });
  }
});

// Delete matter from map.json
app.delete('/api/matters/:lawmaticsID', (req, res) => {
  try {
    const lawmaticsID = req.params.lawmaticsID;
    
    console.log(`🗑️ DELETE /api/matters/${lawmaticsID}`);
    
    const mapData = readMapFile();
    const initialCount = mapData.length;
    
    const filteredData = mapData.filter(item => item.lawmaticsID !== lawmaticsID);
    
    if (filteredData.length === initialCount) {
      console.log('❌ Matter not found for deletion:', lawmaticsID);
      return res.status(404).json({ 
        error: 'Matter not found' 
      });
    }
    
    writeMapFile(filteredData);
    
    console.log('✅ Matter deleted successfully');
    res.json({ 
      success: true, 
      message: 'Matter deleted successfully',
      deletedCount: initialCount - filteredData.length
    });
    
  } catch (error) {
    console.error('❌ Error in DELETE /api/matters:', error.message);
    res.status(500).json({ 
      error: 'Failed to delete matter' 
    });
  }
});

console.log('MONGO_URI:', process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// In-memory storage for OTPs (in production, use a database)
const otpStorage = {};

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
// Replace your current transporter with this:

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Email validation
function isValidEmail(email) {
  return email === 'automations@inspiredideasolutions.com';
}

// Send OTP endpoint
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(403).json({ error: 'Access denied. Invalid email.' });
  }

  const otp = generateOTP();
  otpStorage[email] = otp;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for Lawmatics USPTO Dashboard',
    text: `Your OTP is: ${otp}. This OTP is valid for 10 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP endpoint
app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!isValidEmail(email)) {
    return res.status(403).json({ error: 'Access denied. Invalid email.' });
  }

  if (otpStorage[email] === otp) {
    delete otpStorage[email];
    res.json({ success: true, message: 'OTP verified successfully' });
  } else {
    res.status(401).json({ error: 'Invalid OTP' });
  }
});
// const sgMail = require('@sendgrid/mail');

// // Configure SendGrid
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// // In-memory storage for OTPs (in production, use a database)
// const otpStorage = {};

// // Email validation
// function isValidEmail(email) {
//   return email === 'automations@inspiredideasolutions.com';
// }

// // Generate random 6-digit OTP
// function generateOTP() {
//   return Math.floor(100000 + Math.random() * 900000).toString();
// }

// // Send OTP endpoint - USING SENDGRID API
// app.post('/api/send-otp', async (req, res) => {
//   const { email } = req.body;

//   if (!isValidEmail(email)) {
//     return res.status(403).json({ error: 'Access denied. Invalid email.' });
//   }

//   const otp = generateOTP();
//   otpStorage[email] = otp;

//   const msg = {
//     to: email,
//     from: {
//       email: 'automations@inspiredideasolutions.com',
//       name: 'Lawmatics USPTO Dashboard'
//     },
//     subject: 'Your OTP for Lawmatics USPTO Dashboard',
//     text: `Your OTP is: ${otp}. This OTP is valid for 10 minutes.`,
//     html: `
//       <div>
//         <h3>Lawmatics USPTO Dashboard OTP</h3>
//         <p>Your OTP is: <strong>${otp}</strong></p>
//         <p>This OTP is valid for 10 minutes.</p>
//       </div>
//     `
//   };

//   try {
//     await sgMail.send(msg);
//     console.log('✅ OTP email sent successfully to:', email);
//     res.json({ message: 'OTP sent successfully' });
//   } catch (error) {
//     console.error('❌ SendGrid API error:', error.response?.body || error.message);
//     res.status(500).json({ 
//       error: 'Failed to send OTP',
//       details: error.response?.body || error.message
//     });
//   }
// });

// Verify OTP endpoint (unchanged)
// app.post('/api/verify-otp', (req, res) => {
//   const { email, otp } = req.body;

//   if (!isValidEmail(email)) {
//     return res.status(403).json({ error: 'Access denied. Invalid email.' });
//   }

//   if (otpStorage[email] === otp) {
//     delete otpStorage[email];
//     res.json({ success: true, message: 'OTP verified successfully' });
//   } else {
//     res.status(401).json({ error: 'Invalid OTP' });
//   }
// });
// ========================
// 📄 USPTO API ROUTES
// ========================

app.get('/api/trademark/:serial', async (req, res) => {
  const { serial } = req.params;
  console.log("🔍 Trademark API hit for serial:", serial);

  try {
    const response = await axios.get(`https://tsdrapi.uspto.gov/ts/cd/casedocs/bundle.xml?sn=${serial}`, {
      headers: {
        'USPTO-API-KEY': '5WFZ8ApIfVK4ZZKevqIGFn0WtgLVmw4w',
        'Accept': 'application/xml',
        'User-Agent': 'Lawmatics-Automation/1.0'
      },
      timeout: 15000
    });

    // Handle XML parsing
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });

    parser.parseString(response.data, (err, result) => {
      if (err) {
        console.error('XML parse error:', err);
        return res.status(500).json({ error: 'XML parsing failed' });
      }

      // Extract and normalize DocumentList > Document
      const docList = result?.DocumentList?.Document;

      if (!docList) {
        return res.status(404).json({ error: 'No documents found for this serial number.' });
      }

      const docArray = Array.isArray(docList) ? docList : [docList];

      const parsedDocs = docArray.map(doc => ({
        date: doc.MailRoomDate || doc.ScanDateTime || 'N/A',
        description: doc.DocumentTypeDescriptionText || 'No Description',
        type: doc.DocumentTypeCodeDescriptionText || 'No Type',
        url: (doc.UrlPathList?.UrlPath && typeof doc.UrlPathList.UrlPath === 'string')
          ? doc.UrlPathList.UrlPath
          : Array.isArray(doc.UrlPathList?.UrlPath)
            ? doc.UrlPathList.UrlPath[0]
            : null
      }));

      console.log(`✅ Found ${parsedDocs.length} trademark documents for ${serial}`);
      res.json({ documents: parsedDocs });
    });
    
  } catch (error) {
    console.error('❌ Trademark API error for serial', serial, ':');
    console.error('Error message:', error.message);
    console.error('Status:', error.response?.status);
    console.error('Response data:', error.response?.data);
    
    // Provide more specific error messages
    if (error.response?.status === 404) {
      res.status(404).json({ 
        error: 'Trademark not found or access denied',
        details: 'The USPTO API returned 404. This could be due to IP blocking, rate limiting, or invalid serial number.'
      });
    } else if (error.code === 'ECONNABORTED') {
      res.status(408).json({ 
        error: 'Request timeout',
        details: 'The USPTO API took too long to respond.'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch documents from USPTO API',
        details: error.response?.data || error.message
      });
    }
  }
});

app.get('/api/patent/:appNumber/documents', async (req, res) => {
  const rawAppNumber = req.params.appNumber;
  const decodedAppNumber = decodeURIComponent(rawAppNumber);

  console.log(`Fetching documents for application number: ${decodedAppNumber}`);

  try {
    const response = await axios.get(
      `https://api.uspto.gov/api/v1/patent/applications/${encodeURIComponent(decodedAppNumber)}/documents`,
      {
        headers: {
          'accept': 'application/json',
          'X-API-KEY': process.env.Patent_USPTO_API_KEY
        }
      }
    );

    const documentBag = response.data?.documentBag || [];

    const filteredDocs = documentBag.map(doc => ({
      date: doc.officialDate,
      documentCode: doc.documentCode,
      documentCodeDescriptionText: doc.documentCodeDescriptionText,
      category: doc.directionCategory,
      file: doc.downloadOptionBag?.[0]?.downloadUrl || null
    }));

    
    res.json({
      applicationNumber: decodedAppNumber,
      documents: filteredDocs
    });
    
  } catch (error) {
    console.error('Patent Documents API Error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch patent documents' });
  }
});

app.get('/api/patent/download', async (req, res) => {
  const fileUrl = req.query.url;

  if (!fileUrl) {
    return res.status(400).json({ error: 'Missing file URL' });
  }

  try {
    const response = await axios.get(fileUrl, {
      responseType: 'stream',
      headers: {
        'X-API-KEY': process.env.Patent_USPTO_API_KEY
      }
    });

    // Pipe the file stream to client
    res.setHeader('Content-Disposition', 'inline');
    response.data.pipe(res);

  } catch (err) {
    console.error('File download error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// ========================
// 🔐 LAWMATICS OAUTH ROUTES
// ========================

const { CLIENT_ID, CLIENT_SECRET, CALLBACK_URL } = process.env;

// Step 1: Redirect to Lawmatics authorization page
app.get('/lawmatics/auth', (req, res) => {
  const url = new URL('https://app.lawmatics.com/oauth/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', CALLBACK_URL);
  url.searchParams.set('response_type', 'code');

  res.redirect(url.toString());
});

// Step 2: Handle callback and exchange code for token
app.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  try {
    const tokenResponse = await axios.post(
      'https://api.lawmatics.com/oauth/token',
      {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: CALLBACK_URL,
        code
      }
    );

    const { access_token, token_type, created_at } = tokenResponse.data;

    // ✅ Save token to file
    fs.writeFileSync(path.join(__dirname, 'lawmatics.token'), access_token);

    res.send(`
      <h2>✅ Authorization Successful</h2>
      <p><strong>Access Token:</strong> ${access_token}</p>
      <p><strong>Token Type:</strong> ${token_type}</p>
      <p>Token saved in <code>lawmatics.token</code> file.</p>
    `);
  } catch (err) {
    console.error('❌ Token Exchange Failed:', err.response?.data || err.message);
    res.status(500).send('❌ Authorization failed.');
  }
});
// TEMPORARY FIX - Replace your current connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://automations_db_user:Automations%402025@cluster0.v1napzi.mongodb.net/lawmatics-db';

console.log('Using MongoDB URI:', MONGO_URI ? 'Present' : 'Missing');

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('If this is a network error, check MongoDB Atlas Network Access');
});
// ========================
// 🏃‍♂️ START SERVER
// ========================

// ========================
// 🏃‍♂️ START SERVER
// ========================

console.log(`🚀 Starting server on port ${PORT}...`);
console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📡 Listening on: 0.0.0.0:${PORT}`);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Automation routes available at /api/automation`);
  console.log(`✅ Matter management routes available at /api/matters`);
  console.log(`✅ Map file location: ${MAP_FILE_PATH}`);
  console.log(`✅ MongoDB connected: ${mongoose.connection.readyState === 1 ? 'Yes' : 'No'}`);
});

// Handle server errors
app.on('error', (err) => {
  console.error('❌ Server error:', err);
});












