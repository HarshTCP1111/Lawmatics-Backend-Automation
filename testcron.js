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
  sendEmailNotification,
  loadLastProcessedState,
  getTodayDateKey
} = require('./Googlecron.js');

// Import puppeteer separately since we're overriding the function
const puppeteer = require("puppeteer");

app.use(express.json());

// Form configuration (needed for the overridden function)
const FORM_URL = "https://app.lawmatics.com/forms/update-by-id/d2ab9a6a-2800-41f3-a4ba-51feedbf02b3";

// ========================
// 🔧 OVERRIDDEN FUNCTIONS FOR CLOUD RUN
// ========================

/**
 * Helper function to safely clear and type into a field
 */
async function safeClearAndType(page, selector, value, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    
    // Focus on the field
    await page.click(selector);
    
    // Multiple methods to clear the field
    try {
      // Method 1: Select all text and delete
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
    } catch (error) {
      // Method 2: Use keyboard shortcuts (Ctrl+A or Cmd+A)
      const isMac = await page.evaluate(() => navigator.platform.toLowerCase().includes('mac'));
      const modifierKey = isMac ? 'Meta' : 'Control';
      
      await page.keyboard.down(modifierKey);
      await page.keyboard.press('a');
      await page.keyboard.up(modifierKey);
      await page.keyboard.press('Backspace');
    }
    
    // Wait a bit to ensure field is cleared
    await new Promise(r => setTimeout(r, 300));
    
    // Method 3: Directly set the value via JavaScript as fallback
    const currentValue = await page.$eval(selector, el => el.value);
    if (currentValue) {
      await page.evaluate((sel) => {
        document.querySelector(sel).value = '';
      }, selector);
    }
    
    // Type new value character by character with small delays
    await page.type(selector, value, { delay: 50 });
    
    // Verify the value was set correctly
    const finalValue = await page.$eval(selector, el => el.value);
    if (finalValue !== value) {
      console.warn(` Value mismatch for ${selector}. Expected: ${value}, Got: ${finalValue}`);
      // Try one more time with direct JavaScript
      await page.evaluate((sel, val) => {
        document.querySelector(sel).value = val;
      }, selector, value);
    }
    
    return true;
  } catch (error) {
    console.warn(` Field not found or error clearing: ${selector}`, error.message);
    return false;
  }
}

/**
 * Cloud Run compatible Puppeteer configuration
 */
/**
 * Cloud Run compatible Puppeteer configuration
 */
async function submitFormWithPuppeteer(matterId, applicationNumber, latestDoc, type, prospectData) {
  let browser;
  try {
    console.log(`🖥️ Launching Puppeteer for ${type} #${applicationNumber}...`);
    
    // Cloud Run compatible Puppeteer configuration
    const puppeteerOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    };

    // For Cloud Run, use the system Chrome (from Dockerfile installation)
    puppeteerOptions.executablePath = '/usr/bin/google-chrome-stable';

    console.log(`🔧 Puppeteer options:`, { 
      executablePath: puppeteerOptions.executablePath,
      headless: puppeteerOptions.headless 
    });

    browser = await puppeteer.launch(puppeteerOptions);

    const page = await browser.newPage();
    
    // Set longer timeouts for Cloud Run
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);

    console.log(`🌐 Opening Lawmatics form for ${type} #${applicationNumber}...`);
    await page.goto(FORM_URL, { waitUntil: "networkidle2", timeout: 60000 });

    // Step 1: Enter Matter ID
    await page.waitForSelector("#id", { visible: true, timeout: 10000 });
    await safeClearAndType(page, "#id", matterId);

    // Step 2: Click "Find Matter"
    await page.click('button[type="submit"]');
    console.log("⏳ Waiting for Lawmatics to fetch matter details...");
    await new Promise(r => setTimeout(r, 15000));

    // Step 3: Fill USPTO fields
    console.log(" Filling USPTO details...");
    
    // Use Google Drive link if available, otherwise use original link
    const documentLink = latestDoc.driveLink || latestDoc.link || "";
    
    // Define all fields to fill
    const fieldsToFill = [
      {
        selector: 'input[name="RmllbGRzOjpDdXN0b21GaWVsZC1DdXN0b21GaWVsZDo6UHJvc3BlY3QtMzE0NzM="]',
        value: applicationNumber,
        description: "Application Number"
      },
      {
        selector: 'input[name="RmllbGRzOjpDdXN0b21GaWVsZC1DdXN0b21GaWVsZDo6UHJvc3BlY3QtNTQ5Mzgy"]',
        value: latestDoc.date ? latestDoc.date.toISOString().split("T")[0] : "",
        description: "Mailroom Date"
      },
      {
        selector: 'input[name="RmllbGRzOjpDdXN0b21GaWVsZC1DdXN0b21GaWVsZDo6UHJvc3BlY3QtNjI0NzA3"]',
        value: latestDoc.description || "",
        description: "Document Description"
      },
      {
        selector: 'input[name="RmllbGRzOjpDdXN0b21GaWVsZC1DdXN0b21GaWVsZDo6UHJvc3BlY3QtNjMzOTM5"]',
        value: latestDoc.description || "",
        description: "Patent Document Description"
      },
      {
        selector: 'input[name="Q3VzdG9tRm9ybUNvbXBvbmVudDo6QWR2YW5jZWQtZ2VuZXJhbF9maWVsZC1lOWYxN2U2Zi03YTU4LTQ1YTMtYjNjYS1hMDcxMzAzMjcyZDQ="]',
        value: documentLink,
        description: "File/Document Link (Google Drive)"
      }
    ];

    // Fill all fields
    for (const field of fieldsToFill) {
      if (field.value) {
        console.log(`   Filling ${field.description}...`);
        await safeClearAndType(page, field.selector, field.value);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Step 4: Submit
    console.log("📩 Submitting form...");
    try {
      await page.waitForSelector('button[type="button"]', { visible: true, timeout: 10000 });
      await page.click('button[type="button"]');
      console.log(`✅ Form submitted for ${type} #${applicationNumber}`);
    } catch (submitError) {
      console.log(" Trying alternative submit button selector...");
      await page.waitForSelector('div[data-cy="Submit-button"]', { visible: true, timeout: 5000 });
      await page.click('div[data-cy="Submit-button"]');
      console.log(`✅ Form submitted for ${type} #${applicationNumber}`);
    }

    await new Promise(r => setTimeout(r, 5000));
    
    // ✅ Return true to indicate SUCCESS
    console.log(`🎯 FORM SUBMISSION COMPLETED SUCCESSFULLY for ${type} #${applicationNumber}`);
    return true;
    
  } catch (err) {
    console.error(`❌ Puppeteer submission failed for ${applicationNumber}:`, err.message);
    // ✅ Return false to indicate FAILURE
    return false;
  } finally {
    // Safely close browser only if it exists
    if (browser) {
      await browser.close().catch(e => console.warn('Browser close warning:', e.message));
    }
  }
}

// ========================
// 🚀 MAIN PROCESSING FUNCTION
// ========================

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
    console.log(`📥 Downloading and uploading to Google Drive...`);
    latestDoc = await downloadAndUploadToDrive(applicationNumber, latestDoc, type);

    // Send email notification
    console.log(`📧 Sending email notification...`);
    await sendEmailNotification(applicationNumber, latestDoc, type);

    // Update Lawmatics via API
    console.log(`🔄 Updating Lawmatics via API...`);
    await updateLawmaticsProspect(lawmaticsID, applicationNumber, latestDoc, type);

    // ✅ STRICTLY REQUIRE FORM SUBMISSION - If this fails, the whole process fails
    console.log(`👤 Fetching prospect data for form submission...`);
    const prospectData = await getProspect(lawmaticsID);
    if (!prospectData) {
      throw new Error(`❌ Could not fetch prospect data for ${lawmaticsID}, cannot submit form`);
    }

    // ✅ Wait for form submission and throw error if it fails
    console.log(`📝 Starting form submission via Puppeteer...`);
    const formSubmitted = await submitFormWithPuppeteer(lawmaticsID, applicationNumber, latestDoc, type, prospectData);
    
    if (!formSubmitted) {
      throw new Error(`❌ Form submission failed for ${type} #${applicationNumber}`);
    }

    console.log(`🎉 COMPLETED: All steps successful for ${type} #${applicationNumber}`);

    return {
      success: true,
      applicationNumber,
      type,
      documentDate: latestDoc.date.toISOString().split('T')[0],
      description: latestDoc.description,
      documentCode: latestDoc.documentCode || 'N/A',
      category: latestDoc.category || 'N/A',
      driveLink: latestDoc.driveLink || latestDoc.link,
      message: `Successfully processed ${type} #${applicationNumber} including form submission`
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