# 🌍 XPense Tracker — Travel Expense Ledger

[![Firebase Hosting](https://img.shields.io/badge/Firebase_Hosting-Spark_Free_Tier-FFA611?logo=firebase&logoColor=white)](https://console.firebase.google.com)
[![Google Sheets](https://img.shields.io/badge/Google_Sheets-Direct_Cloud_Database-34A853?logo=googlesheets&logoColor=white)](https://sheets.new)
[![Google Apps Script](https://img.shields.io/badge/Google_Apps_Script-Serverless_API_Bridge-4285F4?logo=google&logoColor=white)](https://script.google.com)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline_Ready-5A67D8?logo=pwa&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Base Currency](https://img.shields.io/badge/Base_Currency-Configurable_(INR_Default)-10B981)](#-configurable-base-currency--multi-currency-engine)
[![Categories](https://img.shields.io/badge/Categories-16_Presets_Customizable-blue)](#-customizable-trip-categories--payment-modes)
[![Test Suite](https://img.shields.io/badge/Unit_Tests-100%25_Passing-brightgreen)](test/core.test.js)

A lightweight, mobile-first, privacy-focused Progressive Web Application (PWA) designed for tracking vacation expenses in real-time. It connects directly to your private Google Sheets using a Google Apps Script Web App bridge, supporting configurable trip base currencies (defaulting to Indian Rupee ₹), 16 customizable travel expense categories, customizable payment modes, foreign currency conversion, offline queueing with auto-sync, one-tap family share links with permission locks, and interactive visual breakdown charts (Bar & Donut).

---

## 🔗 Direct Service Landing Pages & Dashboards

Use these direct links to access the required cloud consoles and services:

| Service | Landing Page / Dashboard Link | Description & Role |
| :--- | :--- | :--- |
| **Google Sheets** | [sheets.new](https://sheets.new) &nbsp;•&nbsp; [docs.google.com/spreadsheets](https://docs.google.com/spreadsheets) | Create your private trip expense spreadsheet (zero cost). |
| **Google Apps Script** | [script.google.com](https://script.google.com) | Deploy the serverless backend bridge (`Code.gs`) that interacts with Google Sheets. |
| **Google Drive** | [drive.google.com](https://drive.google.com) | Access and manage your spreadsheet files and sharing permissions. |
| **Firebase Console** | [console.firebase.google.com](https://console.firebase.google.com) | Host the PWA frontend for free on the Firebase Spark tier. |
| **Firebase CLI Docs** | [firebase.google.com/docs/cli](https://firebase.google.com/docs/cli) | Official documentation for Firebase command-line tools. |
| **Node.js (LTS)** | [nodejs.org](https://nodejs.org) | JavaScript runtime to run automated unit tests and Firebase CLI tools. |

---

## ✨ Key Features & Architecture

* **100% Free & Serverless Stack:** Powered entirely by Firebase Hosting (Spark Free Tier) and Google Apps Script. No database costs, subscription fees, or server maintenance.
* **100% Data Privacy:** Your financial records are written straight to your personal Google Drive spreadsheet. No intermediary database or third-party server ever touches your data.
* **Bi-Directional Live Ledger:**
  * `doGet`: Automatically calculates total trip spend in INR (₹), expense counts, category distribution, and displays recent transactions.
  * `doPost`: Appends new expenses with Google Apps Script `LockService` write concurrency locking and idempotent deduplication to prevent duplicate records during spotty roaming connections.
* **Creator (Owner) vs. Member Security Model:**
  * **Creator Mode:** The user who sets up the trip has full control to edit credentials, configure Sheet IDs, change Script URLs, pick base currencies, toggle active categories and payment modes, and delete mistaken entries.
  * **Member Mode:** Companions who open the trip via a Family Share Link get restricted Member access. They can log expenses and select synced tags, but configuration inputs (Sheet ID, Script URL, Passcode, and `⚙️ Customize` controls) are hidden/locked to prevent tampering.
  * **Passcode Unlock:** The creator can unlock full Owner Mode on any new or secondary device by verifying the master passcode.
* **Three-Tab Cloud Synchronization (`Expenses`, `Participants`, `Config`):**
  * `Expenses`: Real-time transaction ledger.
  * `Participants`: Custom "Paid By" tags persisted and synced across all devices.
  * `Config`: Active categories, payment modes, and base currency synced directly through Google Sheets so all companion devices stay up to date automatically without needing to re-share the join link.
* **Visualizations (Bar & Pie / Donut Chart):**
  * Clean, minimal hero card with the category distribution hidden by default.
  * One-tap expand/collapse with state saved in `localStorage`.
* **Configurable Base Currency & Multi-Currency Engine:**
  * Creators can choose the trip's base currency on creation or in settings (defaulting to Indian Rupee ₹ / `INR`, customizable to `USD`, `EUR`, `GBP`, `AED`, `THB`, `SGD`, `JPY`, `VND`, `IDR`, etc.).
  * All ledger totals, hero spend, breakdown progress bars, donut charts, and transaction cards format authentically in the selected base currency.
  * Live exchange rate conversion preview with client-side rate caching.
* **Customizable Trip Categories & Payment Modes:**
  * Rich catalog of 16 travel categories: Food & Dining, Travel Tickets, Fuel & Tolls, Stay & Hotel, Tickets & Activities, Shopping, Local Transport / Cabs, Public Transport, Souvenirs, Groceries & Supplies, Drinks & Cafe, Pharmacy / Medical, Rentals & Gear, SIM & Internet, Visa & Fees, General / Other.
  * 9 preset payment modes: Cash, UPI / GPay, Credit Card, Debit Card, Forex Card, Apple Pay / Google Pay, Net Banking / Wire, Transit Card, Other.
  * Sleek, compact 3-column category grid (~44px touch targets) on mobile with instant auto-save upon toggling presets in Settings.
  * Quick `⚙️ Customize` shortcuts directly next to Category and Payment Mode headers for trip creators.
* **Offline-First Resilience:**
  * Service Worker (`sw.js`) caches all application shell assets for instant offline booting.
  * Expenses logged without cell service are stored in a local queue and automatically flushed to Google Sheets when internet connectivity returns.

---

## 📁 Repository Structure

```text
xpense-tracker/
├── firebase.json                # Firebase Hosting configuration & CDN cache headers
├── .firebaserc.example          # Template for Firebase project binding
├── google-apps-script/
│   ├── Code.gs                  # Apps Script Web App bridge (doGet & doPost handlers)
│   └── README.md                # Dedicated Google Apps Script deployment walkthrough
├── public/                      # Static assets served by Firebase CDN
│   ├── index.html               # Mobile app layout, hero card, expense form, modals
│   ├── manifest.json            # PWA manifest for home-screen installation
│   ├── sw.js                    # Service Worker for offline caching & network fallbacks
│   ├── css/
│   │   └── style.css            # Mobile safe-area insets, touch targets, transitions
│   ├── js/
│   │   ├── app.js               # Application orchestrator, event bindings & charts
│   │   ├── storage.js           # Multi-trip manager, offline queue, participant tags
│   │   ├── sheets-api.js        # Google Apps Script client dispatcher (text/plain CORS)
│   │   └── currency.js          # INR formatting, multi-currency conversion math
│   └── assets/
│       └── icons/               # 192x192 & 512x512 maskable PWA icons
└── test/
    └── core.test.js             # Automated unit & integration tests
```

---

## 🚀 Complete Step-by-Step Setup Guide

### Step 1: Create a Blank Google Sheet
1. Navigate to [sheets.new](https://sheets.new) in your browser.
2. Give your spreadsheet a name (e.g., `Goa Vacation 2026`).
3. Copy the **Spreadsheet ID** from the address bar:
   ```text
   https://docs.google.com/spreadsheets/d/<COPY_THIS_SHEET_ID_HERE>/edit
   ```
   *(You do not need to create columns or tabs manually — the script initializes the `Expenses`, `Participants`, and `Config` tabs on first use).*

---

### Step 2: Deploy Google Apps Script Web App
1. Open the [Google Apps Script Dashboard](https://script.google.com).
2. Click **New Project** (top-left) and name it `XPense Tracker Bridge`.
3. In the code editor, delete any default code and paste the full contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
4. Set your private secret passcode:
   * In the left navigation, click the **Gear Icon** (⚙️ **Project Settings**).
   * Scroll down to **Script Properties** and click **Add script property**.
   * Set **Property:** `API_SECRET`
   * Set **Value:** Your private passcode (e.g., `MyTripSecretPass2026`).
   * Click **Save script properties**.
5. Authorize permissions:
   * Return to the code editor (`< > Editor`).
   * In the function dropdown, select **`authorizeScript`**.
   * Click **Run** (▶️).
   * In the authorization popup, click **Review permissions** -> Select your Google Account -> Click **Advanced** -> Click **Go to XPense Tracker Bridge (unsafe)** -> Click **Allow**.
   > **💡 Tip for Multiple Google Accounts:** If you encounter a `GeneralOAuthFlow` error or authorization loop, open an **Incognito Window**, sign in to only the Google Account that owns the sheet, and run `authorizeScript` from there.
6. Deploy as Web App:
   * Click **Deploy** > **New deployment** (top-right).
   * Click the gear icon next to "Select type" and choose **Web app**.
   * **Description:** `Production v1`
   * **Execute as:** `Me (<your-google-account>)`
   * **Who has access:** `Anyone` *(Note: Requests require your `API_SECRET` passcode to execute).*
   * Click **Deploy**.
   * Copy the **Web App URL** (e.g., `https://script.google.com/macros/s/AKfycb.../exec`).

---

### Step 3: Deploy Frontend to Firebase Hosting
1. Go to the [Firebase Console](https://console.firebase.google.com).
2. Click **Add project** (or select an existing one) and confirm the free **Spark Plan**.
3. In your terminal, sign into the Firebase CLI:
   ```bash
   npx firebase-tools login
   ```
4. Configure your project binding (`.firebaserc` is excluded by `.gitignore` to prevent committing custom project IDs):
   * Copy the template:
     ```bash
     cp .firebaserc.example .firebaserc
     ```
   * Replace `"your-firebase-project-id"` with your actual Firebase Project ID in `.firebaserc`:
     ```json
     {
       "projects": {
         "default": "your-firebase-project-id"
       }
     }
     ```
   * *(Alternatively, run `npx firebase-tools use --add` and pick your project from the terminal).*
5. Deploy the application:
   ```bash
   npx firebase-tools deploy --only hosting
   ```
6. Your PWA will be published and live at:
   ```text
   https://<your-firebase-project-id>.web.app
   ```

---

### Step 4: Configure the App & Share with Family
1. Open your live Firebase URL on your mobile phone or browser.
2. Tap the **Settings Gear** (⚙️) in the top-right header:
   * **Trip Name:** e.g., `Goa Vacation 2026`
   * **Google Sheet ID:** Paste the Sheet ID (or full URL) from Step 1.
   * **Web App URL:** Paste the Apps Script URL from Step 2.
   * **Secret Passcode:** Enter the `API_SECRET` passcode you configured in Step 2.
   * Tap **Save Trip Settings**.
3. Tap **"Copy Family Share Link"**:
   * Generates a secure, obscured share link using URL-safe Base64 (`?join=...`) so sensitive Sheet IDs and passcodes are never exposed in plain text.
   * Send the generated link to your travel companions via WhatsApp, Messages, or email.
   * When companions tap the link on their phones, the app automatically configures itself and cleanses the query token from the address bar.
   * Companions receive **Member Access** (they can log expenses and pick synced tags, while settings remain protected).

---

## 📱 Installing the PWA (Add to Home Screen)

Install XPense Tracker directly onto your smartphone home screen for a fullscreen native-like experience:

* **iOS (Apple Safari):**
  1. Open your Firebase app URL in Safari.
  2. Tap the **Share** button (box with an upward arrow) in the bottom toolbar.
  3. Scroll down and tap **Add to Home Screen**.
  4. Tap **Add** in the top-right corner.
* **Android (Google Chrome):**
  1. Open your Firebase app URL in Chrome.
  2. Tap the three-dot menu (⋮) in the top-right corner (or tap the bottom **Add XPense to Home screen** banner).
  3. Tap **Install App** or **Add to Home screen**.

---

## 🧪 Local Development & Automated Testing

### Run Unit & Integration Tests
The project includes a comprehensive standalone Node.js test suite verifying currency mathematics, regex sheet ID extractors, participant tag synchronization, creator/member permission enforcement, and SVG chart geometry:

```bash
node test/core.test.js
```

### Run a Local Preview Server
You can preview and test changes locally using any lightweight HTTP server:

```bash
# Using Python 3
python3 -m http.server 8080 --directory public

# Or using npx serve
npx serve public
```
Open `http://localhost:8080` in your browser. Toggle Device Emulation in Chrome DevTools (`Cmd + Shift + M` / `Ctrl + Shift + M`) to test responsive mobile layouts.

---

## 📋 Google Sheet Data Schema

### 1. `Expenses` Tab
Automatically maintained ledger of all recorded expenses:

| Col | Header | Type | Description |
| :---: | :--- | :--- | :--- |
| **A** | `Transaction ID` | String | Unique idempotency ID (e.g. `TXN-MK92B-4A1`) |
| **B** | `Date` | Date | Transaction date (`YYYY-MM-DD`) |
| **C** | `Paid By` | String | Name or tag of payer (e.g. `Self`, `Dad`, `Partner`) |
| **D** | `Category` | String | Category (Food & Dining, Travel Tickets, Fuel & Tolls, Stay & Hotel, etc.) |
| **E** | `Description` | String | Note or location description |
| **F** | `Original Amount` | Number | Amount entered in foreign or local currency |
| **G** | `Currency` | String | Currency code (`INR`, `USD`, `EUR`, `AED`, etc.) |
| **H** | `Exchange Rate` | Number | Rate used to convert to INR |
| **I** | `Amount (INR)` | Number | Final normalized amount in Indian Rupees (₹) |
| **J** | `Payment Mode` | String | Mode (UPI / GPay, Cash, Credit Card, Forex Card) |
| **K** | `Logged At` | Timestamp | ISO 8601 server logging timestamp |

### 2. `Participants` Tab
Persisted list of active "Paid By" tags:

| Col | Header | Description |
| :---: | :--- | :--- |
| **A** | `Participant Tag` | Unique tag name (e.g. `Self`, `Dad`, `Partner`) |
| **B** | `Created At` | ISO timestamp of when the tag was added |

### 3. `Config` Tab
Persisted trip settings (base currency, active categories, payment modes) automatically synced to all companion devices in real-time:

| Col | Header | Description |
| :---: | :--- | :--- |
| **A** | `Setting Key` | Key name (`baseCurrency`, `categories`, `paymentModes`) |
| **B** | `Setting Value` | Value string or JSON-serialized array of active options |
| **C** | `Updated At` | ISO timestamp of the last configuration update |

---

## 🔒 Security & Privacy Audit

* **Zero Hardcoded Secrets:** No personal email addresses, private Sheet IDs, Apps Script deployment IDs, or API keys exist in the repository source code.
* **Passcode-Gated Access:** The Google Apps Script Web App validates incoming requests against the `API_SECRET` stored securely in Google's `PropertiesService`.
* **Dotted Secret Inputs:** Master passcode fields are masked as password inputs by default, with a reveal toggle for security during setup.
* **Member Mode Safeguards:** Family share links restrict companion devices to Member Mode so critical configuration cannot be modified or cleared by mistake.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
