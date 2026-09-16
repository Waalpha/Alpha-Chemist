import React, { useState } from 'react';
import { BusinessConfig, UserProfile, Product } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { X, Printer, CheckCircle2, AlertCircle, FileText, Banknote, Smartphone, CreditCard, Layers, Calendar, User, Clock } from 'lucide-react';
import { thermalPrinterService } from '../../printer/ThermalPrinterService';

interface SalesSummaryData {
  totalSales: number;
  cash: number;
  mpesa: number;
  card: number;
  other: number;
  transactions: number;
  itemsSold: number;
}

interface DailyClosingPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesSummary: SalesSummaryData;
  products: Product[];
  actualCounts: Record<string, number>;
  notes?: string;
  user: UserProfile;
  businessConfig?: BusinessConfig | null;
  closingDate?: string;
}

export function DailyClosingPrintModal({
  isOpen,
  onClose,
  salesSummary,
  products,
  actualCounts,
  notes,
  user,
  businessConfig,
  closingDate
}: DailyClosingPrintModalProps) {
  const [printFormat, setPrintFormat] = useState<'thermal' | 'full'>('thermal');
  const [isPrintingThermal, setIsPrintingThermal] = useState(false);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [printerSuccess, setPrinterSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const currency = businessConfig?.currency || 'KSh';
  const businessName = businessConfig?.name || 'Alpha Chemist';
  const address = businessConfig?.address || 'Nairobi CBD';
  const phone = businessConfig?.phone || '+254 712 345 678';
  const displayDate = closingDate || new Date().toISOString().split('T')[0];
  const printTimestamp = new Date().toLocaleString();

  // Stock variances
  const variances = products.map(p => {
    const expected = p.currentStock;
    const actual = actualCounts[p.id] !== undefined ? actualCounts[p.id] : expected;
    const variance = actual - expected;
    return {
      name: p.name,
      expected,
      actual,
      variance,
      unitType: p.unitType || 'unit'
    };
  });

  const shortages = variances.filter(v => v.variance < 0);
  const overages = variances.filter(v => v.variance > 0);

  const handleBrowserPrint = () => {
    setPrinterError(null);
    setPrinterSuccess(null);
    window.print();
  };

  const handleDirectThermalPrint = async () => {
    setIsPrintingThermal(true);
    setPrinterError(null);
    setPrinterSuccess(null);

    try {
      const state = thermalPrinterService.getState();
      if (state.status !== 'connected') {
        await thermalPrinterService.connect();
      }

      await thermalPrinterService.printShiftSummary(
        {
          totalSales: salesSummary.totalSales,
          cash: salesSummary.cash,
          mpesa: salesSummary.mpesa,
          card: salesSummary.card,
          other: salesSummary.other,
          transactions: salesSummary.transactions,
          itemsSold: salesSummary.itemsSold,
          cashierName: user.name,
          date: displayDate,
          notes
        },
        businessConfig
      );

      setPrinterSuccess('Summary sent directly to thermal receipt printer!');
    } catch (err: any) {
      console.warn('Direct thermal print failed, falling back to browser print:', err);
      try {
        window.print();
        setPrinterSuccess('Opened browser print preview dialog.');
      } catch (e: any) {
        setPrinterError(err.message || 'Thermal printing failed');
      }
    } finally {
      setIsPrintingThermal(false);
    }
  };

  const cashPct = salesSummary.totalSales > 0 ? ((salesSummary.cash / salesSummary.totalSales) * 100).toFixed(1) : '0.0';
  const mpesaPct = salesSummary.totalSales > 0 ? ((salesSummary.mpesa / salesSummary.totalSales) * 100).toFixed(1) : '0.0';
  const cardPct = salesSummary.totalSales > 0 ? ((salesSummary.card / salesSummary.totalSales) * 100).toFixed(1) : '0.0';
  const otherPct = salesSummary.totalSales > 0 ? ((salesSummary.other / salesSummary.totalSales) * 100).toFixed(1) : '0.0';
  const avgBasket = salesSummary.transactions > 0 ? salesSummary.totalSales / salesSummary.transactions : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-slate-900 text-white rounded-t-3xl">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Print Shift Closing Summary</h3>
              <p className="text-xs text-slate-300">Daily sales, items sold, and payment methods received</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar (Format Selector & Quick Actions) */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setPrintFormat('thermal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                printFormat === 'thermal'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Thermal Roll (58/80mm)
            </button>
            <button
              type="button"
              onClick={() => setPrintFormat('full')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                printFormat === 'full'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Full Page (A4 / Letter)
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDirectThermalPrint}
              disabled={isPrintingThermal}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              title="Print directly to connected ESC/POS printer"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isPrintingThermal ? 'Printing...' : 'Direct Thermal'}</span>
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Summary</span>
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {printerSuccess && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{printerSuccess}</span>
          </div>
        )}
        {printerError && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{printerError}</span>
          </div>
        )}

        {/* Print-Friendly Document Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/60">
          {/* Printable Container */}
          <div
            className={`print-shift-summary mx-auto bg-white text-slate-950 transition-all ${
              printFormat === 'thermal'
                ? 'w-[80mm] max-w-[80mm] p-4 rounded-2xl shadow-md border-2 border-slate-400 font-mono text-xs leading-normal'
                : 'w-full max-w-xl p-8 rounded-3xl shadow-md border-2 border-slate-300 text-sm font-sans'
            }`}
          >
            {/* Header / Business Info */}
            <div className="text-center pb-3 border-b-2 border-dashed border-slate-900">
              <h2 className={`${printFormat === 'thermal' ? 'text-base font-black' : 'text-2xl font-black'} uppercase tracking-wider text-slate-950`}>
                {businessName}
              </h2>
              <p className="text-xs font-semibold text-slate-800">{address}</p>
              <p className="text-xs font-semibold text-slate-800">Tel: {phone}</p>
              {businessConfig?.tillNumber && (
                <p className="text-xs font-black text-slate-950 mt-0.5">TILL / PAYBILL: {businessConfig.tillNumber}</p>
              )}
              <div className="mt-2 py-1 px-2 bg-slate-950 text-white rounded font-black uppercase tracking-widest text-xs">
                SHIFT CLOSING SUMMARY (Z-REPORT)
              </div>
            </div>

            {/* Shift & Cashier Metadata */}
            <div className="py-2.5 border-b-2 border-dashed border-slate-700 text-xs space-y-1 text-slate-900">
              <div className="flex justify-between">
                <span className="font-bold text-slate-700">Shift Date:</span>
                <span className="font-black text-slate-950">{displayDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-700">Printed At:</span>
                <span className="font-semibold text-slate-900">{printTimestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-700">Cashier:</span>
                <span className="font-black text-slate-950">{user.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-700">Cashier ID:</span>
                <span className="font-mono font-bold text-slate-900">{user.uid.slice(0, 10)}</span>
              </div>
            </div>

            {/* Primary KPI Summary Cards */}
            <div className="py-3 border-b-2 border-dashed border-slate-900">
              <div className="text-center mb-2">
                <span className="text-xs uppercase font-extrabold text-slate-700">Total Gross Sales</span>
                <div className={`${printFormat === 'thermal' ? 'text-2xl font-black' : 'text-4xl font-black'} text-slate-950 tracking-tight`}>
                  {formatCurrency(salesSummary.totalSales, currency)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-dotted border-slate-400 text-center">
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-300">
                  <span className="block text-[11px] uppercase text-slate-700 font-extrabold">Total Items Sold</span>
                  <span className="text-base font-black text-slate-950">{salesSummary.itemsSold}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl border border-slate-300">
                  <span className="block text-[11px] uppercase text-slate-700 font-extrabold">Transactions</span>
                  <span className="text-base font-black text-slate-950">{salesSummary.transactions}</span>
                </div>
              </div>

              {salesSummary.transactions > 0 && (
                <div className="flex justify-between text-xs text-slate-800 mt-2 px-1 font-semibold">
                  <span>Average Sale / Ticket:</span>
                  <span className="font-black text-slate-950">{formatCurrency(avgBasket, currency)}</span>
                </div>
              )}
            </div>

            {/* Payment Methods Breakdown */}
            <div className="py-3 border-b-2 border-dashed border-slate-900">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-950">Payment Methods Received</span>
                <span className="text-xs font-bold text-slate-700">Share %</span>
              </div>

              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-900 text-slate-800 text-xs">
                    <th className="pb-1 font-black">Method</th>
                    <th className="pb-1 text-right font-black">Amount</th>
                    <th className="pb-1 text-right font-black">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dotted divide-slate-300">
                  <tr>
                    <td className="py-1.5 flex items-center space-x-1.5 font-bold text-slate-950">
                      <Banknote className="w-4 h-4 text-slate-800" />
                      <span>Cash</span>
                    </td>
                    <td className="py-1.5 text-right font-black text-slate-950">{formatCurrency(salesSummary.cash, currency)}</td>
                    <td className="py-1.5 text-right text-slate-800 font-mono font-bold text-xs">{cashPct}%</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 flex items-center space-x-1.5 font-bold text-slate-950">
                      <Smartphone className="w-4 h-4 text-slate-800" />
                      <span>M-Pesa</span>
                    </td>
                    <td className="py-1.5 text-right font-black text-slate-950">{formatCurrency(salesSummary.mpesa, currency)}</td>
                    <td className="py-1.5 text-right text-slate-800 font-mono font-bold text-xs">{mpesaPct}%</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 flex items-center space-x-1.5 font-bold text-slate-950">
                      <CreditCard className="w-4 h-4 text-slate-800" />
                      <span>Card</span>
                    </td>
                    <td className="py-1.5 text-right font-black text-slate-950">{formatCurrency(salesSummary.card, currency)}</td>
                    <td className="py-1.5 text-right text-slate-800 font-mono font-bold text-xs">{cardPct}%</td>
                  </tr>
                  {salesSummary.other > 0 && (
                    <tr>
                      <td className="py-1.5 flex items-center space-x-1.5 font-bold text-slate-950">
                        <Layers className="w-4 h-4 text-slate-800" />
                        <span>Other / Credit</span>
                      </td>
                      <td className="py-1.5 text-right font-black text-slate-950">{formatCurrency(salesSummary.other, currency)}</td>
                      <td className="py-1.5 text-right text-slate-800 font-mono font-bold text-xs">{otherPct}%</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-950 text-xs font-black text-slate-950">
                    <td className="pt-2">TOTAL PAYMENTS:</td>
                    <td className="pt-2 text-right font-black">
                      {formatCurrency(salesSummary.cash + salesSummary.mpesa + salesSummary.card + salesSummary.other, currency)}
                    </td>
                    <td className="pt-2 text-right font-mono font-black text-xs">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Inventory Discrepancies (if any) */}
            {(shortages.length > 0 || overages.length > 0) && (
              <div className="py-2.5 border-b border-dashed border-gray-600 text-[10px]">
                <span className="font-bold uppercase tracking-wider block mb-1">
                  Stock Reconciliation Discrepancies
                </span>
                {shortages.map((s, idx) => (
                  <div key={idx} className="flex justify-between py-0.5 text-red-700 font-semibold">
                    <span className="truncate max-w-[150px]">Short: {s.name}</span>
                    <span>{s.variance} {s.unitType} (Exp: {s.expected}, Act: {s.actual})</span>
                  </div>
                ))}
                {overages.map((o, idx) => (
                  <div key={idx} className="flex justify-between py-0.5 text-blue-800 font-semibold">
                    <span className="truncate max-w-[150px]">Over: {o.name}</span>
                    <span>+{o.variance} {o.unitType} (Exp: {o.expected}, Act: {o.actual})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Notes Section */}
            {notes && notes.trim() && (
              <div className="py-2 border-b border-dashed border-gray-600 text-[10px]">
                <span className="font-bold text-gray-600 uppercase block mb-0.5">Shift Notes / Remarks:</span>
                <p className="italic text-gray-800 whitespace-pre-wrap">{notes}</p>
              </div>
            )}

            {/* Signatures & Footer */}
            <div className="pt-4 text-[10px] space-y-4">
              <div className="flex justify-between gap-4 pt-2">
                <div className="flex-1 text-center border-t border-gray-400 pt-1">
                  <p className="font-bold">Cashier Signature</p>
                  <p className="text-[9px] text-gray-500">{user.name}</p>
                </div>
                <div className="flex-1 text-center border-t border-gray-400 pt-1">
                  <p className="font-bold">Manager Signature</p>
                  <p className="text-[9px] text-gray-500">Verified & Approved</p>
                </div>
              </div>

              <div className="text-center text-[9px] text-gray-500 border-t border-dashed border-gray-300 pt-2">
                <p>*** DAVETECH ERP POS • ALPHA CHEMIST ***</p>
                <p>Retain this summary slip for daily auditing and accounting.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between rounded-b-3xl">
          <p className="text-xs text-gray-500 hidden sm:block">
            Prints high-contrast thermal slips or full A4 reports with zero browser clutter.
          </p>
          <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Summary</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
