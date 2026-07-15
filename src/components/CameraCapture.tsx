import React, { useRef, useState, useEffect } from "react";
import { Camera, RefreshCw, CheckCircle, AlertTriangle, Play, X, Upload } from "lucide-react";

interface CameraCaptureProps {
  id: string;
  label: string;
  photo: string | null;
  onCapture: (dataUrl: string) => void;
  onClear: () => void;
}

export default function CameraCapture({
  id,
  label,
  photo,
  onCapture,
  onClear
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    setLoading(true);
    setError(null);
    setIsOpen(true);
    try {
      // Force user-facing camera (front camera)
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setError(
        "Gagal mengakses kamera depan. Harap izinkan akses kamera di browser Anda atau gunakan pilihan Upload Galeri."
      );
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        setLoading(false);
        return;
      }

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        
        // Downscale large images slightly to keep data sizes optimal
        const maxDim = 1024;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setLoading(false);
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Generate current Indonesian timestamp watermark
        const now = new Date();
        const timestampStr = now.toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
          dateStyle: "medium",
          timeStyle: "medium"
        });
        const watermarkText = `${timestampStr} - ALAM SUTERA`;
        
        // Dynamically compute watermark size based on image width
        const fontSize = Math.max(12, Math.round(width * 0.03));
        ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
        const textWidth = ctx.measureText(watermarkText).width;
        const paddingY = Math.round(fontSize * 0.7);
        const paddingX = Math.round(fontSize * 1.0);
        
        // Draw background block
        ctx.fillStyle = "rgba(15, 67, 114, 0.9)"; // Informa Dark Azure
        ctx.fillRect(
          width - textWidth - (paddingX * 2),
          height - fontSize - (paddingY * 2),
          textWidth + (paddingX * 2),
          fontSize + (paddingY * 2)
        );
        
        // Draw text
        ctx.fillStyle = "#F6b742"; // Informa Orange
        ctx.fillText(
          watermarkText,
          width - textWidth - paddingX,
          height - paddingY
        );
        
        const watermarkedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        onCapture(watermarkedDataUrl);
        setLoading(false);
      };
      img.onerror = () => {
        setLoading(false);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    
    // Use video native resolution or fallback to 640x480
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw the current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get current Indonesian timestamp
    const now = new Date();
    const timestampStr = now.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "medium"
    });

    const watermarkText = `${timestampStr} - ALAM SUTERA`;

    // Watermark style setup
    ctx.font = "bold 18px 'JetBrains Mono', monospace";
    const textWidth = ctx.measureText(watermarkText).width;
    
    // Draw background block for watermark to guarantee contrast/readability
    ctx.fillStyle = "rgba(15, 67, 114, 0.9)"; // Informa Dark Azure with opacity
    ctx.fillRect(
      canvas.width - textWidth - 30,
      canvas.height - 45,
      textWidth + 20,
      35
    );

    // Draw text
    ctx.fillStyle = "#F6b742"; // Informa Orange
    ctx.fillText(
      watermarkText,
      canvas.width - textWidth - 20,
      canvas.height - 21
    );

    // Get Data URL
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onCapture(dataUrl);
    stopCamera();
  };

  return (
    <div id={`camera-container-${id}`} className="space-y-3">
      <span className="block text-sm font-semibold text-slate-700">{label} <span className="text-[#e55541]">*</span></span>
      
      {!photo && !isOpen && (
        <button
          id={`btn-open-camera-${id}`}
          type="button"
          onClick={startCamera}
          className="flex items-center justify-center gap-2 w-full py-5 border-2 border-dashed border-slate-300 rounded-xl hover:border-[#0f4372] hover:bg-slate-50 transition-all cursor-pointer group text-slate-600 hover:text-[#0f4372]"
        >
          <Camera className="w-6 h-6 text-slate-400 group-hover:text-[#0f4372] group-hover:scale-110 transition-transform" />
          <span className="font-medium text-sm">Ambil Foto Selfie Sekarang (Kamera Depan)</span>
        </button>
      )}

      {loading && !isOpen && !photo && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-[#0f4372] font-semibold">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Sedang memproses foto...
        </div>
      )}

      {isOpen && (
        <div id={`camera-stream-box-${id}`} className="relative bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-700 max-w-md mx-auto">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white gap-2">
              <RefreshCw className="w-8 h-8 animate-spin text-[#F6b742]" />
              <p className="text-xs text-slate-400">Menyiapkan kamera depan...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-4 text-center text-white gap-3">
              <AlertTriangle className="w-10 h-10 text-[#e55541]" />
              <p className="text-sm font-medium">{error}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 bg-[#0f4372] text-white rounded-lg text-xs font-semibold hover:bg-opacity-95 cursor-pointer"
                >
                  Coba Lagi
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  Kembali
                </button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-auto bg-black aspect-video scale-x-[-1]" // mirror the video for comfortable selfie preview
          />

          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center">
            <button
              id={`btn-cancel-camera-${id}`}
              type="button"
              onClick={stopCamera}
              className="p-2.5 bg-slate-800 text-white rounded-full hover:bg-slate-700 transition-colors"
              title="Batal"
            >
              <X className="w-5 h-5" />
            </button>
            
            <button
              id={`btn-shutter-${id}`}
              type="button"
              onClick={capturePhoto}
              disabled={loading || !!error}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-[#e55541] hover:bg-opacity-95 text-white font-bold rounded-full shadow-lg transition-transform hover:scale-105 disabled:opacity-50 cursor-pointer text-sm"
            >
              <Camera className="w-4 h-4" />
              Ambil Foto
            </button>
            
            <div className="w-10" /> {/* Spacer */}
          </div>
        </div>
      )}

      {photo && (
        <div id={`captured-preview-box-${id}`} className="relative max-w-md mx-auto bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
          <img
            src={photo}
            alt="Captured Selfie"
            className="w-full h-auto aspect-video object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <span className="bg-[#83baa3] text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
              <CheckCircle className="w-3.5 h-3.5" />
              Terekam
            </span>
          </div>
          <div className="p-3 bg-white border-t border-slate-100 flex justify-between items-center">
            <span className="text-xs text-slate-500 font-mono">Foto terekam dengan watermark</span>
            <button
              id={`btn-retake-${id}`}
              type="button"
              onClick={onClear}
              className="text-xs text-[#0f4372] hover:text-[#e55541] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Hapus / Ganti Foto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
