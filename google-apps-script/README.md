# Google Apps Script Setup Guide

This guide walks you through setting up the free **Google Apps Script Web App** bridge that connects your Travel Expense Tracker to your private Google Sheets.

---

## 🔗 Direct Service Links

| Service | Landing Page / Dashboard URL | Purpose |
| :--- | :--- | :--- |
| **Google Apps Script** | [script.google.com](https://script.google.com) | Create & deploy the serverless Web App bridge |
| **Google Sheets** | [sheets.new](https://sheets.new) / [docs.google.com/spreadsheets](https://docs.google.com/spreadsheets) | Create your private trip expense spreadsheet |
| **Google Drive** | [drive.google.com](https://drive.google.com) | Manage your spreadsheet files & permissions |

---

## 1. Create the Script

1. Open [Google Apps Script](https://script.google.com).
2. Click **New Project** (top-left).
3. Name the project: `Travel Expense Tracker Bridge`.
4. Delete any code in the editor and copy-paste the entire contents of [`Code.gs`](./Code.gs) into it.

---

## 2. Set Your Secret Passcode (`API_SECRET`)

To secure your Google Sheets from unauthorized writes and reads:

1. In the left sidebar of the Apps Script editor, click the **Gear Icon** (⚙️ **Project Settings**).
2. Scroll down to the **Script Properties** section.
3. Click **Add script property**.
4. Set:
   * **Property:** `API_SECRET`
   * **Value:** Choose your own private passcode (e.g. `MyTripSecretPass2026`)
5. Click **Save script properties**.

---

## 3. Authorize & Deploy as a Web App

### Quick Authorization (via Editor):
1. In the Apps Script toolbar dropdown, select the function **`authorizeScript`**.
2. Click **Run** (▶️).
3. A popup will ask you to **Review permissions**:
   * Select your Google Account (`your-email@gmail.com`).
   * Click **Advanced** (bottom left), then click **Go to Travel Expense Tracker Bridge (unsafe)**.
   * Click **Allow**.
   * The editor will show *"Execution started / completed"*.

> **💡 Multi-Account Troubleshooting Tip:** If you see an authorization error (`GeneralOAuthFlow` or permission review loop), it occurs because multiple Google accounts are logged into the same browser session. To fix this: open an **Incognito / Private Window**, sign into only the Google account that owns the spreadsheet, open [script.google.com](https://script.google.com), and click **Run** (`authorizeScript`) again.

### Deploy:
1. In the top right, click **Deploy** > **New deployment**.
2. Click the gear icon next to "Select type" and select **Web app**.
3. Configure the fields:
   * **Description:** `Production v2`
   * **Execute as:** `Me (<your-google-account>)`
   * **Who has access:** `Anyone` *(Note: The script requires your `API_SECRET` to read or write, so only people with your passcode can access it).*
4. Click **Deploy**.
5. Copy the **Web App URL** shown (it will look like: `https://script.google.com/macros/s/AKfycb.../exec`).

---

## 4. Google Sheet Structure (Automatic Multi-Tab)

When you create a blank Google Sheet, the script automatically manages three dedicated tabs:
1. **`Expenses` (or Sheet 1):** The expense ledger with 11 columns (`Transaction ID`, `Date`, `Paid By`, `Category`, `Description`, `Original Amount`, `Currency`, `Exchange Rate`, `Amount (INR)`, `Payment Mode`, `Logged At`).
2. **`Participants`:** Automatically stores all active "Paid By" tags (e.g. `Self`, `Dad`, `Partner`) so they are **persisted and synchronized in real-time across all family members' devices**!
3. **`Config`:** Automatically stores active categories, active payment modes, and base currency so any category or payment mode changes made by the creator **automatically synchronize to all family members' devices** without needing to re-share the link!

---

## 5. Connect to the App

Open your Travel Expense Tracker app and click the **Settings Icon** (⚙️):
1. **Trip Name:** `Goa Trip 2026`
2. **Sheet ID:** Paste your Sheet ID (or the full Google Sheets URL).
3. **Script Web App URL:** Paste the Web App URL from Step 3.
4. **Secret Passcode:** Enter the `API_SECRET` you set in Step 2.
5. Click **Save Trip Settings**.

### Updating Existing Deployments for Full PDF Export:
If you previously deployed `Code.gs`, you can update your script with the latest version in this repository to unlock complete multi-page PDF history export:
1. Copy the updated [`Code.gs`](./Code.gs) into your Apps Script editor.
2. In the top right, click **Deploy** > **Manage deployments**.
3. Select your active deployment and click the **Pencil Icon** (✏️ **Edit**).
4. Under **Version**, select **New version**.
5. Click **Deploy**. Your existing Web App URL remains the exact same!

### Family Sharing & Permissions:
* Click **"Copy Family Share Link"** to send the link to family or travel companions.
* **Automatic Protection:** Family members opening the link are assigned **Member Access** — they can log expenses and use the synced participant tags, but core settings (Sheet ID, Script URL, Passcode) are **locked** to prevent accidental modifications!

---

## 6. Automated Delivery via GitHub Actions (CI/CD)

You can automate updates to your deployed Apps Script Web App whenever [`Code.gs`](./Code.gs) is updated in your repository, without ever changing your Web App URL.

### Security Guarantee
* **Zero secrets are committed to Git**: All authentication is performed via encrypted **GitHub Repository Secrets**.
* Credentials are injected ephemerally on the virtual runner and shredded immediately upon completion.
* Script properties (such as your `API_SECRET`) stored in Google's cloud `PropertiesService` are preserved untouched.

### Step-by-Step Setup (for Personal `@gmail.com` Accounts)

#### Step A: Enable the Google Apps Script API
1. Visit [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
2. Toggle **Google Apps Script API** to **ON**.

#### Step B: Permanent OAuth Token Setup (Avoids 7-Day Expiration)
1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Select your Google Cloud project (or create one: `xpense-tracker-apps-script`).
3. Under **APIs & Services** > **OAuth consent screen**:
   * **User Type:** External
   * Fill required app name and developer email.
   * Under **Publishing status**, click **Publish App** to switch status to **In Production**. *(Note: Google verification is not required for personal developer use).*
4. Under **APIs & Services** > **Credentials**:
   * Click **Create Credentials** > **OAuth client ID**.
   * **Application type:** `Desktop app`.
   * Download the JSON file as `creds.json`.

#### Step C: Authorize clasp Locally
1. In your local terminal, run:
   ```bash
   npx @google/clasp login --creds creds.json
   ```
2. Authorize with your Google account in the browser.
3. Once logged in, open the generated file `~/.clasprc.json` in your home folder.
4. Copy its entire JSON content.
5. Delete `creds.json` locally.

#### Step D: Add Secrets to GitHub Repository
In your GitHub repository, navigate to **Settings** > **Secrets and variables** > **Actions** and add these Repository Secrets:

| Secret Name | Source / How to Obtain |
| :--- | :--- |
| `CLASPRC_JSON` | The JSON string copied from `~/.clasprc.json` |
| `CLASP_SCRIPT_ID` | Apps Script Editor > ⚙️ **Project Settings** > **Script ID** |
| `CLASP_DEPLOYMENT_ID` | Apps Script Editor > **Deploy** > **Manage deployments** > Active **Deployment ID** |

Whenever you push changes affecting `google-apps-script/Code.gs`, GitHub Actions automatically pushes the code and updates your live deployment in-place!
