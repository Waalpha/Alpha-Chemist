import React, { useEffect } from 'react';
import { AlertCircle, Plus, Search, X, Scan } from 'lucide-react';

interface UnknownBarcodeModalProps {
  isOpen: boolean;
  scannedBarcode: string;
  onClose: () => void;
  onAddNewProduct: (barcode: string) => void;
  onSearchManual: () => void;
}

export function UnknownBarcodeModal({
  isOpen,
  scannedBarcode,
  onClose,
  onAddNewProduct,
  onSearchManual
}: UnknownBarcodeModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Product Not Found</h3>
              <p className="text-xs text-gray-500">Unrecognized barcode scanned</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanned Barcode Display Box */}
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-center space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Scanned Barcode Value</p>
          <p className="text-xl font-mono font-extrabold text-amber-950 tracking-wider select-all">
            {scannedBarcode}
          </p>
          <p className="text-xs text-amber-700 pt-1">
            This code is not registered under your active tenant's inventory.
          </p>
        </div>

        {/* Action Choices */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={() => onAddNewProduct(scannedBarcode)}
            className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-3.5 px-4 text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add as New Product with This Barcode</span>
          </button>

          <button
            type="button"
            onClick={onSearchManual}
            className="w-full rounded-2xl bg-gray-100 hover:bg-gray-200 py-3 px-4 text-sm font-bold text-gray-800 active:scale-98 transition-all flex items-center justify-center space-x-2"
          >
            <Search className="w-4 h-4 text-gray-600" />
            <span>Search Inventory Catalog Manually</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border border-gray-200 hover:bg-gray-50 py-2.5 px-4 text-xs font-semibold text-gray-600 transition-all"
          >
            Cancel & Return to Scanner (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
