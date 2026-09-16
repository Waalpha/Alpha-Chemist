import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Volume2, ShieldAlert, Upload, Image as ImageIcon, RotateCcw, AlertTriangle, CheckCircle2, Zap, ZapOff } from 'lucide-react';
import { playScanSuccessSound, playScanErrorSound, cleanScannedBarcode } from '../../lib/barcodeUtils';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

type CameraErrorType = 'BUSY' | 'PERMISSION' | 'NOT_FOUND' | 'GENERIC' | null;

export function CameraBarcodeScannerModal({
  isOpen,
  onClose,
  onScan
}: CameraBarcodeScannerModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraErrorType, setCameraErrorType] = useState<CameraErrorType>(null);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isFileScanning, setIsFileScanning] = useState(false);
  const [fileScanError, setFileScanError] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(true);
  const containerId = 'barcode-camera-viewport';

  // Helper to safely stop any active video scanner
  const stopScanner = async () => {
    try {
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch (e) {
      // Ignore scanner stop warning
    }
    setIsScanning(false);
    setIsTorchOn(false);
    setIsTorchSupported(false);
  };

  const startScannerWithFallback = async (preferredCameraId?: string) => {
    setCameraError(null);
    setCameraErrorType(null);
    setFileScanError(null);
    setIsStarting(true);

    // Stop any existing scanner before starting fresh
    await stopScanner();

    // Check browser support
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera video streaming is not supported by your current browser or connection.');
      setCameraErrorType('GENERIC');
      setIsStarting(false);
      return;
    }

    // Wait a brief tick for the container DOM element to be in the DOM
    await new Promise(resolve => setTimeout(resolve, 150));
    if (!isMountedRef.current) return;

    // Verify container DOM element exists
    const container = document.getElementById(containerId);
    if (!container) {
      setIsStarting(false);
      return;
    }

    const formats = [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODABAR,
      Html5QrcodeSupportedFormats.DATA_MATRIX
    ];

    const scanner = new Html5Qrcode(containerId, {
      formatsToSupport: formats,
      verbose: false
    });
    html5QrCodeRef.current = scanner;

    // Scan configuration (DO NOT force rigid aspectRatio to prevent OverconstrainedError / NotReadableError)
    const scanConfig = {
      fps: 15,
      qrbox: { width: 280, height: 170 }
    };

    const handleSuccess = (decodedText: string) => {
      playScanSuccessSound();
      stopScanner();
      const clean = cleanScannedBarcode(decodedText) || decodedText.trim();
      onScan(clean);
    };

    // Strategies to attempt in order
    // 1. Preferred camera ID (if specified) or 'environment' (back camera for barcodes)
    // 2. 'user' (front camera / laptop webcam)
    // 3. Any available video track
    const strategies: Array<{ name: string; camera: any; config?: any }> = [];

    if (preferredCameraId) {
      strategies.push({ name: 'selected-id', camera: preferredCameraId, config: scanConfig });
    }

    strategies.push(
      { name: 'environment', camera: { facingMode: 'environment' }, config: scanConfig },
      { name: 'user', camera: { facingMode: 'user' }, config: scanConfig },
      { name: 'generic', camera: { facingMode: { ideal: 'environment' } }, config: scanConfig }
    );

    let started = false;
    let lastError: any = null;

    for (const strat of strategies) {
      if (!isMountedRef.current) return;
      try {
        await scanner.start(strat.camera, strat.config || scanConfig, handleSuccess, () => {});
        started = true;
        break;
      } catch (err: any) {
        lastError = err;
        // Continue to next fallback strategy
      }
    }

    if (!isMountedRef.current) return;

    if (started) {
      setIsScanning(true);
      setIsStarting(false);
      setCameraError(null);

      // Check if torch/flashlight is supported on this active track
      try {
        const capabilities = scanner.getRunningTrackCameraCapabilities();
        if (capabilities && typeof capabilities.torchFeature === 'function' && capabilities.torchFeature().isSupported()) {
          setIsTorchSupported(true);
        }
      } catch {
        setIsTorchSupported(false);
      }

      // Safely enumerate available camera devices for the "Switch Camera" option
      // Using enumerateDevices() which does not call getUserMedia and won't lock the hardware
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices
          .filter(d => d.kind === 'videoinput')
          .map((d, index) => ({
            id: d.deviceId || `camera-${index}`,
            label: d.label || `Camera ${index + 1}`
          }));
        if (isMountedRef.current) {
          setAvailableCameras(videoInputs);
        }
      } catch {
        // Safe to ignore device enumeration failure
      }
    } else {
      setIsScanning(false);
      setIsStarting(false);

      const errMsg = String(lastError?.message || lastError || '');
      const errName = String(lastError?.name || '');

      if (
        errName === 'NotReadableError' ||
        errMsg.toLowerCase().includes('could not start video source') ||
        errMsg.toLowerCase().includes('device in use') ||
        errMsg.toLowerCase().includes('source error') ||
        errMsg.toLowerCase().includes('hardware')
      ) {
        setCameraErrorType('BUSY');
        setCameraError('Camera is busy or in use. Another application (such as Zoom, Teams, Google Meet, or another browser tab) may have an exclusive lock on your camera.');
      } else if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('denied')
      ) {
        setCameraErrorType('PERMISSION');
        setCameraError('Camera permission was blocked. Please allow camera access in your browser or device settings to scan live barcodes.');
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errMsg.toLowerCase().includes('no camera') ||
        errMsg.toLowerCase().includes('not found')
      ) {
        setCameraErrorType('NOT_FOUND');
        setCameraError('No video camera was detected on this device. You can still scan by uploading or taking a photo of the barcode.');
      } else {
        setCameraErrorType('GENERIC');
        setCameraError(errMsg || 'Could not connect to video camera. Please verify your camera connection or snap a barcode photo.');
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      startScannerWithFallback();
    } else {
      stopScanner();
    }

    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [isOpen]);

  // Handle camera switching
  const handleSwitchCamera = async () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    setSelectedCameraId(nextCam.id);
    await startScannerWithFallback(nextCam.id);
  };

  // Toggle Torch/Flashlight
  const handleToggleTorch = async () => {
    if (!html5QrCodeRef.current || !isTorchSupported) return;
    try {
      const nextState = !isTorchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }] as any
      });
      setIsTorchOn(nextState);
    } catch (e) {
      console.warn('Torch toggle not supported on this device/track', e);
    }
  };

  // Barcode decoding from an uploaded / captured photo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileScanning(true);
    setFileScanError(null);

    try {
      // Ensure live camera scanner is stopped before scanning a file
      await stopScanner();

      // Create a dedicated scanner instance for file decoding
      const tempScanner = new Html5Qrcode('barcode-camera-file-scanner-temp', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });

      const decodedText = await tempScanner.scanFile(file, false);
      tempScanner.clear();

      if (decodedText) {
        playScanSuccessSound();
        const clean = cleanScannedBarcode(decodedText) || decodedText.trim();
        onScan(clean);
      } else {
        playScanErrorSound();
        setFileScanError('No barcode recognized in this photo. Please try a clearer, brighter photo directly facing the barcode lines.');
      }
    } catch (err: any) {
      playScanErrorSound();
      setFileScanError('Could not detect a clear barcode in this photo. Please ensure good lighting and hold the camera steady.');
    } finally {
      setIsFileScanning(false);
      // Reset input value so same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Keyboard shortcut: ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopScanner();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150">
      {/* Hidden file scanner container for file-based decoding */}
      <div id="barcode-camera-file-scanner-temp" className="hidden" />

      {/* Hidden file input supporting native device camera snap on mobile (capture="environment") */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />

      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 text-white p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">Barcode Scanner</h3>
                {isScanning && (
                  <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Live</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Point at any medicine EAN-13, Code 128, or UPC barcode</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close scanner (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Scanning Loader */}
        {isFileScanning && (
          <div className="p-4 bg-emerald-950/40 border border-emerald-600/40 rounded-2xl flex items-center space-x-3 text-emerald-300">
            <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs font-medium">Analyzing photo for barcode...</span>
          </div>
        )}

        {/* File Scan Error Feedback */}
        {fileScanError && (
          <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-xl flex items-start space-x-2.5 text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-amber-300">Photo Scan Notice</p>
              <p className="text-amber-200/90">{fileScanError}</p>
            </div>
          </div>
        )}

        {/* Camera Starting State */}
        {isStarting && !cameraError && (
          <div className="relative aspect-4/3 rounded-2xl bg-slate-950 flex flex-col items-center justify-center border border-slate-800 p-6 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-300 font-medium">Connecting to camera...</p>
          </div>
        )}

        {/* Error Notice with Contextual Action Cards */}
        {cameraError && (
          <div className="p-5 bg-slate-950/90 border border-slate-800 rounded-2xl text-center space-y-3.5">
            {cameraErrorType === 'PERMISSION' ? (
              <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
            ) : cameraErrorType === 'BUSY' ? (
              <RotateCcw className="w-10 h-10 text-emerald-400 mx-auto" />
            ) : (
              <Camera className="w-10 h-10 text-slate-400 mx-auto" />
            )}

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-100">
                {cameraErrorType === 'BUSY'
                  ? 'Camera Busy or In Use'
                  : cameraErrorType === 'PERMISSION'
                  ? 'Camera Permission Needed'
                  : cameraErrorType === 'NOT_FOUND'
                  ? 'No Camera Detected'
                  : 'Camera Unavailable'}
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                {cameraError}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => startScannerWithFallback()}
                className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all flex items-center justify-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry Camera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs transition-all flex items-center justify-center space-x-1.5 border border-slate-700 active:scale-95 cursor-pointer"
                title="Snap or upload a photo of the barcode"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Snap / Upload Photo</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="text-xs text-slate-400 hover:text-slate-200 underline pt-1 inline-block"
            >
              Or switch to USB scanner / manual barcode input
            </button>
          </div>
        )}

        {/* Live Camera Viewport Container (always present in DOM so Html5Qrcode can bind) */}
        <div className={`relative overflow-hidden rounded-2xl bg-black aspect-4/3 flex items-center justify-center border border-slate-800 ${cameraError || isStarting ? 'hidden' : 'block'}`}>
          <div id={containerId} className="w-full h-full" />

          {/* Scanning Target Reticle & Laser */}
          {isScanning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-40 border-2 border-emerald-400/80 rounded-xl shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                {/* Target Corners */}
                <span className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm" />
                <span className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm" />
                <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm" />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br-sm" />

                {/* Animated Red Laser Scanline */}
                <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" style={{ top: '50%' }} />
              </div>
            </div>
          )}

          {/* Floating Action Buttons over Viewport */}
          {isScanning && (
            <div className="absolute top-3 right-3 flex items-center space-x-2">
              {isTorchSupported && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`p-2 rounded-xl backdrop-blur-md transition-all shadow-md ${
                    isTorchOn ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                  title={isTorchOn ? 'Turn Off Flashlight' : 'Turn On Flashlight'}
                >
                  {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center space-x-2">
            {availableCameras.length > 1 && !cameraError && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-all flex items-center space-x-1.5 cursor-pointer border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Switch Camera</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-all flex items-center space-x-1.5 cursor-pointer border border-slate-700"
              title="Upload an image or take a photo with your device camera"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Photo Scan</span>
            </button>
          </div>

          <div className="flex items-center space-x-3 ml-auto">
            <div className="text-[11px] text-slate-400 flex items-center space-x-1">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Audio Beep</span>
            </div>

            <button
              type="button"
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700"
            >
              Close (ESC)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

