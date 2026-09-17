import React from 'react';
import { X, Printer } from 'lucide-react';
import { Product, BusinessConfig } from '../../types';

interface BarcodeLabelPrintModalProps {
  isOpen: boolean;
  product: Product;
  businessConfig?: BusinessConfig | null;
  onClose: () => void;
  onSwitchToBulkPrint: () => void;
}

export function BarcodeLabelPrintModal({ isOpen, product, onClose }: BarcodeLabelPrintModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-lg font-bold">Print Barcode Label: {product.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-2xl">
          <div className="font-mono text-lg font-bold">{product.barcode || 'NO-BARCODE'}</div>
          <div className="text-sm text-gray-600 mt-1">{product.name} - KSh {product.sellingPrice}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { window.print(); onClose(); }} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" /> Print Label
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border rounded-xl font-semibold">Close</button>
        </div>
      </div>
    </div>
  );
}
