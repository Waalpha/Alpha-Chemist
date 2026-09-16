import { Sale, BusinessConfig } from '../types';
import { formatCurrency } from '../lib/utils';

// ESC/POS Command Constants
const ESC = '\x1b';
const GS = '\x1d';

const CMD_INIT = ESC + '@';
const CMD_ALIGN_LEFT = ESC + 'a' + '\x00';
const CMD_ALIGN_CENTER = ESC + 'a' + '\x01';
const CMD_ALIGN_RIGHT = ESC + 'a' + '\x02';
const CMD_BOLD_ON = ESC + 'E' + '\x01';
const CMD_BOLD_OFF = ESC + 'E' + '\x00';
const CMD_CUT = GS + 'V' + '\x41' + '\x00'; // Full cut with feed

export class EscPosFormatter {
  private buffer: number[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.buffer = [];
    this.addString(CMD_INIT);
  }

  public addString(str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.buffer.push(str.charCodeAt(i));
    }
  }

  public addLine(text = ''): void {
    this.addString(text + '\n');
  }

  public setAlignment(align: 'left' | 'center' | 'right'): void {
    if (align === 'left') this.addString(CMD_ALIGN_LEFT);
    else if (align === 'center') this.addString(CMD_ALIGN_CENTER);
    else if (align === 'right') this.addString(CMD_ALIGN_RIGHT);
  }

  public setBold(bold: boolean): void {
    if (bold) this.addString(CMD_BOLD_ON);
    else this.addString(CMD_BOLD_OFF);
  }

  public addSeparator(char = '-'): void {
    this.addLine(char.repeat(32)); // 32 chars width for 58mm thermal paper
  }

  public addBarcode(code: string, format: 'EAN13' | 'CODE128' = 'CODE128'): void {
    const clean = code.trim();
    if (!clean) return;

    // Set barcode height (50 dots)
    this.addString(GS + 'h' + String.fromCharCode(50));
    // Set barcode width (2)
    this.addString(GS + 'w' + String.fromCharCode(2));
    // Set HRI characters printing position: below barcode (2)
    this.addString(GS + 'H' + String.fromCharCode(2));

    const isEan = format === 'EAN13' || (clean.length === 13 && /^\d+$/.test(clean));

    if (isEan && clean.length >= 12 && /^\d+$/.test(clean)) {
      // ESC/POS EAN-13 (Function B: m=67, n=12 or 13)
      const eanData = clean.slice(0, 12);
      this.addString(GS + 'k' + String.fromCharCode(67) + String.fromCharCode(eanData.length) + eanData);
    } else {
      // ESC/POS CODE128 (Function B: m=73)
      // Standard ESC/POS specification requires starting with a code set selection character ({A, {B, or {C)
      const dataWithSet = clean.startsWith('{') ? clean : `{B${clean}`;
      this.addString(GS + 'k' + String.fromCharCode(73) + String.fromCharCode(dataWithSet.length) + dataWithSet);
    }
    this.addLine();
  }

  public cut(): void {
    this.addString('\n\n\n');
    this.addString(CMD_CUT);
  }

  public getData(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  public static formatSaleReceipt(sale: Sale, businessConfig?: BusinessConfig | null): Uint8Array {
    const formatter = new EscPosFormatter();
    const currency = businessConfig?.currency || 'KSh';
    const businessName = businessConfig?.name || 'ALPHA CHEMIST';
    const address = businessConfig?.address || 'Nairobi CBD';
    const phone = businessConfig?.phone || '+254 712 345 678';
    const footer = businessConfig?.receiptFooter || 'Thank you for choosing Alpha Chemist. Wish you quick recovery!';

    // Header
    formatter.setAlignment('center');
    formatter.setBold(true);
    formatter.addLine(businessName.toUpperCase());
    formatter.setBold(false);
    formatter.addLine(address);
    formatter.addLine(`Tel: ${phone}`);
    if (businessConfig?.tillNumber) {
      formatter.setBold(true);
      formatter.addLine(`TILL / PAYBILL: ${businessConfig.tillNumber}`);
      formatter.setBold(false);
    }
    formatter.addSeparator('=');

    // Meta
    formatter.setAlignment('left');
    formatter.addLine(`Receipt #: ${sale.id.slice(-8).toUpperCase()}`);
    formatter.addLine(`Date:     ${sale.date} ${sale.time}`);
    formatter.addLine(`Cashier:  ${sale.cashierName}`);
    formatter.addLine(`Payment:  ${sale.paymentMethod}`);
    if (sale.referenceCode) {
      formatter.addLine(`Ref Code: ${sale.referenceCode}`);
    }
    formatter.addSeparator('-');

    // Items Header
    formatter.addLine('ITEM             QTY  PRICE  TOTAL');
    formatter.addSeparator('-');

    // Items
    sale.items.forEach((item) => {
      const name = item.productName.padEnd(16).slice(0, 16);
      const qty = String(item.quantity).padStart(3);
      const price = String(item.unitPrice).padStart(6);
      const total = String(item.totalAmount).padStart(6);
      formatter.addLine(`${name} ${qty} ${price} ${total}`);
    });

    formatter.addSeparator('-');

    // Totals
    formatter.setAlignment('right');
    formatter.setBold(true);
    formatter.addLine(`TOTAL: ${formatCurrency(sale.totalAmount, currency)}`);
    formatter.setBold(false);

    if (sale.amountTendered !== undefined && sale.amountTendered > 0) {
      formatter.addLine(`Tendered: ${formatCurrency(sale.amountTendered, currency)}`);
    }
    if (sale.change !== undefined && sale.change > 0) {
      formatter.addLine(`Change:   ${formatCurrency(sale.change, currency)}`);
    }

    formatter.addSeparator('=');
    formatter.setAlignment('center');
    formatter.addLine(footer);
    formatter.addLine(`Printed: ${new Date().toLocaleTimeString()}`);

    formatter.cut();
    return formatter.getData();
  }

  public static formatTestReceipt(businessConfig?: BusinessConfig | null): Uint8Array {
    const formatter = new EscPosFormatter();
    const businessName = businessConfig?.name || 'ALPHA CHEMIST';

    formatter.setAlignment('center');
    formatter.setBold(true);
    formatter.addLine('*** USB/BLUETOOTH TEST ***');
    formatter.addLine(businessName.toUpperCase());
    formatter.setBold(false);
    formatter.addSeparator('=');
    formatter.setAlignment('left');
    formatter.addLine('Printer connected successfully!');
    formatter.addLine(`Time: ${new Date().toLocaleString()}`);
    formatter.addLine('58mm Thermal ESC/POS Driver OK.');
    formatter.addSeparator('=');
    formatter.setAlignment('center');
    formatter.addLine('Ready for POS Sales!');
    formatter.cut();
    return formatter.getData();
  }

  public static formatShiftClosingSummary(
    summary: {
      totalSales: number;
      cash: number;
      mpesa: number;
      card: number;
      other: number;
      transactions: number;
      itemsSold: number;
      cashierName: string;
      date: string;
      notes?: string;
    },
    businessConfig?: BusinessConfig | null
  ): Uint8Array {
    const formatter = new EscPosFormatter();
    const currency = businessConfig?.currency || 'KSh';
    const businessName = businessConfig?.name || 'ALPHA CHEMIST';
    const phone = businessConfig?.phone || '+254 712 345 678';

    formatter.setAlignment('center');
    formatter.setBold(true);
    formatter.addLine(businessName.toUpperCase());
    formatter.addLine('*** SHIFT CLOSING SUMMARY ***');
    formatter.addLine('(Z-REPORT)');
    formatter.setBold(false);
    formatter.addLine(`Tel: ${phone}`);
    formatter.addSeparator('=');

    formatter.setAlignment('left');
    formatter.addLine(`Date:     ${summary.date}`);
    formatter.addLine(`Printed:  ${new Date().toLocaleTimeString()}`);
    formatter.addLine(`Cashier:  ${summary.cashierName}`);
    formatter.addLine(`Orders:   ${summary.transactions}`);
    formatter.addLine(`Items:    ${summary.itemsSold}`);
    formatter.addSeparator('-');

    formatter.addLine('PAYMENT METHODS RECEIVED:');
    formatter.addLine(`Cash:     ${formatCurrency(summary.cash, currency)}`);
    formatter.addLine(`M-Pesa:   ${formatCurrency(summary.mpesa, currency)}`);
    formatter.addLine(`Card:     ${formatCurrency(summary.card, currency)}`);
    if (summary.other > 0) {
      formatter.addLine(`Other:    ${formatCurrency(summary.other, currency)}`);
    }
    formatter.addSeparator('=');

    formatter.setAlignment('right');
    formatter.setBold(true);
    formatter.addLine(`TOTAL SALES: ${formatCurrency(summary.totalSales, currency)}`);
    formatter.setBold(false);

    if (summary.notes && summary.notes.trim()) {
      formatter.setAlignment('left');
      formatter.addSeparator('-');
      formatter.addLine(`Notes: ${summary.notes.trim()}`);
    }

    formatter.addSeparator('-');
    formatter.setAlignment('center');
    formatter.addLine('End of Shift Report');
    formatter.addLine(`Printed: ${new Date().toLocaleString()}`);
    formatter.addLine('\nCashier Sig: ________________');
    formatter.addLine('\nManager Sig: ________________');
    formatter.cut();
    return formatter.getData();
  }

  public static formatBarcodeLabels(
    items: { name: string; genericName?: string; price: number; barcode: string; copies: number; rx?: boolean }[],
    businessConfig?: BusinessConfig | null
  ): Uint8Array {
    const formatter = new EscPosFormatter();
    const currency = businessConfig?.currency || 'KSh';
    const store = businessConfig?.name || 'ALPHA CHEMIST';

    items.forEach(item => {
      const count = Math.max(1, item.copies || 1);
      for (let c = 0; c < count; c++) {
        formatter.setAlignment('center');
        formatter.setBold(true);
        formatter.addLine(store.toUpperCase());
        formatter.addLine(item.name.slice(0, 24));
        formatter.setBold(false);
        if (item.genericName) {
          formatter.addLine(item.genericName.slice(0, 24));
        }
        const isEan = item.barcode.length === 13 && /^\d+$/.test(item.barcode);
        formatter.addBarcode(item.barcode, isEan ? 'EAN13' : 'CODE128');
        formatter.setBold(true);
        formatter.addLine(`${currency} ${item.price.toLocaleString()}${item.rx ? ' [Rx]' : ''}`);
        formatter.setBold(false);
        formatter.addSeparator('-');
        formatter.addLine();
      }
    });

    formatter.cut();
    return formatter.getData();
  }
}

