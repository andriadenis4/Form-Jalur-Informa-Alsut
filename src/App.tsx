import React, { useState, useEffect } from "react";
import {
  User,
  FileText,
  MapPin,
  ClipboardList,
  Truck,
  CheckCircle,
  Copy,
  ExternalLink,
  AlertCircle,
  Info,
  Calendar,
  ChevronRight,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Camera
} from "lucide-react";
import CameraCapture from "./components/CameraCapture";

interface ConfigInfo {
  serviceAccountEmail: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  appsScriptUrl?: string;
}

interface ActiveJourney {
  idPerjalanan: string;
  nama: string;
  nip: string;
  jabatan: string;
  tujuanJalur: string;
  alamatCustomer: string;
  noReceipt: string;
  armada: string;
  step: "customer" | "kembali";
  timestampStart: string;
}

export default function App() {
  // Active journey state
  const [activeJourney, setActiveJourney] = useState<ActiveJourney | null>(() => {
    const saved = localStorage.getItem("active_journey");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Gagal mengurai active_journey dari localStorage", e);
      }
    }
    return null;
  });

  // Form state
  const [nama, setNama] = useState("");
  const [nip, setNip] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [tujuanJalur, setTujuanJalur] = useState("");
  const [alamatCustomer, setAlamatCustomer] = useState("");
  const [noReceipt, setNoReceipt] = useState("");
  const [armada, setArmada] = useState("");
  const [armadaLainLain, setArmadaLainLain] = useState("");

  // Photos state
  const [fotoLoading, setFotoLoading] = useState<string | null>(null);
  const [fotoCustomer, setFotoCustomer] = useState<string | null>(null);
  const [fotoKembaliLoading, setFotoKembaliLoading] = useState<string | null>(null);

  // App UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
    spreadsheetUrl?: string;
    isApiDisabled?: boolean;
    sheetsEnableUrl?: string;
    driveEnableUrl?: string;
  } | null>(null);
  const [configInfo, setConfigInfo] = useState<ConfigInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Apps Script states for custom Google Sheets proxying
  const [appsScriptUrl, setAppsScriptUrl] = useState(() => {
    return localStorage.getItem("apps_script_url") || "https://script.google.com/macros/s/AKfycbwGx9Q8oaSimaiGydZAoiW8jWaX4VG3oirirLTwYfP0FjK6P-f8CMhzajrZ3ujAvHnBqA/exec";
  });
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [tempAppsScriptUrl, setTempAppsScriptUrl] = useState(appsScriptUrl);

  const handleSaveAppsScriptUrl = async () => {
    try {
      const trimmedUrl = tempAppsScriptUrl.trim();
      localStorage.setItem("apps_script_url", trimmedUrl);
      setAppsScriptUrl(trimmedUrl);

      const response = await fetch("/api/config/apps-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ appsScriptUrl: trimmedUrl })
      });

      if (!response.ok) {
        throw new Error("Gagal menyimpan ke server");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Gagal menyimpan URL Apps Script ke server:", err);
      // Fallback: save success locally
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  // Load config on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "true") {
      setIsAdmin(true);
    }

    const urlScript = params.get("script");
    if (urlScript) {
      const trimmedScript = urlScript.trim();
      setAppsScriptUrl(trimmedScript);
      setTempAppsScriptUrl(trimmedScript);
      localStorage.setItem("apps_script_url", trimmedScript);
      
      // Sync to server dynamically in case of restart
      fetch("/api/config/apps-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ appsScriptUrl: trimmedScript })
      }).catch((err) => console.error("Gagal menyinkronkan URL script dari params ke server:", err));
    }

    fetch("/api/config")
      .then((res) => res.json())
      .then((data: ConfigInfo) => {
        setConfigInfo(data);
        if (data.appsScriptUrl && !urlScript) {
          setAppsScriptUrl(data.appsScriptUrl);
          setTempAppsScriptUrl(data.appsScriptUrl);
          localStorage.setItem("apps_script_url", data.appsScriptUrl);
        } else if (!data.appsScriptUrl && !urlScript) {
          // Self-healing: if server has no script URL, check if this client has one saved locally and sync it
          const localUrl = localStorage.getItem("apps_script_url");
          if (localUrl) {
            setAppsScriptUrl(localUrl);
            setTempAppsScriptUrl(localUrl);
            fetch("/api/config/apps-script", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ appsScriptUrl: localUrl })
            }).catch((err) => console.error("Gagal sinkronisasi URL lokal ke server:", err));
          }
        }
      })
      .catch((err) => console.error("Gagal memuat konfigurasi:", err));
  }, []);

  const copyServiceAccount = () => {
    if (configInfo?.serviceAccountEmail) {
      navigator.clipboard.writeText(configInfo.serviceAccountEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartJourney = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate Step 1 fields
    if (!nama.trim()) return setErrorMessage("Nama wajib diisi");
    if (!nip.trim()) return setErrorMessage("NIP wajib diisi");
    if (nip.trim().length < 4) return setErrorMessage("NIP minimal 4 digit");
    if (!jabatan.trim()) return setErrorMessage("Jabatan wajib diisi");
    if (!tujuanJalur.trim()) return setErrorMessage("Tujuan Jalur wajib diisi");
    if (!alamatCustomer.trim()) return setErrorMessage("Alamat Customer wajib diisi");
    if (!noReceipt.trim()) return setErrorMessage("No Receipt wajib diisi");
    if (!armada) return setErrorMessage("Pilih Armada yang digunakan");
    if (armada === "lain_lain" && !armadaLainLain.trim()) return setErrorMessage("Isi armada khusus (Lain-lain)");
    if (!fotoLoading) return setErrorMessage("Foto Selfie Saat Keluar Loading wajib diambil");

    setIsSubmitting(true);
    const finalArmada = armada === "lain_lain" ? armadaLainLain : armada;
    const generatedId = `JALUR-${nip}-${Date.now()}`;

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          step: "start",
          idPerjalanan: generatedId,
          nama,
          nip,
          jabatan,
          tujuanJalur,
          alamatCustomer,
          noReceipt,
          armada: finalArmada,
          fotoLoading,
          timestamp: new Date().toISOString(),
          appsScriptUrl: appsScriptUrl.trim()
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const journey: ActiveJourney = {
          idPerjalanan: result.idPerjalanan || generatedId,
          nama,
          nip,
          jabatan,
          tujuanJalur,
          alamatCustomer,
          noReceipt,
          armada: finalArmada,
          step: "customer",
          timestampStart: new Date().toISOString()
        };
        localStorage.setItem("active_journey", JSON.stringify(journey));
        setActiveJourney(journey);
        
        // Reset photos that are not yet taken for subsequent steps
        setFotoCustomer(null);
        setFotoKembaliLoading(null);
        
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setSubmitResult({
          success: false,
          message: result.error || "Gagal memulai perjalanan.",
          isApiDisabled: result.isApiDisabled,
          sheetsEnableUrl: result.sheetsEnableUrl,
          driveEnableUrl: result.driveEnableUrl
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err: any) {
      console.error("Error starting journey:", err);
      setErrorMessage("Koneksi ke server terputus atau gagal mengirim data keberangkatan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!activeJourney) return;
    if (!fotoCustomer) return setErrorMessage("Foto Selfie di Rumah Customer wajib diambil.");

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          step: "customer",
          idPerjalanan: activeJourney.idPerjalanan,
          nip: activeJourney.nip,
          fotoCustomer,
          timestamp: new Date().toISOString(),
          appsScriptUrl: appsScriptUrl.trim()
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const updatedJourney: ActiveJourney = {
          ...activeJourney,
          step: "kembali"
        };
        localStorage.setItem("active_journey", JSON.stringify(updatedJourney));
        setActiveJourney(updatedJourney);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrorMessage(result.error || "Gagal memperbarui status perjalanan ke rumah customer.");
      }
    } catch (err: any) {
      console.error("Error customer step:", err);
      setErrorMessage("Koneksi ke server terputus atau gagal memperbarui status. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishJourney = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!activeJourney) return;
    if (!fotoKembaliLoading) return setErrorMessage("Foto Selfie Kembali Ke Loading wajib diambil.");

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          step: "kembali",
          idPerjalanan: activeJourney.idPerjalanan,
          nip: activeJourney.nip,
          fotoKembaliLoading,
          timestamp: new Date().toISOString(),
          appsScriptUrl: appsScriptUrl.trim()
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Clear active journey from local storage as it is finished!
        localStorage.removeItem("active_journey");
        setActiveJourney(null);

        // Reset the form values
        setNama("");
        setNip("");
        setJabatan("");
        setTujuanJalur("");
        setAlamatCustomer("");
        setNoReceipt("");
        setArmada("");
        setArmadaLainLain("");
        setFotoLoading(null);
        setFotoCustomer(null);
        setFotoKembaliLoading(null);

        // Show finish screen
        setSubmitResult({
          success: true,
          message: "Laporan Perjalanan Lengkap! Seluruh data keberangkatan, kunjungan customer, dan kepulangan Anda telah berhasil direkam di Google Sheets.",
          spreadsheetUrl: result.spreadsheetUrl
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrorMessage(result.error || "Gagal menyelesaikan perjalanan.");
      }
    } catch (err: any) {
      console.error("Error finish step:", err);
      setErrorMessage("Koneksi ke server terputus atau gagal merekam kepulangan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelActiveJourney = () => {
    if (window.confirm("PENTING: Apakah Anda yakin ingin membatalkan perjalanan aktif ini? Data perjalanan yang belum selesai ini akan dihapus dari memori HP Anda.")) {
      localStorage.removeItem("active_journey");
      setActiveJourney(null);
      setFotoLoading(null);
      setFotoCustomer(null);
      setFotoKembaliLoading(null);
      setErrorMessage(null);
    }
  };

  const handleResetForm = () => {
    setNama("");
    setNip("");
    setJabatan("");
    setTujuanJalur("");
    setAlamatCustomer("");
    setNoReceipt("");
    setArmada("");
    setArmadaLainLain("");
    setFotoLoading(null);
    setFotoCustomer(null);
    setFotoKembaliLoading(null);
    setSubmitResult(null);
    setErrorMessage(null);
    localStorage.removeItem("active_journey");
    setActiveJourney(null);
  };

  const armadaOptions = [
    { value: "Pak Fatah", label: "Pak Fatah" },
    { value: "Pak Rovie", label: "Pak Rovie" },
    { value: "Pak Aurel", label: "Pak Aurel" },
    { value: "Bu Mey", label: "Bu Mey" },
    { value: "Armada IE", label: "Armada IE" },
    { value: "Kendaraan Pribadi", label: "Kendaraan Pribadi" },
    { value: "lain_lain", label: "Lain-lain (Isi Sendiri)" }
  ];

  return (
    <div className="min-h-screen font-sans antialiased text-slate-800">
      {/* Decorative Color Bar on Top (Informa Colors) */}
      <div className="h-2 w-full flex">
        <div className="h-full flex-1 bg-[#0f4372]" title="Dark Azure"></div>
        <div className="h-full flex-1 bg-[#F6b742]" title="Orange"></div>
        <div className="h-full flex-1 bg-[#e55541]" title="Red"></div>
        <div className="h-full flex-1 bg-[#83baa3]" title="Grey Green"></div>
      </div>

      <header className="bg-[#0f4372] text-white py-5 shadow-md">
        <div className="max-w-3xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white text-[#0f4372] rounded-xl flex items-center justify-center font-black text-xl shadow-md">
              I
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight font-display">
                INFORMA <span className="text-[#F6b742]">ALAM SUTERA</span>
              </h1>
              <p className="text-xs text-white/80 font-medium">Log Aktivitas & Penanganan DO</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-white/75 uppercase tracking-wider">Sistem Record DO</div>
            <div className="font-bold text-sm text-[#F6b742] flex items-center gap-1.5 justify-end">
              <span className="w-2 h-2 rounded-full bg-[#83baa3] animate-pulse"></span>
              FORM JALUR PETUGAS
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        
        {/* Google Sheet Connection Info / Alert with Frosted Glass */}
        {isAdmin && configInfo && !submitResult && (
          <div id="service-account-widget" className="mb-8 glass-panel rounded-2xl overflow-hidden border border-white/50">
            <div className="p-4 bg-[#0f4372]/5 border-b border-white/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#0f4372]" />
                <span className="text-xs font-bold text-[#0f4372] uppercase tracking-wider">Koneksi & Sinkronisasi Google Sheets</span>
              </div>
              <a
                href={configInfo.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#0f4372] hover:text-[#e55541] font-semibold flex items-center gap-1.5 transition-colors"
              >
                Buka Google Sheets <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            
            <div className="p-5 text-xs space-y-4">
              {/* Toggle Buttons */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setShowAppsScriptGuide(false)}
                  className={`flex-1 py-2 rounded-lg font-bold text-center transition-all cursor-pointer ${
                    !showAppsScriptGuide 
                      ? "bg-white text-[#0f4372] shadow-xs" 
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Metode 1: Service Account (Default)
                </button>
                <button
                  type="button"
                  onClick={() => setShowAppsScriptGuide(true)}
                  className={`flex-1 py-2 rounded-lg font-bold text-center transition-all cursor-pointer ${
                    showAppsScriptGuide 
                      ? "bg-[#0f4372] text-white shadow-xs" 
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Metode 2: Google Apps Script (Rekomendasi / Lebih Mudah)
                </button>
              </div>

              {!showAppsScriptGuide ? (
                <div className="space-y-3">
                  <p className="text-slate-600 leading-relaxed">
                    Agar data form dan foto terekam langsung di Google Sheets, pastikan spreadsheet Anda telah dibagikan dengan memberikan akses <strong className="text-[#0f4372]">Editor</strong> ke email Service Account berikut:
                  </p>
                  <div className="flex items-center gap-2 bg-white/90 p-2.5 rounded-xl border border-slate-200 shadow-xs">
                    <code className="font-mono text-slate-800 break-all flex-1 text-[11px]">
                      {configInfo.serviceAccountEmail}
                    </code>
                    <button
                      type="button"
                      onClick={copyServiceAccount}
                      className="px-3.5 py-1.5 bg-[#0f4372] hover:bg-[#0f4372]/90 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-xs text-xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? "Tersalin" : "Salin"}
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-600 leading-relaxed font-semibold mt-2">
                    * Catatan: Metode ini memerlukan pengaktifan API Google Sheets di Google Cloud. Jika muncul error "You need additional access" di Google Cloud Console, silakan gunakan <strong>Metode 2 (Google Apps Script)</strong> di atas.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 leading-relaxed text-[11px] font-medium">
                    💡 <strong>Mengapa memakai metode ini?</strong> Metode ini 100% aman, gratis, dan pasti berhasil tanpa perlu konfigurasi Google Cloud atau Service Account. Data & foto disimpan menggunakan hak akses akun Google Anda sendiri.
                  </div>

                  <div className="space-y-2">
                    <p className="font-bold text-[#0f4372]">Langkah-langkah Setup Google Apps Script:</p>
                    <ol className="list-decimal pl-4 space-y-1.5 text-slate-600 leading-relaxed">
                      <li>Buka Google Sheets Anda (<em>FORM JALUR ALSUT</em>).</li>
                      <li>Di menu atas, klik <strong>Ekstensi</strong> (Extensions) &gt; <strong>Apps Script</strong>.</li>
                      <li>Hapus semua kode bawaan di sana, lalu copy dan paste kode script di bawah ini:</li>
                    </ol>
                  </div>

                  <div className="relative">
                    <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-[10px] overflow-x-auto max-h-48 whitespace-pre leading-relaxed">
{`function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var step = data.step || "all";
    var idPerjalanan = data.idPerjalanan;
    var timestampStr = data.timestamp ? new Date(data.timestamp).toLocaleString("id-ID", {timeZone: "Asia/Jakarta"}) : new Date().toLocaleString("id-ID", {timeZone: "Asia/Jakarta"});

    if (step === "all" || step === "start") {
      var fotoLoadingUrl = "";
      if (data.fotoLoading) {
        fotoLoadingUrl = uploadToDrive(data.fotoLoading, "Loading_" + data.nip + "_" + Date.now() + ".jpg");
      }
      
      if (step === "all") {
        var fotoCustomerUrl = "";
        var fotoKembaliUrl = "";
        if (data.fotoCustomer) {
          fotoCustomerUrl = uploadToDrive(data.fotoCustomer, "Customer_" + data.nip + "_" + Date.now() + ".jpg");
        }
        if (data.fotoKembaliLoading) {
          fotoKembaliUrl = uploadToDrive(data.fotoKembaliLoading, "KembaliLoading_" + data.nip + "_" + Date.now() + ".jpg");
        }
        sheet.appendRow([
          timestampStr,
          data.nama,
          data.nip,
          data.jabatan,
          data.tujuanJalur,
          data.alamatCustomer,
          data.noReceipt,
          data.armada,
          fotoLoadingUrl,
          fotoCustomerUrl,
          fotoKembaliUrl
        ]);
      } else {
        // Step 'start' -> Append new row with ID Perjalanan
        sheet.appendRow([
          idPerjalanan,
          timestampStr,
          data.nama,
          data.nip,
          data.jabatan,
          data.tujuanJalur,
          data.alamatCustomer,
          data.noReceipt,
          data.armada,
          fotoLoadingUrl
        ]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        idPerjalanan: idPerjalanan,
        message: "Perjalanan berhasil direkam!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // For step 'customer' and 'kembali', search for the matching idPerjalanan in Column A
    var values = sheet.getRange("A:A").getValues();
    var rowIndex = -1;
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === idPerjalanan) {
        rowIndex = i + 1; // 1-based row index
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("ID Perjalanan '" + idPerjalanan + "' tidak ditemukan di Google Sheets.");
    }

    if (step === "customer") {
      var fotoCustomerUrl = "";
      if (data.fotoCustomer) {
        fotoCustomerUrl = uploadToDrive(data.fotoCustomer, "Customer_" + data.nip + "_" + Date.now() + ".jpg");
      }
      // Write to Column K (11) and L (12)
      sheet.getRange(rowIndex, 11).setValue(timestampStr);
      sheet.getRange(rowIndex, 12).setValue(fotoCustomerUrl);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Perjalanan diperbarui! Foto di rumah customer terekam."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (step === "kembali") {
      var fotoKembaliUrl = "";
      if (data.fotoKembaliLoading) {
        fotoKembaliUrl = uploadToDrive(data.fotoKembaliLoading, "KembaliLoading_" + data.nip + "_" + Date.now() + ".jpg");
      }
      // Write to Column M (13) and N (14)
      sheet.getRange(rowIndex, 13).setValue(timestampStr);
      sheet.getRange(rowIndex, 14).setValue(fotoKembaliUrl);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Perjalanan selesai terekam di Google Sheets!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function uploadToDrive(base64Data, fileName) {
  try {
    var decoded = Utilities.base64Decode(base64Data.split(",")[1]);
    var blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    var file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    return "Error upload foto: " + err.toString();
  }
}`}
                    </pre>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var step = data.step || "all";
    var idPerjalanan = data.idPerjalanan;
    var timestampStr = data.timestamp ? new Date(data.timestamp).toLocaleString("id-ID", {timeZone: "Asia/Jakarta"}) : new Date().toLocaleString("id-ID", {timeZone: "Asia/Jakarta"});

    if (step === "all" || step === "start") {
      var fotoLoadingUrl = "";
      if (data.fotoLoading) {
        fotoLoadingUrl = uploadToDrive(data.fotoLoading, "Loading_" + data.nip + "_" + Date.now() + ".jpg");
      }
      
      if (step === "all") {
        var fotoCustomerUrl = "";
        var fotoKembaliUrl = "";
        if (data.fotoCustomer) {
          fotoCustomerUrl = uploadToDrive(data.fotoCustomer, "Customer_" + data.nip + "_" + Date.now() + ".jpg");
        }
        if (data.fotoKembaliLoading) {
          fotoKembaliUrl = uploadToDrive(data.fotoKembaliLoading, "KembaliLoading_" + data.nip + "_" + Date.now() + ".jpg");
        }
        sheet.appendRow([
          timestampStr,
          data.nama,
          data.nip,
          data.jabatan,
          data.tujuanJalur,
          data.alamatCustomer,
          data.noReceipt,
          data.armada,
          fotoLoadingUrl,
          fotoCustomerUrl,
          fotoKembaliUrl
        ]);
      } else {
        // Step 'start' -> Append new row with ID Perjalanan
        sheet.appendRow([
          idPerjalanan,
          timestampStr,
          data.nama,
          data.nip,
          data.jabatan,
          data.tujuanJalur,
          data.alamatCustomer,
          data.noReceipt,
          data.armada,
          fotoLoadingUrl
        ]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        idPerjalanan: idPerjalanan,
        message: "Perjalanan berhasil direkam!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // For step 'customer' and 'kembali', search for the matching idPerjalanan in Column A
    var values = sheet.getRange("A:A").getValues();
    var rowIndex = -1;
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === idPerjalanan) {
        rowIndex = i + 1; // 1-based row index
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error("ID Perjalanan '" + idPerjalanan + "' tidak ditemukan di Google Sheets.");
    }

    if (step === "customer") {
      var fotoCustomerUrl = "";
      if (data.fotoCustomer) {
        fotoCustomerUrl = uploadToDrive(data.fotoCustomer, "Customer_" + data.nip + "_" + Date.now() + ".jpg");
      }
      // Write to Column K (11) and L (12)
      sheet.getRange(rowIndex, 11).setValue(timestampStr);
      sheet.getRange(rowIndex, 12).setValue(fotoCustomerUrl);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Perjalanan diperbarui! Foto di rumah customer terekam."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (step === "kembali") {
      var fotoKembaliUrl = "";
      if (data.fotoKembaliLoading) {
        fotoKembaliUrl = uploadToDrive(data.fotoKembaliLoading, "KembaliLoading_" + data.nip + "_" + Date.now() + ".jpg");
      }
      // Write to Column M (13) and N (14)
      sheet.getRange(rowIndex, 13).setValue(timestampStr);
      sheet.getRange(rowIndex, 14).setValue(fotoKembaliUrl);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Perjalanan selesai terekam di Google Sheets!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function uploadToDrive(base64Data, fileName) {
  try {
    var decoded = Utilities.base64Decode(base64Data.split(",")[1]);
    var blob = Utilities.newBlob(decoded, "image/jpeg", fileName);
    var file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    return "Error upload foto: " + err.toString();
  }
}`);
                        alert("Script berhasil disalin! Silakan paste di Google Apps Script Anda.");
                      }}
                      className="absolute right-3 top-3 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold border border-white/20 cursor-pointer"
                    >
                      Salin Script
                    </button>
                  </div>

                  <div className="space-y-2">
                    <ol className="list-decimal pl-4 space-y-1.5 text-slate-600 leading-relaxed" start={4}>
                      <li>Klik ikon <strong>Simpan (ikon disket)</strong> di atas editor Apps Script.</li>
                      <li>Klik tombol biru <strong>Terapkan (Deploy)</strong> di bagian kanan atas &gt; pilih <strong>Penerapan baru (New deployment)</strong>.</li>
                      <li>Klik ikon gerigi di sebelah "Pilih jenis" &gt; pilih <strong>Aplikasi web (Web app)</strong>.</li>
                      <li>Di bagian <strong>Jalankan sebagai (Execute as)</strong>, pilih <strong>Saya (email Anda)</strong>.</li>
                      <li>Di bagian <strong>Yang memiliki akses (Who has access)</strong>, pilih <strong>Siapa saja (Anyone)</strong>.</li>
                      <li>Klik tombol <strong>Terapkan (Deploy)</strong> di bagian bawah.</li>
                      <li>Klik tombol <strong>Izinkan akses (Authorize access)</strong>, pilih akun Google Anda, klik <strong>Advanced (Lanjutan)</strong> &gt; <strong>Go to Untitled project (unsafe)</strong>, lalu klik <strong>Allow (Izinkan)</strong>.</li>
                      <li>Salin <strong>URL Aplikasi Web</strong> yang muncul (berakhiran <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">/exec</code>).</li>
                    </ol>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-700">Paste URL Aplikasi Web Apps Script Anda di sini:</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://script.google.com/macros/s/.../exec"
                        value={tempAppsScriptUrl}
                        onChange={(e) => setTempAppsScriptUrl(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-[#0f4372] text-xs font-mono bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleSaveAppsScriptUrl}
                        className="px-4 py-2 bg-[#83baa3] hover:bg-[#83baa3]/95 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer shrink-0"
                      >
                        {saveSuccess ? "Tersimpan!" : "Simpan URL"}
                      </button>
                    </div>
                    {appsScriptUrl && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-green-600 font-semibold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> URL Apps Script aktif & tersimpan di browser Anda!
                        </p>
                        <div className="mt-2 p-3 bg-[#83baa3]/10 border border-[#83baa3]/30 rounded-xl space-y-2">
                          <p className="text-xs font-bold text-slate-700">Bagikan Link Khusus Sales ini agar mereka otomatis terkonfigurasi:</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`${window.location.origin}${window.location.pathname}?script=${encodeURIComponent(appsScriptUrl)}`}
                              className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] font-mono bg-white text-slate-600 outline-none"
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const shareUrl = `${window.location.origin}${window.location.pathname}?script=${encodeURIComponent(appsScriptUrl)}`;
                                navigator.clipboard.writeText(shareUrl);
                                alert("Link Khusus Sales berhasil disalin! Silakan bagikan link ini ke grup WA sales.");
                              }}
                              className="px-3 py-1.5 bg-[#0f4372] hover:bg-[#0f4372]/90 text-white rounded-lg font-bold text-[10px] transition-colors cursor-pointer shrink-0"
                            >
                              Salin Link Sales
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success / Result screen with Frosted Glass */}
        {submitResult ? (
          <div id="result-screen" className="glass-panel rounded-3xl shadow-xl p-8 text-center space-y-6 animate-fade-in border border-white/50">
            {submitResult.success ? (
              <>
                <div className="w-16 h-16 bg-[#83baa3]/20 text-[#83baa3] rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-[#0f4372] font-display">
                    Pengiriman Berhasil!
                  </h2>
                  <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                    Semua rincian perjalanan, data DO, beserta foto selfie yang di-watermark waktu telah tersimpan dengan aman.
                  </p>
                </div>

                {isAdmin && submitResult.spreadsheetUrl && (
                  <div className="max-w-md mx-auto p-4 bg-white/80 border border-white/60 rounded-2xl space-y-3 shadow-xs">
                    <p className="text-xs text-slate-500 font-medium">Klik tombol di bawah ini untuk melihat update data secara real-time:</p>
                    <a
                      href={submitResult.spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-3 bg-[#83baa3] hover:bg-[#83baa3]/90 text-white font-bold rounded-xl shadow-md transition-all text-sm cursor-pointer"
                    >
                      Buka Google Sheet Penerima
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 max-w-sm mx-auto">
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="w-full py-3 bg-[#0f4372] hover:bg-[#0f4372]/95 text-white font-bold rounded-xl text-sm shadow-md transition-all cursor-pointer"
                  >
                    Isi Formulir Baru
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-[#e55541]/20 text-[#e55541] rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <ShieldAlert className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-[#e55541] font-display">
                    {submitResult.isApiDisabled ? "API Google Belum Aktif" : "Gagal Menyimpan Data"}
                  </h2>
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    {submitResult.message}
                  </p>
                </div>

                {submitResult.isApiDisabled ? (
                  <div className="max-w-md mx-auto p-5 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-left space-y-4 text-xs text-blue-900 backdrop-blur-xs">
                    <p className="font-bold flex items-center gap-1.5 text-blue-900 text-sm">
                      <Info className="w-4 h-4 shrink-0" /> CARA MENGAKTIFKAN:
                    </p>
                    <p className="leading-relaxed">
                      Google Cloud Project Anda memerlukan aktivasi API Google Sheets dan Google Drive terlebih dahulu agar data dapat terkirim. Silakan klik kedua tombol di bawah ini secara bergantian untuk mengaktifkannya di Google Cloud Console Anda:
                    </p>
                    <div className="space-y-2 pt-2">
                      {submitResult.sheetsEnableUrl && (
                        <a
                          href={submitResult.sheetsEnableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-3 bg-white hover:bg-blue-50 text-blue-800 font-bold border border-blue-200 rounded-xl transition-all shadow-xs cursor-pointer"
                        >
                          <span>1. Aktifkan Google Sheets API</span>
                          <ExternalLink className="w-4.5 h-4.5 text-blue-600" />
                        </a>
                      )}
                      {submitResult.driveEnableUrl && (
                        <a
                          href={submitResult.driveEnableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-3 bg-white hover:bg-blue-50 text-blue-800 font-bold border border-blue-200 rounded-xl transition-all shadow-xs cursor-pointer"
                        >
                          <span>2. Aktifkan Google Drive API</span>
                          <ExternalLink className="w-4.5 h-4.5 text-blue-600" />
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                      Setelah mengklik kedua tombol di atas dan mengklik tombol "Enable" di masing-masing halaman console, silakan kembali ke halaman ini dan klik tombol "Coba Kirim Ulang" di bawah.
                    </p>
                    
                    <div className="mt-4 pt-3 border-t border-blue-200">
                      <p className="font-bold text-amber-700 text-[11px] mb-1.5">🚨 CARA ALTERNATIF YANG JAUH LEBIH MUDAH (REKOMENDASI):</p>
                      <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
                        Jika Anda mendapatkan pesan <strong>"You need additional access"</strong> saat membuka link Google Cloud di atas, itu karena akun Anda tidak memiliki izin akses administrator pada proyek sandbox sistem. Silakan gunakan metode <strong>Google Apps Script</strong> yang 100% aman dan pasti berhasil.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAppsScriptGuide(true);
                          setSubmitResult(null);
                          setTimeout(() => {
                            const el = document.getElementById("service-account-widget");
                            if (el) el.scrollIntoView({ behavior: "smooth" });
                          }, 100);
                        }}
                        className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Gunakan Metode Google Apps Script (Pasti Berhasil)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md mx-auto p-4 bg-yellow-50/80 border border-yellow-200/80 rounded-2xl text-left space-y-3 text-xs text-yellow-800 backdrop-blur-xs">
                    <p className="font-semibold flex items-center gap-1.5 text-yellow-900">
                      <Info className="w-4 h-4" /> Solusi Penanganan:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Bagikan Google Sheet Anda ke email Service Account di atas.</li>
                      <li>Pastikan perannya diset sebagai <strong className="text-yellow-950">Editor</strong>.</li>
                      <li>Klik tombol Coba Kirim Ulang di bawah ini.</li>
                    </ol>
                  </div>
                )}

                <div className="pt-4 flex gap-3 max-w-md mx-auto">
                  <button
                    type="button"
                    onClick={() => setSubmitResult(null)}
                    className="flex-1 py-3 bg-[#0f4372] text-white hover:bg-opacity-95 font-bold rounded-xl text-sm shadow-md transition-colors cursor-pointer"
                  >
                    {submitResult.isApiDisabled ? "Coba Kirim Ulang" : "Perbaiki Form & Kirim Ulang"}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 rounded-xl text-sm transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Form Content */
          <div className="space-y-6">
            <div className="glass-panel border border-white/50 rounded-3xl p-6 text-center space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-[#0f4372] font-display">
                FORM JALUR INFORMA ALAM SUTERA
              </h2>
              <p className="text-xs font-semibold text-[#F6b742] tracking-wider uppercase">
                INFORMA LIVING WORLD ALAM SUTERA
              </p>
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                Isi form ini secara bertahap (Sequencing) sesuai alur perjalanan Anda.
              </p>
            </div>

            {errorMessage && (
              <div
                id="error-banner"
                className="p-4 bg-[#e55541]/10 border border-[#e55541]/20 rounded-2xl text-xs text-[#e55541] flex items-center gap-3 animate-pulse"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="font-semibold">Peringatan: {errorMessage}</span>
              </div>
            )}

            {activeJourney ? (
              /* Active Journey Flow (Step 2 or Step 3) */
              <div className="space-y-6 animate-fade-in">
                {/* Active Journey Info Card */}
                <div className="glass-panel border-2 border-[#83baa3]/40 rounded-3xl p-6 space-y-4 shadow-sm bg-gradient-to-br from-[#83baa3]/5 to-transparent">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
                      <h3 className="font-black text-xs text-[#0f4372] uppercase tracking-wider font-display">
                        Perjalanan Aktif Berjalan
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-[#83baa3]/20 text-[#0f4372] px-2.5 py-1 rounded-full">
                      {activeJourney.idPerjalanan}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Nama Karyawan</p>
                      <p className="font-bold text-slate-800 text-sm">{activeJourney.nama} <span className="text-xs text-slate-500 font-normal">({activeJourney.nip})</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Jabatan</p>
                      <p className="font-semibold text-slate-700">{activeJourney.jabatan}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Tujuan Perjalanan</p>
                      <p className="font-semibold text-slate-700">{activeJourney.tujuanJalur}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">No Receipt / DO</p>
                      <p className="font-bold text-slate-800 bg-[#F6b742]/10 px-2 py-0.5 rounded-lg inline-block">{activeJourney.noReceipt}</p>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Alamat Lengkap Customer</p>
                      <p className="font-medium text-slate-700 leading-relaxed bg-white/70 p-2.5 rounded-xl border border-slate-100">{activeJourney.alamatCustomer}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Armada & Waktu Mulai</p>
                      <p className="font-semibold text-slate-700">
                        {activeJourney.armada} • <span className="text-slate-500 text-[11px]">{new Date(activeJourney.timestampStart).toLocaleTimeString("id-ID")} WIB</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Active Step Panel */}
                {activeJourney.step === "customer" ? (
                  <form onSubmit={handleUpdateCustomer} className="glass-panel border-2 border-[#0f4372]/30 rounded-3xl p-6 space-y-6 shadow-md bg-white">
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-150">
                      <div className="p-2 bg-[#0f4372]/10 text-[#0f4372] rounded-xl font-black text-sm">
                        2
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-[#0f4372] uppercase tracking-wider font-display">
                          Langkah 2: Selfie di Rumah Customer
                        </h4>
                        <p className="text-[11px] text-slate-500">Ambil selfie saat Anda tiba di rumah customer tujuan</p>
                      </div>
                    </div>

                    <div className="max-w-md mx-auto bg-white/40 p-4 rounded-2xl border border-slate-100 shadow-2xs">
                      <CameraCapture
                        id="foto-customer"
                        label="FOTO SELFIE SAAT DI RUMAH CUSTOMER"
                        photo={fotoCustomer}
                        onCapture={(dataUrl) => setFotoCustomer(dataUrl)}
                        onClear={() => setFotoCustomer(null)}
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting || !fotoCustomer}
                        className="w-full py-4 bg-[#0f4372] hover:bg-opacity-95 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 text-base font-display"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Mengirim status penanganan customer...
                          </>
                        ) : (
                          <>
                            SUBMIT KUNJUNGAN CUSTOMER
                            <ChevronRight className="w-5 h-5" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelActiveJourney}
                        className="w-full py-2.5 text-center text-xs font-bold text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        Batal / Hapus Perjalanan Aktif Ini
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleFinishJourney} className="glass-panel border-2 border-[#e55541]/30 rounded-3xl p-6 space-y-6 shadow-md bg-white">
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-150">
                      <div className="p-2 bg-[#e55541]/10 text-[#e55541] rounded-xl font-black text-sm">
                        3
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-[#e55541] uppercase tracking-wider font-display">
                          Langkah 3: Selfie Kembali Lagi Ke Loading
                        </h4>
                        <p className="text-[11px] text-slate-500">Ambil selfie setibanya kembali di loading Informa Alam Sutera</p>
                      </div>
                    </div>

                    <div className="max-w-md mx-auto bg-white/40 p-4 rounded-2xl border border-slate-100 shadow-2xs">
                      <CameraCapture
                        id="foto-kembali"
                        label="FOTO SELFIE SAAT KEMBALI JALUR"
                        photo={fotoKembaliLoading}
                        onCapture={(dataUrl) => setFotoKembaliLoading(dataUrl)}
                        onClear={() => setFotoKembaliLoading(null)}
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting || !fotoKembaliLoading}
                        className="w-full py-4 bg-[#e55541] hover:bg-opacity-95 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 text-base font-display"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Menyelesaikan laporan perjalanan...
                          </>
                        ) : (
                          <>
                            SELESAIKAN & TUTUP PERJALANAN
                            <ChevronRight className="w-5 h-5" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelActiveJourney}
                        className="w-full py-2.5 text-center text-xs font-bold text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                      >
                        Batal / Hapus Perjalanan Aktif Ini
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* New Journey Flow (Step 1: Start Journey / Keberangkatan) */
              <form id="jalur-informa-form" onSubmit={handleStartJourney} className="space-y-6 animate-fade-in">
                
                {/* SECTION A: INFORMASI KARYAWAN */}
                <div id="section-employee" className="glass-panel border border-white/50 rounded-3xl p-6 space-y-5 shadow-xs">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-150">
                    <div className="p-1.5 bg-[#0f4372]/10 text-[#0f4372] rounded-xl">
                      <User className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-xs text-[#0f4372] tracking-wider uppercase font-display">
                      A. Informasi Karyawan
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* NAMA */}
                    <div className="space-y-1.5">
                      <label htmlFor="input-nama" className="block text-xs font-bold text-[#0f4372] uppercase tracking-wider">
                        Nama Karyawan <span className="text-[#e55541]">*</span>
                      </label>
                      <input
                        id="input-nama"
                        type="text"
                        required
                        placeholder="Contoh: Budi Santoso"
                        value={nama}
                        onChange={(e) => setNama(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-[#0f4372] focus:ring-4 focus:ring-[#0f4372]/10 transition-all outline-none shadow-xs"
                      />
                    </div>

                    {/* NIP */}
                    <div className="space-y-1.5">
                      <label htmlFor="input-nip" className="block text-xs font-bold text-[#0f4372] uppercase tracking-wider">
                        NIP Karyawan <span className="text-[#e55541]">*</span>
                      </label>
                      <input
                        id="input-nip"
                        type="text"
                        required
                        placeholder="Masukkan NIP"
                        value={nip}
                        onChange={(e) => setNip(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-[#0f4372] focus:ring-4 focus:ring-[#0f4372]/10 transition-all outline-none shadow-xs"
                      />
                    </div>
                  </div>

                  {/* JABATAN */}
                  <div className="space-y-1.5">
                    <label htmlFor="input-jabatan" className="block text-xs font-bold text-[#0f4372] uppercase tracking-wider">
                      Jabatan Karyawan <span className="text-[#e55541]">*</span>
                    </label>
                    <input
                      id="input-jabatan"
                      type="text"
                      required
                      placeholder="Contoh: Sales Executive / Supervisor / Store Manager"
                      value={jabatan}
                      onChange={(e) => setJabatan(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-[#0f4372] focus:ring-4 focus:ring-[#0f4372]/10 transition-all outline-none shadow-xs"
                    />
                  </div>
                </div>

                {/* SECTION B: INFORMASI TUJUAN & DO */}
                <div id="section-destination" className="glass-panel border border-white/50 rounded-3xl p-6 space-y-5 shadow-xs">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-150">
                    <div className="p-1.5 bg-[#F6b742]/10 text-[#F6b742] rounded-xl">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-xs text-[#0f4372] tracking-wider uppercase font-display">
                      B. Informasi Perjalanan & DO
                    </h3>
                  </div>

                  {/* TUJUAN JALUR */}
                  <div className="space-y-1.5">
                    <label htmlFor="input-tujuan" className="block text-xs font-bold text-[#0f4372] uppercase tracking-wider">
                      Tujuan Jalur Perjalanan <span className="text-[#e55541]">*</span>
                    </label>
                    <input
                      id="input-tujuan"
                      type="text"
                      required
                      placeholder="Contoh: Penanganan DO #9921 / Retur Barang"
                      value={tujuanJalur}
                      onChange={(e) => setTujuanJalur(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-[#0f4372] focus:ring-4 focus:ring-[#0f4372]/10 transition-all outline-none shadow-xs"
                    />
                  </div>

                  {/* NO RECEIPT */}
                  <div className="space-y-1.5">
                    <label htmlFor="input-receipt" className="block text-xs font-bold text-[#0f4372] uppercase tracking-wider">
                      No Receipt / Invoice / DO <span className="text-[#e55541]">*</span>
                    </label>
                    <input
                      id="input-receipt"
                      type="text"
                      required
                      placeholder="Contoh: CON-12345678"
                      value={noReceipt}
                      onChange={(e) => setNoReceipt(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-[#0f4372] focus:ring-4 focus:ring-[#0f4372]/10 transition-all outline-none shadow-xs"
                    />
                  </div>

                  {/* ALAMAT CUSTOMER */}
                  <div className="space-y-1.5">
                    <label htmlFor="input-alamat" className="block text-xs font-bold text-[#0f4372] uppercase tracking-wider">
                      Alamat Lengkap Customer <span className="text-[#e55541]">*</span>
                    </label>
                    <textarea
                      id="input-alamat"
                      required
                      rows={3}
                      placeholder="Ketik alamat lengkap pengiriman customer..."
                      value={alamatCustomer}
                      onChange={(e) => setAlamatCustomer(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:border-[#0f4372] focus:ring-4 focus:ring-[#0f4372]/10 transition-all outline-none resize-none shadow-xs"
                    />
                  </div>
                </div>

                {/* SECTION C: TRANSPORTASI & ARMADA */}
                <div id="section-armada" className="glass-panel border border-white/50 rounded-3xl p-6 space-y-5 shadow-xs">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-150">
                    <div className="p-1.5 bg-[#83baa3]/10 text-[#83baa3] rounded-xl">
                      <Truck className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-xs text-[#0f4372] tracking-wider uppercase font-display">
                      C. Armada yang Digunakan
                    </h3>
                  </div>

                  <div className="space-y-3.5">
                    <label className="block text-xs font-bold text-[#0f4372] uppercase tracking-wider">
                      Pilih Armada Perjalanan <span className="text-[#e55541]">*</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {armadaOptions.map((opt) => (
                        <label
                          key={opt.value}
                          id={`label-armada-${opt.value}`}
                          className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-all shadow-xs ${
                            armada === opt.value
                              ? "border-[#F6b742] bg-[#F6b742]/5 font-semibold text-[#0f4372]"
                              : "bg-white/90 border-slate-200 hover:bg-white text-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name="armada"
                            value={opt.value}
                            checked={armada === opt.value}
                            onChange={(e) => setArmada(e.target.value)}
                            className="w-4 h-4 text-[#0f4372] border-slate-300 focus:ring-[#0f4372]"
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                    </div>

                    {armada === "lain_lain" && (
                      <div id="lain-lain-container" className="pt-2 animate-fade-in">
                        <label htmlFor="input-armada-lain" className="block text-xs font-bold text-[#0f4372] mb-1.5 uppercase tracking-wider">
                          Sebutkan Armada / Kendaraan Khusus <span className="text-[#e55541]">*</span>
                        </label>
                        <input
                          id="input-armada-lain"
                          type="text"
                          required
                          placeholder="Ketik nama armada / jenis kendaraan..."
                          value={armadaLainLain}
                          onChange={(e) => setArmadaLainLain(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-[#0f4372] rounded-xl text-sm focus:ring-4 focus:ring-[#0f4372]/10 outline-none shadow-xs animate-fade-in"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION D: DOKUMENTASI / SELFIE */}
                <div id="section-photos" className="glass-panel border border-white/50 rounded-3xl p-6 space-y-6 shadow-xs">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-150">
                    <div className="p-1.5 bg-[#e55541]/10 text-[#e55541] rounded-xl">
                      <Camera className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-xs text-[#0f4372] tracking-wider uppercase font-display">
                      D. Dokumentasi & Selfie Lapangan
                    </h3>
                  </div>

                  <div className="max-w-md mx-auto bg-white/40 p-4 rounded-2xl border border-white/40 shadow-xs">
                    <CameraCapture
                      id="foto-loading"
                      label="FOTO SELFIE SAAT KELUAR LOADING (LANGKAH 1)"
                      photo={fotoLoading}
                      onCapture={(dataUrl) => setFotoLoading(dataUrl)}
                      onClear={() => setFotoLoading(null)}
                    />
                  </div>
                </div>

                {/* SUBMIT BUTTON FOR STEP 1 */}
                <div className="pt-4">
                  <button
                    id="btn-submit-form"
                    type="submit"
                    disabled={isSubmitting || !fotoLoading}
                    className="w-full py-4 bg-[#0f4372] hover:bg-opacity-95 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 text-base font-display"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sedang Menyimpan Keberangkatan...
                      </>
                    ) : (
                      <>
                        MULAI PERJALANAN JALUR
                        <ChevronRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                  <div className="text-center mt-4 space-y-1">
                    {appsScriptUrl && appsScriptUrl.startsWith("https://") ? (
                      <div className="inline-flex items-center gap-1.5 text-[10px] text-green-700 font-bold tracking-wider uppercase bg-green-50 px-3 py-1 rounded-full border border-green-200 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        SISTEM ONLINE & SIAP REKAM DATA JALUR
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-[10px] text-amber-700 font-bold tracking-wider uppercase bg-amber-50 px-3 py-1 rounded-full border border-amber-200 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        SISTEM BELUM DIKONFIGURASI OLEH ADMIN (HARAP HUBUNGI MANAJER)
                      </div>
                    )}

                    {isAdmin && (
                      <div className="text-[9px] font-semibold text-slate-400 tracking-widest uppercase pt-1">
                        ADMIN MODE • Target Sheet: {configInfo?.spreadsheetUrl ? "Terkoneksi" : "Belum terkonfigurasi"}
                      </div>
                    )}
                  </div>
                </div>

              </form>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white/60 border-t border-white/40 py-6 mt-12 text-center text-xs text-slate-500 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 space-y-1">
          <p className="font-bold text-[#0f4372] font-display">INFORMA LIVING WORLD ALAM SUTERA</p>
          <p>© 2026 PT Home Center Indonesia. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
