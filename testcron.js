// test_cron.js - Dedicated test endpoint for specific matters
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

// Import functions from your main file
const {
  processMatter,
  loadMatterMap,
  fetchPatentDoc,
  fetchTrademarkDoc,
  downloadAndUploadToDrive,
  getProspect,
  updateLawmaticsProspect,
  submitFormWithPuppeteer,
  sendEmailNotification,
  loadLastProcessedState,
  getTodayDateKey
} = require('./Googlecron.js');

app.use(express.json());

/**
 * Process a single matter without date filtering (always gets latest document)
 */
async function processMatterForced(applicationNumber) {
  try {
    console.log(`🧪 FORCED PROCESSING for matter ${applicationNumber}...`);
    
    // Load all matters
    const allMatters = await loadMatterMap();
    const matter = allMatters.find(m => m.applicationNumber === applicationNumber);
    
    if (!matter) {
      throw new Error(`Matter ${applicationNumber} not found in map.json`);
    }

    const { lawmaticsID, type } = matter;
    
    console.log(`🔹 Processing ${type} #${applicationNumber} (Lawmatics ID: ${lawmaticsID})...`);

    // Fetch the latest document (bypass date checks)
    let latestDoc = null;
    if (type === "Patent") {
      latestDoc = await fetchPatentDoc(applicationNumber);
    } else if (type === "Trademark") {
      latestDoc = await fetchTrademarkDoc(applicationNumber);
    } else {
      throw new Error(`Unknown type: ${type} for application ${applicationNumber}`);
    }

    if (!latestDoc) {
      throw new Error(`No documents found for ${type} #${applicationNumber}`);
    }

    console.log(`📄 LATEST document found for ${type} #${applicationNumber}:`);
    console.log(`   Date: ${latestDoc.date.toISOString().split('T')[0]}`);
    console.log(`   Description: ${latestDoc.description}`);
    if (latestDoc.documentCode) console.log(`   Document Code: ${latestDoc.documentCode}`);
    if (latestDoc.category) console.log(`   Category: ${latestDoc.category}`);
    console.log(`   Link: ${latestDoc.link}`);

    // Download and upload to Google Drive
    latestDoc = await downloadAndUploadToDrive(applicationNumber, latestDoc, type);

    // Send email notification
    await sendEmailNotification(applicationNumber, latestDoc, type);

    // Update Lawmatics via API
    await updateLawmaticsProspect(lawmaticsID, applicationNumber, latestDoc, type);

    // Get prospect data and submit form via Puppeteer
    const prospectData = await getProspect(lawmaticsID);
    if (prospectData) {
      await submitFormWithPuppeteer(lawmaticsID, applicationNumber, latestDoc, type, prospectData);
    } else {
      console.log(`⚠️ Could not fetch prospect data for ${lawmaticsID}, skipping form submission`);
    }

    return {
      success: true,
      applicationNumber,
      type,
      documentDate: latestDoc.date.toISOString().split('T')[0],
      description: latestDoc.description,
      documentCode: latestDoc.documentCode || 'N/A',
      category: latestDoc.category || 'N/A',
      driveLink: latestDoc.driveLink || latestDoc.link,
      message: `Successfully processed ${type} #${applicationNumber}`
    };

  } catch (error) {
    console.error(`❌ Error in forced processing for ${applicationNumber}:`, error.message);
    return {
      success: false,
      applicationNumber,
      error: error.message
    };
  }
}

/**
 * Get matter information without processing
 */
async function getMatterInfo(applicationNumber) {
  try {
    const allMatters = await loadMatterMap();
    const matter = allMatters.find(m => m.applicationNumber === applicationNumber);
    
    if (!matter) {
      throw new Error(`Matter ${applicationNumber} not found in map.json`);
    }

    // Fetch latest document info only
    let latestDoc = null;
    if (matter.type === "Patent") {
      latestDoc = await fetchPatentDoc(applicationNumber);
    } else if (matter.type === "Trademark") {
      latestDoc = await fetchTrademarkDoc(applicationNumber);
    }

    const lastProcessedState = await loadLastProcessedState();
    const lastProcessedDate = lastProcessedState[applicationNumber];

    return {
      success: true,
      matter,
      latestDocument: latestDoc ? {
        date: latestDoc.date.toISOString().split('T')[0],
        description: latestDoc.description,
        documentCode: latestDoc.documentCode || 'N/A',
        category: latestDoc.category || 'N/A',
        link: latestDoc.link
      } : null,
      lastProcessedDate: lastProcessedDate || 'Never processed',
      isNew: latestDoc ? latestDoc.date.toISOString().split('T')[0] > (lastProcessedDate || '0000-00-00') : false
    };

  } catch (error) {
    console.error(`❌ Error getting matter info for ${applicationNumber}:`, error.message);
    return {
      success: false,
      applicationNumber,
      error: error.message
    };
  }
}

// ========================
// 📍 EXPRESS ENDPOINTS
// ========================

/**
 * Test endpoint to process a specific matter (bypasses date filtering)
 */
app.post('/api/test/matter/:applicationNumber', async (req, res) => {
  try {
    const { applicationNumber } = req.params;
    const { dryRun = false } = req.body;

    console.log(`🚀 TEST ENDPOINT: Processing matter ${applicationNumber}${dryRun ? ' (DRY RUN)' : ''}`);

    if (dryRun) {
      const matterInfo = await getMatterInfo(applicationNumber);
      return res.json(matterInfo);
    }

    const result = await processMatterForced(applicationNumber);
    res.json(result);

  } catch (error) {
    console.error('❌ Error in test endpoint:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Endpoint to get matter information
 */
app.get('/api/matter/:applicationNumber', async (req, res) => {
  try {
    const { applicationNumber } = req.params;
    const result = await getMatterInfo(applicationNumber);
    res.json(result);
  } catch (error) {
    console.error('❌ Error in matter info endpoint:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Endpoint to list all matters
 */
app.get('/api/matters', async (req, res) => {
  try {
    const matters = await loadMatterMap();
    const lastProcessedState = await loadLastProcessedState();
    
    const mattersWithInfo = matters.map(matter => ({
      ...matter,
      lastProcessed: lastProcessedState[matter.applicationNumber] || 'Never'
    }));

    res.json({
      success: true,
      count: matters.length,
      matters: mattersWithInfo
    });
  } catch (error) {
    console.error('❌ Error listing matters:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'USPTO Test Cron'
  });
});

// ========================
// 🚀 START SERVER
// ========================

app.listen(port, '0.0.0.0',() => {
  console.log(`🧪 USPTO Test Cron running on port ${port}`);
  console.log(`📝 Endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   GET  /api/matters - List all matters`);
  console.log(`   GET  /api/matter/:applicationNumber - Get matter info`);
  console.log(`   POST /api/test/matter/:applicationNumber - Process specific matter`);
  console.log(`   Example: POST /api/test/matter/2992382`);
  console.log(`   Dry run: POST /api/test/matter/2992382 { "dryRun": true }`);
});

// Export for testing
module.exports = {
  processMatterForced,
  getMatterInfo,
  app
};