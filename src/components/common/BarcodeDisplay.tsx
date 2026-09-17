import React from 'react';

interface BarcodeDisplayProps {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
  className?: string;
}

export function BarcodeDisplay({ value, className = '' }: BarcodeDisplayProps) {
  return (
    <div className={`p-3 bg-white border border-gray-200 rounded-xl text-center font-mono ${className}`}>
      <div className="text-sm font-bold tracking-widest text-gray-900">||| | |||| || | ||</div>
      <div className="text-xs font-semibold text-gray-700 mt-1">{value}</div>
    </div>
  );
}
