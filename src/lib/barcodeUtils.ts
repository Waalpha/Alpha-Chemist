export function cleanScannedBarcode(code: string): string {
  return code ? code.trim() : '';
}

export function findProductByBarcode(products: any[], code: string): any {
  if (!code) return null;
  const target = code.trim().toLowerCase();
  return products.find(p => p.barcode && p.barcode.toLowerCase() === target) || null;
}

export function generateBarcode(format = 'EAN-13'): string {
  return '978' + Math.floor(100000000 + Math.random() * 900000000);
}

export function isBarcodeDuplicate(products: any[], barcode: string, excludeId?: string): boolean {
  if (!barcode) return false;
  return products.some(p => p.barcode === barcode && p.id !== excludeId);
}

export function detectBarcodeFormat(barcode: string): string {
  if (!barcode) return 'Unknown';
  if (barcode.length === 13) return 'EAN-13';
  if (barcode.length === 8) return 'EAN-8';
  return 'Code 128';
}

export function playScanSuccessSound() {}
export function playScanErrorSound() {}
