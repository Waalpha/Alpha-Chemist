import React from 'react';
import { X, Printer } from 'lucide-react';
import { Product, Category, BusinessConfig } from '../../types';

interface BulkBarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialSelectedIds: string[];
  categories: Category[];
  businessConfig?: BusinessConfig | null;
}

export function BulkBarcodePrintModal({ isOpen, onClose, products }: BulkBarcodePrintModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-lg font-bold">Bulk Barcode Print ({products.length} items)</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600">Ready to print barcode labels and shelf tags for selected catalog items.</p>
        <div className="flex gap-2">
          <button onClick={() => { window.print(); onClose(); }} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
            <Printer className="w-4 h-4" /> Print All
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border rounded-xl font-semibold">Close</button>
        </div>
      </div>
    </div>
  );
}
