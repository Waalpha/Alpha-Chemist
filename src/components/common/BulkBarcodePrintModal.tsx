import React, { useState, useMemo, useEffect } from 'react';
import { Product, BusinessConfig, Category } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { generateBarcodeSvgXml, getProductBarcode, cleanScannedBarcode } from '../../lib/barcodeUtils';
import { thermalPrinterService } from '../../printer/ThermalPrinterService';
import {
  Printer,
  X,
  Plus,
  Minus,
  Check,
  Tag,
  Search,
  Filter,
  Layers,
  Copy,
  Download,
  ExternalLink,
  Sliders,
  Eye,
  CheckSquare,
  Square,
  RefreshCw,
  Sparkles,
  FileText,
  AlertCircle,
  Smartphone,
  Bluetooth,
  Maximize2,
  Minimize2,
  CheckCircle2
} from 'lucide-react';

export type BarcodeLayoutFormat =
  | 'a4-standard'   // 3 cols x 8 rows = 24 labels (68mm x 35mm)
  | 'a4-compact'    // 4 cols x 10 rows = 40 labels (48mm x 28mm)
  | 'a4-shelf'      // 2 cols x 7 rows = 14 labels (98mm x 38mm)
  | 'thermal-50x30' // 50mm x 30mm continuous roll
  | 'thermal-40x25';// 40mm x 25mm continuous roll

interface BulkBarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialSelectedIds?: string[];
  businessConfig?: BusinessConfig | null;
  categories?: Category[];
}

export function BulkBarcodePrintModal({
  isOpen,
  onClose,
  products,
  initialSelectedIds = [],
  businessConfig,
  categories = []
}: BulkBarcodePrintModalProps) {
  // Active view tab
  const [activeTab, setActiveTab] = useState<'preview' | 'selection'>('preview');

  // Fullscreen sheet mode inside modal
  const [isFullscreenSheet, setIsFullscreenSheet] = useState(false);

  // Search & Filter within modal
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Format selection
  const [layoutFormat, setLayoutFormat] = useState<BarcodeLayoutFormat>('a4-standard');

  // Display toggles
  const [showStoreName, setShowStoreName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showGeneric, setShowGeneric] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showRx, setShowRx] = useState(true);
  const [showUnitType, setShowUnitType] = useState(true);

  // Individual item copies & selection state map
  const [itemSelections, setItemSelections] = useState<
    Record<string, { enabled: boolean; copies: number }>
  >({});

  // Status feedback
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isPrintingThermal, setIsPrintingThermal] = useState(false);
  const [isOpeningTab, setIsOpeningTab] = useState(false);

  // Environment checks
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isMobileDevice =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Initialize selection state
  useEffect(() => {
    if (!isOpen) return;

    const initialMap: Record<string, { enabled: boolean; copies: number }> = {};
    const hasInitialSelected = initialSelectedIds.length > 0;
    const selectedSet = new Set(initialSelectedIds);

    products.forEach((p) => {
      initialMap[p.id] = {
        enabled: hasInitialSelected ? selectedSet.has(p.id) : true,
        copies: 1
      };
    });

    setItemSelections(initialMap);
    setActiveTab('preview');
    setIsFullscreenSheet(false);
  }, [isOpen, products, initialSelectedIds]);

  const currency = businessConfig?.currency || 'KSh';
  const businessName = businessConfig?.name || 'Alpha Chemist';

  // Filter products based on search & category
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const cleanQ = cleanScannedBarcode(searchQuery).toLowerCase();
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.genericName && p.genericName.toLowerCase().includes(q)) ||
        (p.barcode && (p.barcode.toLowerCase().includes(q) || (cleanQ && p.barcode.toLowerCase().includes(cleanQ)))) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [products, searchQuery, selectedCategory]);

  // Compute enabled items queue for printing
  const enabledItemsQueue = useMemo(() => {
    const queue: { product: Product; copies: number; barcode: string }[] = [];

    products.forEach((p) => {
      const sel = itemSelections[p.id];
      if (sel?.enabled && sel.copies > 0) {
        queue.push({
          product: p,
          copies: sel.copies,
          barcode: getProductBarcode(p)
        });
      }
    });

    return queue;
  }, [products, itemSelections]);

  // Total label count across all copies
  const totalLabelsCount = useMemo(() => {
    return enabledItemsQueue.reduce((sum, item) => sum + item.copies, 0);
  }, [enabledItemsQueue]);

  // Estimated sheets/pages
  const estimatedPages = useMemo(() => {
    if (layoutFormat === 'a4-standard') return Math.ceil(totalLabelsCount / 24) || 1;
    if (layoutFormat === 'a4-compact') return Math.ceil(totalLabelsCount / 40) || 1;
    if (layoutFormat === 'a4-shelf') return Math.ceil(totalLabelsCount / 14) || 1;
    return totalLabelsCount; // thermal is 1 label per page/cut
  }, [totalLabelsCount, layoutFormat]);

  // Flatten queue into individual label items for preview & print
  const flatLabelsList = useMemo(() => {
    const list: { product: Product; barcode: string; index: number }[] = [];
    let idx = 0;
    enabledItemsQueue.forEach((item) => {
      for (let i = 0; i < item.copies; i++) {
        list.push({ product: item.product, barcode: item.barcode, index: idx++ });
      }
    });
    return list;
  }, [enabledItemsQueue]);

  // Bulk actions on itemSelections
  const handleSelectAll = (enable: boolean) => {
    setItemSelections((prev) => {
      const updated = { ...prev };
      filteredProducts.forEach((p) => {
        if (updated[p.id]) {
          updated[p.id] = { ...updated[p.id], enabled: enable };
        } else {
          updated[p.id] = { enabled: enable, copies: 1 };
        }
      });
      return updated;
    });
  };

  const handleSetAllCopies = (copies: number) => {
    setItemSelections((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((id) => {
        updated[id] = { ...updated[id], copies: Math.max(1, copies) };
      });
      return updated;
    });
  };

  const handleSetStockCopies = () => {
    setItemSelections((prev) => {
      const updated = { ...prev };
      products.forEach((p) => {
        const stock = Math.max(1, p.currentStock || 1);
        if (updated[p.id]) {
          updated[p.id] = { ...updated[p.id], copies: stock };
        } else {
          updated[p.id] = { enabled: true, copies: stock };
        }
      });
      return updated;
    });
    showToast('Quantities set to match each medicine’s current stock level!', 'info');
  };

  const handleToggleItem = (productId: string) => {
    setItemSelections((prev) => {
      const cur = prev[productId] || { enabled: true, copies: 1 };
      return {
        ...prev,
        [productId]: { ...cur, enabled: !cur.enabled }
      };
    });
  };

  const handleUpdateItemCopies = (productId: string, copies: number) => {
    setItemSelections((prev) => {
      const cur = prev[productId] || { enabled: true, copies: 1 };
      return {
        ...prev,
        [productId]: { ...cur, copies: Math.max(1, copies) }
      };
    });
  };

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 4500);
  };

  // Generate clean standalone printable HTML content with EMBEDDED vector SVGs (zero CDN dependencies)
  const generatePrintableHtml = () => {
    const isThermal = layoutFormat.startsWith('thermal');
    const isCompact = layoutFormat === 'a4-compact';
    const isShelf = layoutFormat === 'a4-shelf';

    let itemWidth = '68mm';
    let itemHeight = '34mm';
    let barcodeH = 34;
    let gridCols = 'repeat(3, 68mm)';
    let pageCss = '@page { size: A4 portrait; margin: 5mm; }';

    if (isCompact) {
      itemWidth = '48mm';
      itemHeight = '27mm';
      barcodeH = 26;
      gridCols = 'repeat(4, 48mm)';
      pageCss = '@page { size: A4 portrait; margin: 4mm; }';
    } else if (isShelf) {
      itemWidth = '98mm';
      itemHeight = '38mm';
      barcodeH = 38;
      gridCols = 'repeat(2, 98mm)';
      pageCss = '@page { size: A4 portrait; margin: 5mm; }';
    } else if (layoutFormat === 'thermal-50x30') {
      itemWidth = '50mm';
      itemHeight = '30mm';
      barcodeH = 32;
      gridCols = '1fr';
      pageCss = '@page { size: 50mm 30mm; margin: 1mm; }';
    } else if (layoutFormat === 'thermal-40x25') {
      itemWidth = '40mm';
      itemHeight = '25mm';
      barcodeH = 26;
      gridCols = '1fr';
      pageCss = '@page { size: 40mm 25mm; margin: 1mm; }';
    }

    // Build item cards with pre-rendered SVG vectors
    const itemsHtml = flatLabelsList
      .map((item) => {
        const p = item.product;
        const svgXml = generateBarcodeSvgXml(item.barcode, {
          height: barcodeH,
          width: isCompact ? 1.3 : 1.5,
          fontSize: 9
        });

        return `
        <div class="label-card">
          ${
            showStoreName
              ? `<div class="store-hdr">${businessName}</div>`
              : ''
          }
          ${
            showProductName
              ? `<div class="prod-title">${p.name}</div>`
              : ''
          }
          ${
            showGeneric && p.genericName
              ? `<div class="generic-sub">${p.genericName}${p.dosage ? ` • ${p.dosage}` : ''}</div>`
              : ''
          }
          <div class="barcode-box">
            ${svgXml || `<div style="font-family:monospace;font-size:9px;font-weight:bold;">${item.barcode}</div>`}
          </div>
          ${
            showPrice || showRx || showUnitType
              ? `
            <div class="price-row">
              ${
                showPrice
                  ? `<div class="price-txt">${currency} ${p.sellingPrice.toLocaleString()}</div>`
                  : '<div></div>'
              }
              <div class="badges">
                ${showRx && p.prescriptionRequired ? `<span class="rx-pill">Rx</span>` : ''}
                ${showUnitType && p.unitType ? `<span class="unit-txt">${p.unitType}</span>` : ''}
              </div>
            </div>`
              : ''
          }
        </div>
      `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Print Barcodes (${flatLabelsList.length}) - ${businessName}</title>
  <style>
    ${pageCss}
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #000000;
      padding: 0;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      background: #0f172a;
      color: white;
      padding: 12px 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      z-index: 9999;
    }
    .store-badge {
      display: inline-block;
      background: #047857;
      color: white;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
      margin-right: 8px;
    }
    .toolbar-info {
      font-size: 13px;
      font-weight: 600;
    }
    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn-print {
      background: #059669;
      color: #ffffff;
      border: none;
      padding: 10px 22px;
      border-radius: 10px;
      font-weight: 800;
      font-size: 15px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(5, 150, 105, 0.4);
      transition: all 0.2s;
    }
    .btn-print:active {
      transform: scale(0.97);
    }
    .btn-secondary {
      background: #334155;
      color: white;
      border: 1px solid #475569;
      padding: 9px 15px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-close {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      padding: 9px 14px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .mobile-tip {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 8px 14px;
      font-size: 12px;
      color: #1e3a8a;
      margin: 8px 12px;
      border-radius: 4px;
    }
    .labels-sheet-wrapper {
      padding: 8mm 6mm;
      display: flex;
      justify-content: center;
    }
    .labels-grid {
      display: grid;
      grid-template-columns: ${gridCols};
      gap: 3mm;
      justify-content: start;
    }
    .label-card {
      width: ${itemWidth};
      height: ${itemHeight};
      border: 1px dashed #cbd5e1;
      padding: 1.6mm 2mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background: #ffffff;
      page-break-inside: avoid;
      break-inside: avoid;
      border-radius: 3px;
      box-sizing: border-box;
    }
    .store-hdr {
      font-size: 7.5pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #334155;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      line-height: 1.1;
    }
    .prod-title {
      font-size: 8.5pt;
      font-weight: 800;
      color: #000000;
      line-height: 1.15;
      max-height: 5.5mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    }
    .generic-sub {
      font-size: 7pt;
      font-weight: 600;
      font-style: italic;
      color: #475569;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      line-height: 1;
    }
    .barcode-box {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 1;
      max-height: 14mm;
      overflow: hidden;
    }
    .barcode-box svg {
      width: 100%;
      max-height: ${barcodeH}px;
      display: block;
    }
    .price-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 1px;
      border-top: 0.5px solid #e2e8f0;
      line-height: 1;
    }
    .price-txt {
      font-size: 10pt;
      font-weight: 900;
      color: #047857;
      letter-spacing: -0.2px;
    }
    .badges {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .rx-pill {
      font-size: 6.5pt;
      font-weight: 900;
      text-transform: uppercase;
      background: #fee2e2;
      color: #991b1b;
      border: 0.5px solid #f87171;
      padding: 0.5px 3px;
      border-radius: 2px;
    }
    .unit-txt {
      font-size: 7pt;
      color: #64748b;
      font-weight: 600;
    }
    @media print {
      .print-toolbar, .mobile-tip {
        display: none !important;
      }
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .labels-sheet-wrapper {
        padding: 0 !important;
      }
      .label-card {
        border: 1px dotted #ccc !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-shadow: none !important;
      }
      ${
        isThermal
          ? `
        .labels-grid {
          display: block !important;
          gap: 0 !important;
        }
        .label-card {
          border: none !important;
          page-break-after: always !important;
          break-after: page !important;
        }
      `
          : ''
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <div class="toolbar-info">
      <span class="store-badge">Alpha Chemist</span>
      <strong>Barcode Label Print Sheet</strong> (${flatLabelsList.length} stickers)
    </div>
    <div class="toolbar-actions">
      <button class="btn-print" onclick="window.print()">
        🖨️ TAP TO PRINT / SAVE PDF
      </button>
      <button class="btn-secondary" onclick="saveAsHtml()">
        ⬇️ Save File
      </button>
      <button class="btn-close" onclick="window.close()">
        ✕ Close
      </button>
    </div>
  </div>

  <div class="mobile-tip">
    💡 <strong>Tip for Phones & Tablets:</strong> Tap the green button above to trigger Android/iOS Print. In the print preview, you can select your physical printer or choose <em>"Save as PDF"</em>.
  </div>

  <div class="labels-sheet-wrapper">
    <div class="labels-grid">
      ${itemsHtml}
    </div>
  </div>

  <script>
    function saveAsHtml() {
      var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'alpha-chemist-barcodes-' + new Date().toISOString().split('T')[0] + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    // Automatically trigger print dialog on non-mobile devices or after short user settle
    window.addEventListener('DOMContentLoaded', function() {
      if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        setTimeout(function() {
          try { window.print(); } catch(e) {}
        }, 350);
      }
    });
  </script>
</body>
</html>`;
  };

  // Primary Action: Open Dedicated Printable Sheet Tab (bypasses iframe restrictions on mobile)
  const handleOpenPrintPage = () => {
    if (flatLabelsList.length === 0) {
      alert('Please select at least one medicine with copies > 0 to print barcodes.');
      return;
    }

    setIsOpeningTab(true);
    const html = generatePrintableHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    // Attempt 1: window.open
    const newWin = window.open(blobUrl, '_blank');

    // Attempt 2: fallback anchor click if popup blocked
    if (!newWin) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    showToast('Opened printable sheet in a new tab! Tap "Print" or "Save as PDF" in the new tab.', 'success');
    setIsOpeningTab(false);
  };

  // Action: In-Page Direct Print Attempt (with hidden iframe fallback)
  const handleDirectPrint = () => {
    if (flatLabelsList.length === 0) {
      alert('Please select at least one medicine with copies > 0 to print barcodes.');
      return;
    }

    if (isInIframe || isMobileDevice) {
      // In mobile iframe context, window.print() is blocked by Android/Chrome security.
      // Automatically route to top-level tab so printing works reliably.
      handleOpenPrintPage();
      return;
    }

    // On standard desktop browser:
    try {
      const html = generatePrintableHtml();
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        iframe.contentWindow?.focus();
        setTimeout(() => {
          try {
            iframe.contentWindow?.print();
          } catch (e) {
            window.print();
          }
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 2000);
        }, 300);
      } else {
        window.print();
      }
    } catch (e) {
      window.print();
    }
  };

  // Action: Print via Bluetooth / USB Thermal Printer (Direct ESC/POS Barcode commands)
  const handlePrintViaThermalPrinter = async () => {
    if (flatLabelsList.length === 0) return;

    try {
      setIsPrintingThermal(true);
      const itemsPayload = enabledItemsQueue.map((item) => ({
        name: item.product.name,
        genericName: item.product.genericName,
        price: item.product.sellingPrice,
        barcode: item.barcode,
        copies: item.copies,
        rx: item.product.prescriptionRequired
      }));

      // Check connection
      const state = thermalPrinterService.getState();
      if (state.status !== 'connected') {
        showToast('Connecting to Bluetooth Thermal Printer...', 'info');
        try {
          const device = await thermalPrinterService.requestDevice('bluetooth');
          await thermalPrinterService.connect(device);
        } catch (connectErr: any) {
          showToast(`Printer connection cancelled or failed: ${connectErr.message}`, 'error');
          setIsPrintingThermal(false);
          return;
        }
      }

      showToast(`Sending ${totalLabelsCount} barcode labels to thermal printer...`, 'info');
      await thermalPrinterService.printBarcodeLabels(itemsPayload, businessConfig);
      showToast(`Successfully printed ${totalLabelsCount} barcode stickers!`, 'success');
    } catch (err: any) {
      showToast(`Thermal printer error: ${err.message || 'Print failed'}`, 'error');
    } finally {
      setIsPrintingThermal(false);
    }
  };

  // Action: Download Standalone HTML Print File
  const handleDownloadHtml = () => {
    if (flatLabelsList.length === 0) return;
    const html = generatePrintableHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alphachemist-barcodes-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded standalone printable HTML sheet!', 'success');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 
        =========================================================
        OFF-SCREEN MEDIA-PRINT TARGETED CONTAINER
        (Rendered off-screen with valid layout geometry so SVGs are never blank)
        =========================================================
      */}
      <div
        id="bulk-barcode-print-container"
        className="bulk-barcode-print-sheet"
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          width: '210mm',
          pointerEvents: 'none',
          opacity: 0
        }}
      >
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns:
              layoutFormat === 'a4-compact'
                ? 'repeat(4, 1fr)'
                : layoutFormat === 'a4-shelf'
                ? 'repeat(2, 1fr)'
                : layoutFormat.startsWith('thermal')
                ? '1fr'
                : 'repeat(3, 1fr)'
          }}
        >
          {flatLabelsList.map((item, i) => {
            const p = item.product;
            const svgXml = generateBarcodeSvgXml(item.barcode, {
              height: layoutFormat === 'a4-compact' ? 26 : 34,
              width: 1.4,
              fontSize: 9
            });
            return (
              <div
                key={`print-sheet-${i}`}
                className="bulk-barcode-label-item border border-dashed border-gray-400 p-2 bg-white flex flex-col justify-between"
                style={{
                  height:
                    layoutFormat === 'a4-compact'
                      ? '27mm'
                      : layoutFormat === 'a4-shelf'
                      ? '38mm'
                      : layoutFormat === 'thermal-50x30'
                      ? '30mm'
                      : layoutFormat === 'thermal-40x25'
                      ? '25mm'
                      : '34mm'
                }}
              >
                {showStoreName && (
                  <div className="text-[10px] font-black uppercase text-center text-gray-700 tracking-wider">
                    {businessName}
                  </div>
                )}
                {showProductName && (
                  <div className="text-xs font-bold text-center text-gray-900 truncate">
                    {p.name}
                  </div>
                )}
                {showGeneric && p.genericName && (
                  <div className="text-[9px] italic text-center text-gray-600 truncate">
                    {p.genericName}
                    {p.dosage ? ` • ${p.dosage}` : ''}
                  </div>
                )}
                <div
                  className="my-0.5 flex justify-center items-center [&_svg]:max-w-full [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: svgXml }}
                />
                {(showPrice || showRx || showUnitType) && (
                  <div className="flex items-center justify-between border-t border-gray-200 pt-0.5 text-[10px]">
                    {showPrice && (
                      <span className="font-extrabold text-emerald-800 text-xs">
                        {currency} {p.sellingPrice.toLocaleString()}
                      </span>
                    )}
                    <div className="flex items-center space-x-1">
                      {showRx && p.prescriptionRequired && (
                        <span className="bg-red-100 text-red-800 font-bold px-1 rounded text-[8px]">
                          Rx
                        </span>
                      )}
                      {showUnitType && p.unitType && (
                        <span className="text-gray-500 font-medium text-[9px]">{p.unitType}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 
        =========================================================
        MAIN MODAL UI
        =========================================================
      */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-xs">
        <div className="w-full max-w-5xl rounded-3xl bg-white shadow-2xl flex flex-col max-h-[96dvh] overflow-hidden border border-slate-200">
          
          {/* Header */}
          <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                    Batch Barcode Label Printing Studio
                  </h3>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                    {products.length} In Catalog
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Print shelf price tags, adhesive barcode stickers, and inventory labels for all chemist medicines
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setIsFullscreenSheet(!isFullscreenSheet)}
                className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title={isFullscreenSheet ? 'Standard View' : 'Fullscreen Sheet View'}
              >
                {isFullscreenSheet ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Toast Notification */}
          {statusMsg && (
            <div
              className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : statusMsg.type === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{statusMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusMsg(null)}
                className="text-slate-500 hover:text-slate-800 text-xs ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Mobile / Iframe Warning & Quick-Launch Helper */}
          {(isInIframe || isMobileDevice) && (
            <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Mobile / Preview Mode:</strong> Direct browser dialogs are restricted inside preview frames. Tap <strong>Open Printable Sheet</strong> to launch Android's native Print & Save-to-PDF dialog!
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenPrintPage}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 flex items-center space-x-1 cursor-pointer self-start sm:self-auto shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Printable Page</span>
              </button>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
            <div className="flex items-center space-x-4">
              <div>
                <span className="text-slate-500">Medicines Selected:</span>{' '}
                <span className="font-extrabold text-slate-800">
                  {enabledItemsQueue.length}{' '}
                  <span className="text-slate-400 font-normal">/ {products.length}</span>
                </span>
              </div>
              <div className="h-3.5 w-px bg-slate-300" />
              <div>
                <span className="text-slate-500">Total Sticker Labels:</span>{' '}
                <span className="font-extrabold text-emerald-700">{totalLabelsCount}</span>
              </div>
              <div className="h-3.5 w-px bg-slate-300 hidden sm:block" />
              <div className="hidden sm:block">
                <span className="text-slate-500">Estimated Pages:</span>{' '}
                <span className="font-extrabold text-blue-700">
                  {layoutFormat.startsWith('thermal') ? `${totalLabelsCount} labels` : `${estimatedPages} sheets`}
                </span>
              </div>
            </div>

            {/* View Tab Switcher */}
            <div className="flex items-center space-x-1 bg-slate-200/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeTab === 'preview'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Live Sheet Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('selection')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeTab === 'selection'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Select & Adjust Copies ({enabledItemsQueue.length})</span>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            
            {/* Control Panel: Formats & Options (Collapsible or visible) */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-4">
              
              {/* Paper Layout Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Printer & Paper Format
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {layoutFormat === 'a4-standard' && '24 stickers per A4 sheet (3x8)'}
                    {layoutFormat === 'a4-compact' && '40 stickers per A4 sheet (4x10)'}
                    {layoutFormat === 'a4-shelf' && '14 large price tags per A4 sheet (2x7)'}
                    {layoutFormat === 'thermal-50x30' && '50x30mm thermal roll printer'}
                    {layoutFormat === 'thermal-40x25' && '40x25mm compact vial roll'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => setLayoutFormat('a4-standard')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      layoutFormat === 'a4-standard'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">A4 Standard (24 / p)</div>
                    <div className="text-[10px] text-slate-500">3×8 grid (68×35mm)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLayoutFormat('a4-compact')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      layoutFormat === 'a4-compact'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">A4 Compact (40 / p)</div>
                    <div className="text-[10px] text-slate-500">4×10 grid (48×28mm)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLayoutFormat('a4-shelf')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      layoutFormat === 'a4-shelf'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">Shelf Talkers (14 / p)</div>
                    <div className="text-[10px] text-slate-500">2×7 large (98×38mm)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLayoutFormat('thermal-50x30')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      layoutFormat === 'thermal-50x30'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">Thermal 50×30mm</div>
                    <div className="text-[10px] text-slate-500">Roll printer sticker</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLayoutFormat('thermal-40x25')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      layoutFormat === 'thermal-40x25'
                        ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">Thermal 40×25mm</div>
                    <div className="text-[10px] text-slate-500">Compact vial roll</div>
                  </button>
                </div>
              </div>

              {/* Quantity Strategy Presets & Element Toggles */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-slate-200/80">
                
                {/* Quantity Strategy */}
                <div className="lg:col-span-6 space-y-2">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Label Copies Strategy
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetAllCopies(1)}
                      className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-left text-xs text-slate-800 transition-all cursor-pointer"
                    >
                      <div className="font-bold">1 Label per Item</div>
                      <div className="text-[10px] text-slate-500">Shelf price tags</div>
                    </button>

                    <button
                      type="button"
                      onClick={handleSetStockCopies}
                      className="p-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-left text-xs text-teal-900 transition-all cursor-pointer"
                    >
                      <div className="font-bold text-teal-800">Match Current Stock</div>
                      <div className="text-[10px] text-teal-600">Stock = copies</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetAllCopies(2)}
                      className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-left text-xs text-slate-800 transition-all cursor-pointer"
                    >
                      <div className="font-bold">2 Copies Each</div>
                      <div className="text-[10px] text-slate-500">Front & back</div>
                    </button>
                  </div>
                </div>

                {/* Display Toggles */}
                <div className="lg:col-span-6 space-y-2">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Label Elements To Print
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showStoreName}
                        onChange={(e) => setShowStoreName(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Store Name</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showProductName}
                        onChange={(e) => setShowProductName(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Medicine Title</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showGeneric}
                        onChange={(e) => setShowGeneric(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Generic & Dosage</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showPrice}
                        onChange={(e) => setShowPrice(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Selling Price</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showRx}
                        onChange={(e) => setShowRx(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Rx Indicator</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showUnitType}
                        onChange={(e) => setShowUnitType(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Package Unit</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* TAB 1: LIVE SHEET PREVIEW */}
            {activeTab === 'preview' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-sm font-extrabold text-slate-800 flex items-center space-x-2">
                    <Eye className="w-4 h-4 text-emerald-600" />
                    <span>Real-Time Label Preview ({flatLabelsList.length} stickers)</span>
                  </h4>
                  <div className="text-xs text-slate-500 flex items-center space-x-2">
                    <span>Showing vector barcode layout</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('selection')}
                      className="text-emerald-700 font-bold hover:underline"
                    >
                      Adjust copies or filter items →
                    </button>
                  </div>
                </div>

                {flatLabelsList.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 space-y-3">
                    <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-700">No medicines selected for printing</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      All items are currently unselected or set to 0 copies. Select medicines from the list tab to generate labels.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSelectAll(true)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 cursor-pointer shadow-xs"
                    >
                      Select All Medicines
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-3xl p-4 sm:p-6 bg-slate-100/70 max-h-[500px] overflow-y-auto">
                    <div
                      className="grid gap-3 mx-auto"
                      style={{
                        gridTemplateColumns:
                          layoutFormat === 'a4-compact'
                            ? 'repeat(auto-fill, minmax(180px, 1fr))'
                            : layoutFormat === 'a4-shelf'
                            ? 'repeat(auto-fill, minmax(280px, 1fr))'
                            : layoutFormat.startsWith('thermal')
                            ? 'repeat(auto-fill, minmax(220px, 1fr))'
                            : 'repeat(auto-fill, minmax(220px, 1fr))'
                      }}
                    >
                      {flatLabelsList.map((item, idx) => {
                        const p = item.product;
                        const svgXml = generateBarcodeSvgXml(item.barcode, {
                          height: layoutFormat === 'a4-compact' ? 26 : 34,
                          width: 1.4,
                          fontSize: 9
                        });

                        return (
                          <div
                            key={`preview-card-${idx}`}
                            className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between space-y-2 relative"
                          >
                            <span className="absolute top-1 right-1 text-[8px] font-mono text-slate-400 bg-slate-100 px-1 rounded">
                              #{idx + 1}
                            </span>

                            {showStoreName && (
                              <div className="text-[10px] font-black uppercase text-center text-slate-500 tracking-wider">
                                {businessName}
                              </div>
                            )}

                            {showProductName && (
                              <div className="text-xs font-extrabold text-slate-900 text-center line-clamp-1">
                                {p.name}
                              </div>
                            )}

                            {showGeneric && p.genericName && (
                              <div className="text-[10px] italic text-slate-500 text-center truncate">
                                {p.genericName}
                                {p.dosage ? ` • ${p.dosage}` : ''}
                              </div>
                            )}

                            <div
                              className="py-1 flex justify-center items-center [&_svg]:max-w-full [&_svg]:h-auto"
                              dangerouslySetInnerHTML={{ __html: svgXml }}
                            />

                            {(showPrice || showRx || showUnitType) && (
                              <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-xs">
                                {showPrice && (
                                  <span className="font-extrabold text-emerald-700">
                                    {currency} {p.sellingPrice.toLocaleString()}
                                  </span>
                                )}
                                <div className="flex items-center space-x-1">
                                  {showRx && p.prescriptionRequired && (
                                    <span className="bg-red-50 text-red-700 border border-red-200 font-bold px-1 rounded text-[8px]">
                                      Rx
                                    </span>
                                  )}
                                  {showUnitType && p.unitType && (
                                    <span className="text-slate-400 text-[9px] font-medium">
                                      {p.unitType}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SELECTION & ADJUST COPIES TABLE */}
            {activeTab === 'selection' && (
              <div className="space-y-4">
                
                {/* Search & Category Filter Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search medicines by name, generic compound, barcode..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white text-slate-700 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="all">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAll(true)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      Select Filtered
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAll(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* Table of Medicines */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-xs border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider z-10">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <span className="sr-only">Select</span>
                        </th>
                        <th className="p-3">Medicine & Details</th>
                        <th className="p-3">Barcode</th>
                        <th className="p-3 text-right">Price</th>
                        <th className="p-3 text-right">Stock</th>
                        <th className="p-3 text-center w-36">Label Copies</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map((p) => {
                        const sel = itemSelections[p.id] || { enabled: false, copies: 1 };
                        const barcode = getProductBarcode(p);

                        return (
                          <tr
                            key={p.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              sel.enabled ? 'bg-emerald-50/30' : 'opacity-60 bg-white'
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={sel.enabled}
                                onChange={() => handleToggleItem(p.id)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{p.name}</div>
                              <div className="text-[11px] text-slate-500 flex items-center space-x-2">
                                {p.genericName && <span>{p.genericName}</span>}
                                {p.dosage && <span>• {p.dosage}</span>}
                                {p.prescriptionRequired && (
                                  <span className="bg-red-100 text-red-700 px-1 rounded text-[8px] font-bold">
                                    Rx
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-600">
                              {barcode}
                            </td>
                            <td className="p-3 text-right font-bold text-emerald-800">
                              {currency} {p.sellingPrice.toLocaleString()}
                            </td>
                            <td className="p-3 text-right font-medium text-slate-600">
                              {p.currentStock ?? 0}
                            </td>
                            <td className="p-3 text-center">
                              <div className="inline-flex items-center space-x-1.5 bg-white border border-slate-200 rounded-lg p-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemCopies(p.id, sel.copies - 1)}
                                  disabled={sel.copies <= 1}
                                  className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-8 text-center font-extrabold text-slate-800 text-xs">
                                  {sel.copies}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemCopies(p.id, sel.copies + 1)}
                                  className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            
            {/* Left helper actions */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={flatLabelsList.length === 0}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                title="Download self-contained offline HTML print sheet"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Save HTML File</span>
              </button>

              <button
                type="button"
                onClick={handlePrintViaThermalPrinter}
                disabled={flatLabelsList.length === 0 || isPrintingThermal}
                className="px-3.5 py-2.5 rounded-xl border border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-900 text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                title="Send barcode ESC/POS commands directly to Bluetooth / USB thermal printer"
              >
                <Bluetooth className="w-3.5 h-3.5 text-cyan-600" />
                <span>{isPrintingThermal ? 'Printing...' : 'Thermal (Bluetooth)'}</span>
              </button>
            </div>

            {/* Right main actions */}
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>

              {/* Top-Level Open & Print Button (Guaranteed to work on Android/iOS & Preview Frames) */}
              <button
                type="button"
                onClick={handleOpenPrintPage}
                disabled={flatLabelsList.length === 0 || isOpeningTab}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md hover:shadow-lg active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {isOpeningTab
                    ? 'Opening Sheet...'
                    : `Print All Barcodes (${totalLabelsCount})`}
                </span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
