Lawmatics USPTO Automation System

A full-stack automation suite integrating USPTO, Lawmatics CRM, SendGrid, and Google Drive, enabling real-time document tracking, storage, and CRM updates.

🧭 Overview

The Lawmatics USPTO Automation System automates the process of monitoring trademark and patent filings from the USPTO API, synchronizing data with Lawmatics CRM, and delivering email notifications for new documents — all within a unified dashboard.

| Layer           | Technology                                                                                                                                                                         | Description                        |
| :-------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| 🖥️ Frontend    | [![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react\&logoColor=white)](https://reactjs.org/)                                                                       | Interactive dashboard and controls |
| ⚙️ Backend      | [![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js\&logoColor=white)](https://nodejs.org/) + Express                                                        | Core API and automation engine     |
| 🗄️ Database    | [![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248?logo=mongodb\&logoColor=white)](https://www.mongodb.com/)                                                              | Persistent data storage            |
| ☁️ Integrations | [SendGrid](https://sendgrid.com/), [Lawmatics API](https://www.lawmatics.com/), [Google Drive API](https://developers.google.com/drive), [USPTO API](https://developer.uspto.gov/) | External integrations              |
| 🔒 Auth         | OTP (email-based)                                                                                                                                                                  | Secure one-time access             |

 - USPTO Integration — Real-time patent & trademark monitoring
 Lawmatics CRM Automation — Auto-sync with Lawmatics records
 Email Alerts — Instant SendGrid notifications for new docs
 Google Drive Integration — Auto-upload & folder structuring
 Scheduled Automation — Runs every 5 minutes via cron jobs
 Manual Override — Process specific matters manually
 OTP Authentication — Secure dashboard access
 Live Dashboard — Realtime status tracking

System Architecture
+---------------------+        +------------------+        +-----------------+
|   USPTO API Layer   | --->   |  Node.js Backend | --->   | Lawmatics CRM   |
| (Trademarks/Patents)|        | (Automation Core)|        | (Prospect Sync) |
+---------------------+        +------------------+        +-----------------+
         |                                 |
         v                                 v
  +---------------+                +-----------------+
  | Google Drive  | <------------> | React Dashboard |
  | (Doc Storage) |                | (Admin Control) |
  +---------------+                +-----------------+

Core API Endpoints

| Area       | Method | Endpoint                           | Description          |
| ---------- | ------ | ---------------------------------- | -------------------- |
| Auth       | POST   | `/api/send-otp`                    | Send OTP to email    |
| Auth       | POST   | `/api/verify-otp`                  | Verify OTP           |
| Matter     | GET    | `/api/matters`                     | Retrieve all matters |
| Matter     | POST   | `/api/matters`                     | Add new matter       |
| USPTO      | GET    | `/api/trademark/:serial`           | Get trademark docs   |
| USPTO      | GET    | `/api/patent/:appNumber/documents` | Get patent docs      |
| Automation | POST   | `/api/automation/run-once`         | Run automation once  |
| Debug      | GET    | `/api/automation/debug`            | Debug info           |

Automation Workflow
for each matter in map.json:
  1. Fetch USPTO documents
  2. Compare with the last processed date
  3. Download & upload to Google Drive
  4. Update Lawmatics via API
  5. Submit Lawmatics form (Puppeteer)
  6. Send SendGrid notification
  7. Update state & logs

Monitoring & Logs

| Type             | Location                |
| ---------------- | ----------------------- |
| Backend Logs     | Render.com dashboard    |
| Automation State | `/backend/state/`       |
| Matter Records   | `map.json`              |
| Debug            | `/api/automation/debug` |

⚖️ License
Proprietary Software — © Inspired Idea Solutions.
Unauthorized redistribution or modification is prohibited.



