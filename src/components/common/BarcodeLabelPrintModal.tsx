import React, { useState } from 'react';
import { Product, BusinessConfig } from '../../types';
import { BarcodeDisplay } from './BarcodeDisplay';
import { formatCurrency } from '../../lib/utils';
import { generateBarcodeSvgXml } from '../../lib/barcodeUtils';
import { thermalPrinterService } from '../../printer/ThermalPrinterService';
import { Printer, X, Plus, Minus, Check, Tag, ExternalLink, Bluetooth, Smartphone } from 'lucide-react';

interface BarcodeLabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  businessConfig?: BusinessConfig | null;
  onSwitchToBulkPrint?: () => void;
}

export function BarcodeLabelPrintModal({
  isOpen,
  onClose,
  product,
  businessConfig,
  onSwitchToBulkPrint
}: BarcodeLabelPrintModalProps) {
  const [copies, setCopies] = useState<number>(1);
  const [labelSize, setLabelSize] = useState<'standard' | 'compact' | 'jewelry'>('standard');
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen || !product) return null;

  const currency = businessConfig?.currency || 'KSh';
  const businessName = businessConfig?.name || 'Alpha Chemist';
  const barcodeValue = product.barcode || product.id;
  const [isPrintingThermal, setIsPrintingThermal] = useState(false);

  const handlePrint = () => {
    setIsPrinting(true);

    const svgXml = generateBarcodeSvgXml(barcodeValue, {
      height: labelSize === 'compact' ? 32 : labelSize === 'jewelry' ? 24 : 45,
      width: labelSize === 'compact' ? 1.4 : labelSize === 'jewelry' ? 1.1 : 1.8,
      fontSize: 10
    });

    const labelsHtml = Array.from({ length: copies })
      .map(
        () => `
        <div class="label-item">
          <div class="store-name">${businessName}</div>
          <div class="product-name">${product.name}</div>
          <div class="barcode-wrapper">
            ${svgXml || `<div style="font-family:monospace;font-size:10px;font-weight:bold;">${barcodeValue}</div>`}
          </div>
          <div class="price-tag">${currency} ${product.sellingPrice.toLocaleString()}</div>
        </div>
      `
      )
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Print Barcode Labels - ${product.name}</title>
    <style>
      @page {
        size: auto;
        margin: 4mm;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        margin: 0;
        padding: 0;
        color: #000000;
        background: #ffffff;
      }
      .toolbar {
        position: sticky;
        top: 0;
        background: #0f172a;
        color: white;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        z-index: 100;
      }
      .btn-print {
        background: #059669;
        color: white;
        border: none;
        padding: 8px 18px;
        border-radius: 8px;
        font-weight: 800;
        font-size: 14px;
        cursor: pointer;
      }
      .btn-close {
        background: #334155;
        color: white;
        border: none;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
      }
      .labels-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6mm;
        justify-content: flex-start;
        padding: 6mm;
      }
      .label-item {
        width: ${labelSize === 'compact' ? '40mm' : labelSize === 'jewelry' ? '30mm' : '50mm'};
        height: ${labelSize === 'compact' ? '25mm' : labelSize === 'jewelry' ? '20mm' : '32mm'};
        border: 1px dashed #ccc;
        box-sizing: border-box;
        padding: 2mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        text-align: center;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      @media print {
        .toolbar {
          display: none !important;
        }
        .labels-grid {
          padding: 0 !important;
        }
        .label-item {
          border: none !important;
          page-break-inside: avoid !important;
        }
        body {
          padding: 0 !important;
        }
      }
      .store-name {
        font-size: 8pt;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }
      .product-name {
        font-size: 9pt;
        font-weight: 700;
        max-height: 8mm;
        line-height: 1.1;
        overflow: hidden;
        width: 100%;
      }
      .barcode-wrapper {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .barcode-wrapper svg {
        width: 100%;
        max-height: ${labelSize === 'compact' ? '12mm' : '15mm'};
        display: block;
      }
      .price-tag {
        font-size: 11pt;
        font-weight: 800;
        letter-spacing: -0.2px;
        color: #047857;
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div style="font-size: 13px; font-weight: 600;">
        ${product.name} (${copies} ${copies === 1 ? 'label' : 'labels'})
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-print" onclick="window.print()">🖨️ Tap to Print</button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
      </div>
    </div>
    <div class="labels-grid">
      ${labelsHtml}
    </div>
    <script>
      window.addEventListener('DOMContentLoaded', function() {
        if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) {
          setTimeout(function() { window.print(); }, 300);
        }
      });
    </script>
  </body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const win = window.open(blobUrl, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    setIsPrinting(false);
  };

  const handlePrintBluetooth = async () => {
    if (!product) return;
    try {
      setIsPrintingThermal(true);
      await thermalPrinterService.printBarcodeLabels(
        [
          {
            name: product.name,
            genericName: product.genericName,
            price: product.sellingPrice,
            barcode: barcodeValue,
            copies: copies,
            rx: product.prescriptionRequired
          }
        ],
        businessConfig
      );
      alert(`Sent ${copies} label(s) to thermal printer!`);
    } catch (err: any) {
      alert(`Thermal printer error: ${err.message || 'Failed to print'}`);
    } finally {
      setIsPrintingThermal(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-6 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Print Barcode Labels</h3>
              <p className="text-xs text-gray-500">Retail shelf and product sticker labels</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Preview of Single Label */}
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">Live Label Preview</span>
          <div className="mx-auto w-72 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm text-center space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 truncate">
              {businessName}
            </p>
            <p className="text-sm font-black text-slate-900 truncate">
              {product.name}
            </p>
            <div className="py-1 flex justify-center bg-slate-50 rounded-xl p-2 border border-slate-200">
              <BarcodeDisplay
                value={barcodeValue}
                width={2.0}
                height={55}
                fontSize={14}
                className="w-full"
              />
            </div>
            <p className="text-lg font-black text-emerald-700">
              {formatCurrency(product.sellingPrice, currency)}
            </p>
          </div>
        </div>

        {/* Print Configuration */}
        <div className="space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Number of Labels:</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setCopies(Math.max(1, copies - 1))}
                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-95 transition-all shadow-xs"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                min="1"
                max="500"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 rounded-lg border border-gray-300 bg-white p-1.5 text-center text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setCopies(copies + 1)}
                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:scale-95 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">Presets:</span>
            {[1, 5, 10, 24, 50].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCopies(num)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  copies === num
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-500 pt-1 border-t border-gray-200/60 flex items-center justify-between">
            <span>Compatible with:</span>
            <span className="font-medium text-gray-700">50x30mm Thermal / A4 Sticker Sheets</span>
          </div>

          {onSwitchToBulkPrint && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToBulkPrint();
                }}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-bold hover:underline inline-flex items-center space-x-1 cursor-pointer"
              >
                <span>Need to print for all medicines? Open Bulk Barcode Studio →</span>
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Preparing Labels...' : `Print ${copies} ${copies === 1 ? 'Label' : 'Labels'}`}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </button>
            <button
              type="button"
              onClick={handlePrintBluetooth}
              disabled={isPrintingThermal}
              className="px-3 py-3 rounded-xl border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-900 font-bold text-xs flex items-center space-x-1 cursor-pointer"
              title="Print directly to Bluetooth / USB thermal sticker printer"
            >
              <Bluetooth className="w-4 h-4 text-cyan-600" />
              <span>{isPrintingThermal ? '...' : 'Thermal'}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-gray-300 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
