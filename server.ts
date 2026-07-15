import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import { Readable } from "stream";
import fs from "fs";

const APPS_SCRIPT_CONFIG_PATH = path.join(process.cwd(), "apps_script_config.json");

let cachedAppsScriptUrl = "https://script.google.com/macros/s/AKfycbwGx9Q8oaSimaiGydZAoiW8jWaX4VG3oirirLTwYfP0FjK6P-f8CMhzajrZ3ujAvHnBqA/exec";
try {
  if (fs.existsSync(APPS_SCRIPT_CONFIG_PATH)) {
    const configData = JSON.parse(fs.readFileSync(APPS_SCRIPT_CONFIG_PATH, "utf8"));
    if (configData.appsScriptUrl) {
      cachedAppsScriptUrl = configData.appsScriptUrl;
    }
  }
} catch (err) {
  console.error("Failed to read apps script config:", err);
}

if (process.env.APPS_SCRIPT_URL) {
  cachedAppsScriptUrl = process.env.APPS_SCRIPT_URL;
}

// Hardcoded Spreadsheet ID from user
const SPREADSHEET_ID = "15zUrgNPTEQ_Wl2hRriDNCIsSNVs1P6-_6t3rJ8Mhxqs";
const SERVICE_ACCOUNT_EMAIL = "ais-sandbox@ais-asia-southeast1-99531ac137.iam.gserviceaccount.com";

export const app = express();
const PORT = 3000;

// Set payload limits for base64 photo uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Google Auth Setup using ADC (Application Default Credentials) or custom environment variable for Vercel
const authOptions: any = {
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive"
  ],
};

if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  try {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    console.log("Menggunakan kredensial Google dari variabel lingkungan GOOGLE_SERVICE_ACCOUNT_JSON");
  } catch (err: any) {
    console.error("Gagal mengurai GOOGLE_SERVICE_ACCOUNT_JSON:", err.message);
  }
}

const auth = new google.auth.GoogleAuth(authOptions);

// API Config Endpoint to help user with configuration
app.get("/api/config", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  
  let currentUrl = cachedAppsScriptUrl;
  try {
    if (fs.existsSync(APPS_SCRIPT_CONFIG_PATH)) {
      const configData = JSON.parse(fs.readFileSync(APPS_SCRIPT_CONFIG_PATH, "utf8"));
      if (configData.appsScriptUrl) {
        currentUrl = configData.appsScriptUrl;
        cachedAppsScriptUrl = currentUrl;
      }
    }
  } catch (err) {
    console.error("Gagal membaca file konfigurasi real-time:", err);
  }

  res.json({
    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
    spreadsheetId: SPREADSHEET_ID,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
    appsScriptUrl: currentUrl
  });
});

// API to save Apps Script URL
app.post("/api/config/apps-script", (req, res) => {
  try {
    const { appsScriptUrl } = req.body;
    cachedAppsScriptUrl = (appsScriptUrl || "").trim();
    
    try {
      fs.writeFileSync(
        APPS_SCRIPT_CONFIG_PATH,
        JSON.stringify({ appsScriptUrl: cachedAppsScriptUrl }, null, 2),
        "utf8"
      );
    } catch (writeErr: any) {
      // Gracefully handle read-only filesystems in Vercel
      console.warn("Could not save apps script config to disk (typical on serverless/Vercel):", writeErr.message);
    }
    
    console.log("Saved Apps Script Web App URL to server config:", cachedAppsScriptUrl);
    res.json({ success: true, message: "URL Apps Script berhasil disimpan di server." });
  } catch (err: any) {
    console.error("Failed to save apps script config:", err);
    res.status(500).json({ success: false, error: err.message || "Gagal menyimpan URL di server." });
  }
});

// Submit Form Endpoint
app.post("/api/submit", async (req, res) => {
    try {
      const {
        step = "all", // "start", "customer", "kembali", or "all" for backwards compatibility
        idPerjalanan,
        nama,
        nip,
        jabatan,
        tujuanJalur,
        alamatCustomer,
        noReceipt,
        armada,
        fotoLoading, // Base64 Data URL
        fotoCustomer, // Base64 Data URL
        fotoKembaliLoading, // Base64 Data URL
        timestamp // ISO string from frontend
      } = req.body;

      // Validate based on step
      if (step === "all" || step === "start") {
        if (!nama || !nip || !jabatan || !tujuanJalur || !alamatCustomer || !noReceipt || !armada) {
          return res.status(400).json({
            success: false,
            error: "Semua form data wajib diisi."
          });
        }
        if (step === "all" && (!fotoLoading || !fotoCustomer || !fotoKembaliLoading)) {
          return res.status(400).json({
            success: false,
            error: "Ketiga foto selfie (Keluar Loading, Rumah Customer & Kembali Lagi Ke Loading) wajib diambil."
          });
        }
        if (step === "start" && !fotoLoading) {
          return res.status(400).json({
            success: false,
            error: "Foto selfie Keluar Loading wajib diambil untuk memulai perjalanan."
          });
        }
      } else if (step === "customer") {
        if (!idPerjalanan) {
          return res.status(400).json({ success: false, error: "ID Perjalanan wajib disertakan." });
        }
        if (!fotoCustomer) {
          return res.status(400).json({ success: false, error: "Foto selfie di Rumah Customer wajib diambil." });
        }
      } else if (step === "kembali") {
        if (!idPerjalanan) {
          return res.status(400).json({ success: false, error: "ID Perjalanan wajib disertakan." });
        }
        if (!fotoKembaliLoading) {
          return res.status(400).json({ success: false, error: "Foto selfie Kembali Ke Loading wajib diambil." });
        }
      }

      // Check if Apps Script Web App URL is provided
      const appsScriptUrl = req.body.appsScriptUrl || cachedAppsScriptUrl || process.env.APPS_SCRIPT_URL;
      if (appsScriptUrl) {
        console.log(`Routing submission step '${step}' via Google Apps Script Web App:`, appsScriptUrl);
        try {
          // Send entire body directly so Google Apps Script has all required fields (step, idPerjalanan, etc.)
          const payload = {
            ...req.body,
            timestamp: timestamp || new Date().toISOString()
          };

          const response = await fetch(appsScriptUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`Google Apps Script merespon dengan status HTTP: ${response.status}`);
          }

          const responseText = await response.text();
          let result: any;
          try {
            result = JSON.parse(responseText);
          } catch (jsonErr) {
            console.error("Failed to parse JSON response from Apps Script:", responseText.substring(0, 500));
            
            let descriptiveError = "Google Apps Script mengembalikan respon non-JSON (HTML). ";
            if (responseText.includes("Google Accounts") || responseText.includes("Sign in") || responseText.includes("login")) {
              descriptiveError += "Ini biasanya terjadi karena setelan akses Web App di Google Apps Script Anda masih diatur ke 'Hanya saya' (Only myself). Silakan Deploy Ulang (New Deployment) di Google Apps Script, ubah bagian 'Who has access' menjadi 'Anyone' (Siapa saja, bahkan anonim), lalu salin URL Web App yang baru ke form Admin.";
            } else {
              descriptiveError += "Kemungkinan ada kesalahan kode (error/crash) di dalam kode Apps Script Anda, atau URL Web App salah. Silakan periksa menu eksekusi di Google Apps Script Anda untuk melacak letak errornya.";
            }
            throw new Error(descriptiveError);
          }

          if (!result.success) {
            throw new Error(result.error || "Gagal merekam data ke Google Sheet melalui Apps Script.");
          }

          return res.json({
            success: true,
            idPerjalanan: idPerjalanan || result.idPerjalanan,
            message: result.message || `Langkah '${step}' berhasil disimpan melalui Apps Script!`,
            spreadsheetUrl: SPREADSHEET_ID ? `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit` : undefined
          });
        } catch (scriptError: any) {
          console.error("Error submitting via Apps Script:", scriptError);
          return res.status(500).json({
            success: false,
            error: scriptError.message || `Gagal mengirim lewat Google Apps Script: ${scriptError}`
          });
        }
      }

      // Initialize Google Client
      const drive = google.drive({ version: "v3", auth });
      const sheets = google.sheets({ version: "v4", auth });

      // Helper function to upload base64 image to Google Drive
      const uploadPhoto = async (base64Str: string, fileName: string) => {
        const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        const fileMetadata = {
          name: fileName,
          mimeType: "image/jpeg",
        };

        const media = {
          mimeType: "image/jpeg",
          body: Readable.from(buffer),
        };

        const fileResponse = await drive.files.create({
          requestBody: fileMetadata,
          media: media,
          fields: "id, webViewLink, webContentLink",
        });

        const fileId = fileResponse.data.id;

        // Make the file publicly viewable so sheet links can be opened by anyone
        if (fileId) {
          try {
            await drive.permissions.create({
              fileId: fileId,
              requestBody: {
                role: "reader",
                type: "anyone",
              },
            });
          } catch (permError) {
            console.warn("Failed to set public permission on file, continuing...", permError);
          }
        }

        return fileResponse.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
      };

      // Create a formatted timestamp string
      const dateObj = timestamp ? new Date(timestamp) : new Date();
      const formattedTimestamp = dateObj.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        dateStyle: "short",
        timeStyle: "medium"
      });

      // Generate ID Perjalanan if starting a new sequential journey and not provided
      const finalIdPerjalanan = idPerjalanan || `JALUR-${nip || "TEMP"}-${Date.now()}`;

      if (step === "all") {
        console.log("Uploading loading photo...");
        const fotoLoadingUrl = await uploadPhoto(
          fotoLoading,
          `Loading_${nip}_${Date.now()}.jpg`
        );

        console.log("Uploading customer home photo...");
        const fotoCustomerUrl = await uploadPhoto(
          fotoCustomer,
          `Customer_${nip}_${Date.now()}.jpg`
        );

        console.log("Uploading kembali loading photo...");
        const fotoKembaliLoadingUrl = await uploadPhoto(
          fotoKembaliLoading,
          `KembaliLoading_${nip}_${Date.now()}.jpg`
        );

        console.log("Recording to Google Sheets (legacy full form)...");
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: "A:K",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [
                formattedTimestamp,
                nama,
                nip,
                jabatan,
                tujuanJalur,
                alamatCustomer,
                noReceipt,
                armada,
                fotoLoadingUrl,
                fotoCustomerUrl,
                fotoKembaliLoadingUrl
              ]
            ]
          }
        });

        return res.json({
          success: true,
          message: "Data lengkap berhasil dikirim dan direkam ke Google Sheets!",
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
        });
      }

      if (step === "start") {
        console.log("Uploading loading photo for Step 1...");
        const fotoLoadingUrl = await uploadPhoto(
          fotoLoading,
          `Loading_${nip}_${Date.now()}.jpg`
        );

        console.log("Appending row to Google Sheets for Step 1 (Mulai)...");
        // Row template: ID, Timestamp Keluar, Nama, NIP, Jabatan, Tujuan Jalur, Alamat Customer, No Receipt, Armada, Foto Keluar
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: "A:J",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [
                finalIdPerjalanan,
                formattedTimestamp,
                nama,
                nip,
                jabatan,
                tujuanJalur,
                alamatCustomer,
                noReceipt,
                armada,
                fotoLoadingUrl
              ]
            ]
          }
        });

        return res.json({
          success: true,
          idPerjalanan: finalIdPerjalanan,
          message: "Perjalanan berhasil dimulai! Data keberangkatan direkam ke Google Sheets.",
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
        });
      }

      // Steps 'customer' and 'kembali' need searching for matching row in Column A
      console.log(`Searching for ID Perjalanan: ${idPerjalanan} in Google Sheets...`);
      const getResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "A:A" // Read only first column to locate row
      });

      const rows = getResponse.data.values || [];
      let rowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i][0] === idPerjalanan) {
          rowIndex = i + 1; // 1-based row index for Google Sheets
          break;
        }
      }

      if (rowIndex === -1) {
        console.error(`ID Perjalanan ${idPerjalanan} not found in the sheet.`);
        return res.status(404).json({
          success: false,
          error: `Gagal memperbarui perjalanan: ID Perjalanan '${idPerjalanan}' tidak ditemukan di Google Sheet. Silakan pastikan data tidak terhapus.`
        });
      }

      if (step === "customer") {
        console.log("Uploading customer photo for Step 2...");
        const fotoCustomerUrl = await uploadPhoto(
          fotoCustomer,
          `Customer_${nip || "UPDATE"}_${Date.now()}.jpg`
        );

        console.log(`Updating Google Sheet Row ${rowIndex} for Step 2 (Sampai Customer)...`);
        // We write to columns K & L (Columns 11 and 12). Range is K{rowIndex}:L{rowIndex}
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `K${rowIndex}:L${rowIndex}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [formattedTimestamp, fotoCustomerUrl]
            ]
          }
        });

        return res.json({
          success: true,
          idPerjalanan,
          message: "Perjalanan berhasil diperbarui! Foto tiba di rumah customer terekam.",
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
        });
      }

      if (step === "kembali") {
        console.log("Uploading return photo for Step 3...");
        const fotoKembaliLoadingUrl = await uploadPhoto(
          fotoKembaliLoading,
          `KembaliLoading_${nip || "UPDATE"}_${Date.now()}.jpg`
        );

        console.log(`Updating Google Sheet Row ${rowIndex} for Step 3 (Kembali ke Loading)...`);
        // We write to columns M & N (Columns 13 and 14). Range is M{rowIndex}:N{rowIndex}
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `M${rowIndex}:N${rowIndex}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [
              [formattedTimestamp, fotoKembaliLoadingUrl]
            ]
          }
        });

        return res.json({
          success: true,
          idPerjalanan,
          message: "Perjalanan selesai! Seluruh laporan perjalanan lengkap terekam di Google Sheets.",
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`
        });
      }

    } catch (error: any) {
      console.error("Error handling submission:", error);
      
      const errorMessage = error.message || "";
      const isApiDisabled = errorMessage.includes("not been used in project") || 
                            errorMessage.includes("is disabled") || 
                            errorMessage.includes("accessNotConfigured") ||
                            (error.status === 403 && (errorMessage.includes("API") || errorMessage.includes("overview?project=")));

      if (isApiDisabled) {
        // Extract project ID from the error message using regex
        const projectMatch = errorMessage.match(/project[s]?\/(\d+)/) || errorMessage.match(/project=(\d+)/) || errorMessage.match(/project\s+(\d+)/);
        const projectNumber = projectMatch ? projectMatch[1] : "1073526239787";
        
        return res.status(403).json({
          success: false,
          isApiDisabled: true,
          error: "API Google Sheets / Google Drive belum diaktifkan di Google Cloud Project Anda.",
          sheetsEnableUrl: `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectNumber}`,
          driveEnableUrl: `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${projectNumber}`,
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL
        });
      }

      // Determine if it is a permission denied error from Google APIs
      const isPermissionDenied = error.status === 403 || errorMessage.toLowerCase().includes("permission");
      
      res.status(500).json({
        success: false,
        error: isPermissionDenied 
          ? "Akses ditolak. Harap pastikan Google Sheet telah dibagikan dengan email Service Account."
          : errorMessage || "Terjadi kesalahan pada server.",
        isPermissionError: isPermissionDenied,
        serviceAccountEmail: SERVICE_ACCOUNT_EMAIL
      });
    }
  });

  // Vite middleware for development
  async function initViteAndListen() {
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    if (!process.env.VERCEL) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on port ${PORT}`);
      });
    }
  }

  initViteAndListen().catch((err) => {
    console.error("Failed to initialize server:", err);
  });
