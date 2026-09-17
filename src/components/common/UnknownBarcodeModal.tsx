import React from 'react';

interface UnknownBarcodeModalProps {
  isOpen: boolean;
  scannedBarcode: string;
  onClose: () => void;
  onAddNewProduct: (barcode: string) => void;
  onSearchManual: () => void;
}

export function UnknownBarcodeModal({ isOpen, scannedBarcode, onClose, onSearchManual }: UnknownBarcodeModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-3xl p-6 text-center space-y-4 max-w-sm w-full">
        <h3 className="text-lg font-bold">Unknown Barcode</h3>
        <p className="text-sm text-gray-500">Barcode <span className="font-mono font-bold text-gray-800">{scannedBarcode}</span> was not found in catalog.</p>
        <button onClick={onSearchManual} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold">Search Manually</button>
        <button onClick={onClose} className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl font-bold">Cancel</button>
      </div>
    </div>
  );
}
