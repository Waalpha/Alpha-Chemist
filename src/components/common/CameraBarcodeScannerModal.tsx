import React from 'react';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function CameraBarcodeScannerModal({ isOpen, onClose }: CameraBarcodeScannerModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-3xl p-6 text-center space-y-4 max-w-sm w-full">
        <h3 className="text-lg font-bold">Camera Barcode Scanner</h3>
        <p className="text-sm text-gray-500">Camera scanning is currently unavailable in this preview environment.</p>
        <button onClick={onClose} className="w-full bg-slate-900 text-white py-2.5 rounded-xl font-bold">Close</button>
      </div>
    </div>
  );
}
