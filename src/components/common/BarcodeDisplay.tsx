import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { detectBarcodeFormat, BarcodeFormat } from '../../lib/barcodeUtils';

interface BarcodeDisplayProps {
  value: string;
  format?: BarcodeFormat | 'AUTO';
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}

export function BarcodeDisplay({
  value,
  format = 'AUTO',
  width = 2.0,
  height = 65,
  displayValue = true,
  fontSize = 15,
  className = ''
}: BarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) {
      setRenderError('No barcode value provided');
      return;
    }

    try {
      const cleanValue = value.trim();
      let chosenFormat: string = format;

      if (format === 'AUTO') {
        const detected = detectBarcodeFormat(cleanValue);
        chosenFormat = detected === 'EAN-13' ? 'EAN13' : detected === 'UPC-A' ? 'UPC' : 'CODE128';
      } else if (format === 'EAN-13') {
        chosenFormat = 'EAN13';
      } else if (format === 'UPC-A') {
        chosenFormat = 'UPC';
      } else {
        chosenFormat = 'CODE128';
      }

      // Render barcode using JsBarcode
      JsBarcode(svgRef.current, cleanValue, {
        format: chosenFormat,
        width,
        height,
        displayValue,
        fontSize,
        textMargin: 4,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000',
        font: 'JetBrains Mono, monospace',
        valid: (isValid: boolean) => {
          if (!isValid) {
            // Fallback to CODE128 if EAN/UPC was mathematically invalid for the string
            if (chosenFormat !== 'CODE128' && svgRef.current) {
              try {
                JsBarcode(svgRef.current, cleanValue, {
                  format: 'CODE128',
                  width,
                  height,
                  displayValue,
                  fontSize,
                  textMargin: 4,
                  margin: 8,
                  background: '#ffffff',
                  lineColor: '#000000',
                  font: 'JetBrains Mono, monospace'
                });
                setRenderError(null);
                return;
              } catch (e2) {}
            }
            setRenderError('Invalid barcode format');
          } else {
            setRenderError(null);
          }
        }
      });
    } catch (err: any) {
      // If specific format failed, try fallback to CODE128
      try {
        if (svgRef.current && value) {
          JsBarcode(svgRef.current, value.trim(), {
            format: 'CODE128',
            width,
            height,
            displayValue,
            fontSize,
            textMargin: 4,
            margin: 8,
            background: '#ffffff',
            lineColor: '#000000',
            font: 'JetBrains Mono, monospace'
          });
          setRenderError(null);
          return;
        }
      } catch (e2) {}
      setRenderError(err.message || 'Error rendering barcode');
    }
  }, [value, format, width, height, displayValue, fontSize]);

  if (renderError) {
    return (
      <div className={`p-2 bg-amber-50 border border-amber-200 rounded-lg text-center text-xs text-amber-800 ${className}`}>
        <span className="font-mono font-bold tracking-wider">{value}</span>
        <p className="text-[10px] text-amber-600 mt-0.5">{renderError}</p>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center justify-center bg-white p-1 rounded-md overflow-hidden ${className}`}>
      <svg ref={svgRef} className="max-w-full" />
    </div>
  );
}
