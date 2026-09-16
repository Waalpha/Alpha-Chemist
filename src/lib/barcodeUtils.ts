import { Product } from '../types';
import JsBarcode from 'jsbarcode';

/**
 * Calculates official EAN-13 Modulo-10 checksum digit
 */
export function calculateEan13CheckDigit(digits12: string): number {
  if (digits12.length !== 12 || !/^\d+$/.test(digits12)) {
    throw new Error('EAN-13 requires exactly 12 numeric digits to calculate checksum');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits12[i], 10);
    sum += i % 2 === 0 ? digit * 1 : digit * 3;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates whether an EAN-13 barcode has 13 numeric digits and a valid checksum
 */
export function isValidEan13(barcode: string): boolean {
  const clean = barcode.trim();
  if (clean.length !== 13 || !/^\d{13}$/.test(clean)) return false;
  const digits12 = clean.slice(0, 12);
  const actualCheck = parseInt(clean[12], 10);
  return calculateEan13CheckDigit(digits12) === actualCheck;
}

/**
 * Calculates official UPC-A Modulo-10 checksum digit
 */
export function calculateUpcACheckDigit(digits11: string): number {
  if (digits11.length !== 11 || !/^\d+$/.test(digits11)) {
    throw new Error('UPC-A requires exactly 11 numeric digits to calculate checksum');
  }
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(digits11[i], 10);
    sum += i % 2 === 0 ? digit * 3 : digit * 1;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates whether a UPC-A barcode has 12 numeric digits and a valid checksum
 */
export function isValidUpcA(barcode: string): boolean {
  const clean = barcode.trim();
  if (clean.length !== 12 || !/^\d{12}$/.test(clean)) return false;
  const digits11 = clean.slice(0, 11);
  const actualCheck = parseInt(clean[11], 10);
  return calculateUpcACheckDigit(digits11) === actualCheck;
}

/**
 * Validates whether a barcode is supported for Code 128 (ASCII characters 32-126)
 */
export function isValidCode128(barcode: string): boolean {
  const clean = barcode.trim();
  if (clean.length < 1 || clean.length > 80) return false;
  // ASCII printable characters 32-126
  return /^[\x20-\x7E]+$/.test(clean);
}

export type BarcodeFormat = 'CODE128' | 'EAN-13' | 'UPC-A';

/**
 * Generates a valid unique barcode according to requested format
 */
export function generateBarcode(format: BarcodeFormat = 'CODE128'): string {
  // Use current timestamp suffix + random seed to guarantee uniqueness
  const timestamp = Date.now().toString();
  const seed = Math.floor(1000 + Math.random() * 9000).toString();

  if (format === 'EAN-13') {
    // Prefix 200 is internationally reserved for in-store retail internal items
    // Format: 200 (3 digits) + 9 digits + 1 check digit = 13 digits
    const middle9 = (timestamp.slice(-5) + seed).slice(0, 9).padStart(9, '0');
    const digits12 = '200' + middle9;
    const checkDigit = calculateEan13CheckDigit(digits12);
    return digits12 + checkDigit.toString();
  }

  if (format === 'UPC-A') {
    // Prefix 02 is reserved for in-store variable weight & retail
    // Format: 02 (2 digits) + 9 digits + 1 check digit = 12 digits
    const middle9 = (timestamp.slice(-5) + seed).slice(0, 9).padStart(9, '0');
    const digits11 = '02' + middle9;
    const checkDigit = calculateUpcACheckDigit(digits11);
    return digits11 + checkDigit.toString();
  }

  // Default: CODE 128
  // Standard 12-digit internal retail code (e.g. 200000123456)
  const digits = '20' + timestamp.slice(-6) + seed;
  return digits.slice(0, 12);
}

/**
 * Detects the best matching barcode format for a given barcode string
 */
export function detectBarcodeFormat(barcode: string): BarcodeFormat {
  const clean = barcode.trim();
  if (isValidEan13(clean)) return 'EAN-13';
  if (isValidUpcA(clean)) return 'UPC-A';
  return 'CODE128';
}

/**
 * Returns product's configured barcode or falls back to product id
 */
export function getProductBarcode(product: Product): string {
  if (product.barcode && product.barcode.trim()) {
    return product.barcode.trim();
  }
  return product.id;
}


/**
 * Sanitizes and normalizes barcode strings received from physical USB/Bluetooth
 * scanners, camera decoders (Html5Qrcode/ZXing), and keyboard wedge inputs.
 *
 * Removes:
 * 1. ISO/IEC 15424 AIM Symbology Identifiers:
 *    `]C1` (Code 128 / GS1-128)
 *    `]C0`, `]C2`, `]C4` (Code 128)
 *    `]E0`, `]E1`, `]E2`, `]E3`, `]E4`, `]e0` (EAN-13, EAN-8, UPC-A, UPC-E)
 *    `]A0`, `]A1` (Code 39)
 *    `]I0` (Interleaved 2 of 5)
 *    `]d1`, `]Q1` (Data Matrix, QR Code)
 * 2. ESC/POS Code-Set selectors from thermal prints:
 *    `{B`, `{A`, `{C`, `{1`
 * 3. Surrounding framing brackets/braces/quotes:
 *    `{...}`, `[...]`, `(...)`, `"..."`, `'...'`
 * 4. Single-letter hardware scanner prefixes (e.g. `B616110002044` -> `616110002044`)
 * 5. Non-printable ASCII control characters.
 */
export function cleanScannedBarcode(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();

  // Strip non-printable ASCII control characters (\x00-\x1F, \x7F-\x9F)
  s = s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();

  // Strip ISO/IEC 15424 AIM Symbology Identifiers:
  // Starts with ']' followed by a letter and optional digit/letter (e.g. ]C1, ]C0, ]E0, ]A0, ]d1, ]Q1)
  s = s.replace(/^\][a-zA-Z][0-9a-zA-Z]?/g, '').trim();

  // Strip ESC/POS thermal printer code set prefix if printed literally (e.g. {B, {A, {C)
  s = s.replace(/^\{[a-zA-Z]/g, '').trim();

  // Strip surrounding braces, brackets, quotes, and parentheses
  s = s.replace(/^[{[("'<]+|[}\])"'>]+$/g, '').trim();

  // Handle any remaining framing characters
  s = s.replace(/^[{[\]}]+|[\]}[{]+$/g, '').trim();

  // If scanner prepended a single prefix letter like 'B' or 'C' before 8-14 numeric digits (e.g. B616110002044)
  if (/^[a-zA-Z]\d{8,14}$/.test(s)) {
    s = s.slice(1);
  }

  return s.trim();
}

/**
 * Generates an array of normalized search candidates for barcode lookup in inventory.
 */
export function getBarcodeLookupCandidates(rawQuery: string): string[] {
  if (!rawQuery) return [];
  const raw = rawQuery.trim();
  if (!raw) return [];

  const candidates = new Set<string>();

  // 1. Primary: Thoroughly cleaned barcode
  const clean = cleanScannedBarcode(raw);
  if (clean) {
    candidates.add(clean.toLowerCase());
  }

  // 2. Raw query (case-insensitive)
  candidates.add(raw.toLowerCase());

  // 3. If query contains ]C1 or {B, explicitly add the substring after it
  const matchAim = raw.match(/^\][a-zA-Z][0-9a-zA-Z]?(.*)$/);
  if (matchAim && matchAim[1]) {
    candidates.add(matchAim[1].trim().toLowerCase());
  }
  const matchEscPos = raw.match(/^\{[a-zA-Z0-9](.*)$/);
  if (matchEscPos && matchEscPos[1]) {
    candidates.add(matchEscPos[1].trim().toLowerCase());
  }

  // 4. UPC-A / EAN-13 padding conversions (12 vs 13 digits)
  if (/^\d{12}$/.test(clean)) {
    // 12-digit code: also test with leading '0' as 13-digit EAN-13
    candidates.add('0' + clean);
  } else if (/^0\d{12}$/.test(clean)) {
    // 13-digit code starting with 0: also test without leading '0' as 12-digit UPC-A
    candidates.add(clean.slice(1));
  }

  return Array.from(candidates).filter(c => c.length > 0);
}

/**
 * Searches a tenant's product list for an exact match on barcode or fallback product ID.
 * Strict multi-tenant isolation: only checks the provided tenant products array.
 */
export function findProductByBarcode(products: Product[], rawQuery: string): Product | null {
  if (!rawQuery) return null;
  const candidates = getBarcodeLookupCandidates(rawQuery);
  if (candidates.length === 0) return null;

  for (const q of candidates) {
    // 1. Primary: match on barcode field
    const byBarcode = products.find(p => p.barcode && p.barcode.trim().toLowerCase() === q);
    if (byBarcode) return byBarcode;

    // 2. Secondary fallback: match on product ID (allows scanning internal product ID labels)
    const byId = products.find(p => p.id.trim().toLowerCase() === q);
    if (byId) return byId;
  }

  return null;
}

/**
 * Checks if a barcode is already used by another product within the tenant.
 */
export function isBarcodeDuplicate(products: Product[], barcode: string, excludeProductId?: string): boolean {
  if (!barcode) return false;
  const clean = (cleanScannedBarcode(barcode) || barcode.trim()).toLowerCase();
  return products.some(p => {
    if (excludeProductId && p.id === excludeProductId) return false;
    const pClean = p.barcode ? (cleanScannedBarcode(p.barcode) || p.barcode.trim()).toLowerCase() : '';
    return pClean === clean;
  });
}

/**
 * Web Audio API scanner feedback sound (crisp 880Hz retail beep)
 */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    return null;
  }
}

export function playScanSuccessSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, ctx.currentTime); // Crisp retail scanner tone
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.07);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);

    // Optional haptic vibration for mobile scanners
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(40);
    }
  } catch (e) {
    // Audio feedback is non-critical
  }
}

export function playScanErrorSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.setValueAtTime(180, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([60, 40, 60]);
    }
  } catch (e) {
    // Audio feedback is non-critical
  }
}

export interface BarcodeSvgOptions {
  width?: number;
  height?: number;
  fontSize?: number;
  displayValue?: boolean;
  margin?: number;
  textMargin?: number;
  background?: string;
  lineColor?: string;
}

/**
 * Generates pure SVG XML string with embedded barcode vectors.
 * Completely offline, zero external CDN scripts needed, works synchronously in any DOM or HTML export.
 */
export function generateBarcodeSvgXml(value: string, options?: BarcodeSvgOptions): string {
  if (typeof document === 'undefined') return '';
  const clean = (value || '').trim();
  if (!clean) return '';

  const detected = detectBarcodeFormat(clean);
  const fmt = detected === 'EAN-13' ? 'EAN13' : detected === 'UPC-A' ? 'UPC' : 'CODE128';

  try {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, clean, {
      format: fmt,
      width: options?.width || 1.6,
      height: options?.height || 36,
      displayValue: options?.displayValue !== false,
      fontSize: options?.fontSize || 10,
      textMargin: options?.textMargin ?? 1,
      margin: options?.margin ?? 2,
      font: 'monospace',
      background: options?.background || '#ffffff',
      lineColor: options?.lineColor || '#000000',
      valid: (isValid) => {
        if (!isValid && fmt !== 'CODE128') {
          try {
            JsBarcode(svgNode, clean, {
              format: 'CODE128',
              width: options?.width || 1.4,
              height: options?.height || 36,
              displayValue: options?.displayValue !== false,
              fontSize: options?.fontSize || 10,
              textMargin: options?.textMargin ?? 1,
              margin: options?.margin ?? 2
            });
          } catch (e) {}
        }
      }
    });
    return new XMLSerializer().serializeToString(svgNode);
  } catch (err) {
    try {
      const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgNode, clean, {
        format: 'CODE128',
        width: options?.width || 1.4,
        height: options?.height || 36,
        displayValue: options?.displayValue !== false,
        fontSize: options?.fontSize || 10,
        textMargin: options?.textMargin ?? 1,
        margin: options?.margin ?? 2
      });
      return new XMLSerializer().serializeToString(svgNode);
    } catch (e2) {
      return '';
    }
  }
}

