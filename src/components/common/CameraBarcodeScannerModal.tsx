import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, AlertCircle, Volume2, ShieldAlert } from 'lucide-react';
import { playScanSuccessSound, playScanErrorSound } from '../../lib/barcodeUtils';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function CameraBarcodeScannerModal({
  isOpen,
  onClose,
  onScan
}: CameraBarcodeScannerModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'barcode-camera-viewport';

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    let isMounted = true;

    async function startCameraScanner() {
      setCameraError(null);
      setIsScanning(true);

      try {
        // First check camera permissions and available video inputs
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (!devices || devices.length === 0) {
          setCameraError('No camera found on this device. Please connect a camera or use a USB barcode scanner.');
          setIsScanning(false);
          return;
        }

        setAvailableCameras(devices);

        // Find back/environment camera or default to first
        let cameraId = devices[0].id;
        const backCam = devices.find(
          d => d.label.toLowerCase().includes('back') ||
               d.label.toLowerCase().includes('rear') ||
               d.label.toLowerCase().includes('environment')
        );
        if (backCam) {
          cameraId = backCam.id;
        }
        setSelectedCameraId(cameraId);

        // Wait a tick for DOM element to be ready
        await new Promise(res => setTimeout(res, 150));
        if (!isMounted) return;

        const scanner = new Html5Qrcode(containerId);
        html5QrCodeRef.current = scanner;

        const config = {
          fps: 15,
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.3333,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        };

        await scanner.start(
          cameraId,
          config,
          (decodedText) => {
            // Successful scan
            playScanSuccessSound();
            stopScanner();
            onScan(decodedText.trim());
          },
          (errorMessage) => {
            // Frame analysis did not find barcode - normal, ignore
          }
        );

        if (isMounted) {
          setIsScanning(true);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Camera Scanner Error:', err);
        playScanErrorSound();
        if (err?.name === 'NotAllowedError' || err?.toString().includes('Permission denied')) {
          setCameraError('Camera access was denied. Please allow camera permissions in your browser settings to scan barcodes.');
        } else if (err?.name === 'NotFoundError' || err?.toString().includes('No camera')) {
          setCameraError('No camera detected on this device. You can still use USB/Bluetooth barcode scanners or manual entry.');
        } else {
          setCameraError(err?.message || 'Unable to access camera. Please check your camera connection.');
        }
        setIsScanning(false);
      }
    }

    startCameraScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

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
      console.warn('Error stopping scanner:', e);
    }
  };

  const handleSwitchCamera = async () => {
    if (availableCameras.length <= 1) return;
    await stopScanner();
    const currentIndex = availableCameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    setSelectedCameraId(nextCam.id);

    try {
      const scanner = new Html5Qrcode(containerId);
      html5QrCodeRef.current = scanner;
      await scanner.start(
        nextCam.id,
        {
          fps: 15,
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.3333
        },
        (decodedText) => {
          playScanSuccessSound();
          stopScanner();
          onScan(decodedText.trim());
        },
        () => {}
      );
    } catch (err: any) {
      setCameraError('Failed to switch camera: ' + (err.message || 'Unknown error'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl bg-gray-900 border border-gray-800 text-white p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Live Camera Barcode Scanner</h3>
              <p className="text-xs text-gray-400">Position barcode inside the green target box</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="rounded-xl p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Notice */}
        {cameraError ? (
          <div className="p-5 bg-red-900/40 border border-red-700/50 rounded-2xl text-center space-y-3">
            <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
            <h4 className="text-sm font-bold text-red-200">Camera Permission Required</h4>
            <p className="text-xs text-red-300 leading-relaxed">{cameraError}</p>
            <button
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold text-white transition-all"
            >
              Use Manual or USB Barcode Scanner
            </button>
          </div>
        ) : (
          /* Camera Viewport Container */
          <div className="relative overflow-hidden rounded-2xl bg-black aspect-4/3 flex items-center justify-center border border-gray-800">
            <div id={containerId} className="w-full h-full" />

            {/* Scanning Target Reticle */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-40 border-2 border-emerald-400/80 rounded-xl shadow-lg">
                {/* Target Corners */}
                <span className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm" />
                <span className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm" />
                <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm" />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br-sm" />

                {/* Animated Red Laser Scanline */}
                <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" style={{ top: '50%' }} />
              </div>
            </div>
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex items-center justify-between pt-1">
          {availableCameras.length > 1 && !cameraError && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-200 transition-all flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Switch Camera</span>
            </button>
          )}

          <div className="text-[11px] text-gray-400 flex items-center space-x-1">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Beeps on scan</span>
          </div>

          <button
            type="button"
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-bold text-gray-300 hover:text-white transition-all ml-auto"
          >
            Close (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
