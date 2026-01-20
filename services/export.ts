/**
 * Export Service
 * JSON and CSV export functionality for receipts
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Receipt, ExportFormat } from '@/types/receipt';

const EXPORT_DIR = `${FileSystem.documentDirectory}exports/`;

/**
 * Ensure export directory exists
 */
async function ensureExportDir(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(EXPORT_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  }
}

/**
 * Generate filename with timestamp
 */
function generateFilename(prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}_${timestamp}.${extension}`;
}

/**
 * Export a single receipt to JSON
 */
export async function exportReceiptToJson(receipt: Receipt): Promise<string> {
  await ensureExportDir();

  const filename = generateFilename(`receipt_${receipt.id}`, 'json');
  const filepath = `${EXPORT_DIR}${filename}`;

  const jsonContent = JSON.stringify(receipt, null, 2);
  await FileSystem.writeAsStringAsync(filepath, jsonContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return filepath;
}

/**
 * Export multiple receipts to JSON
 */
export async function exportReceiptsToJson(
  receipts: Receipt[]
): Promise<string> {
  await ensureExportDir();

  const filename = generateFilename('receipts_export', 'json');
  const filepath = `${EXPORT_DIR}${filename}`;

  const exportData = {
    exported_at: new Date().toISOString(),
    total_receipts: receipts.length,
    total_amount: receipts.reduce((sum, r) => sum + r.total, 0),
    receipts,
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  await FileSystem.writeAsStringAsync(filepath, jsonContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return filepath;
}

/**
 * Escape CSV field value
 */
function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Export a single receipt to CSV
 */
export async function exportReceiptToCsv(receipt: Receipt): Promise<string> {
  await ensureExportDir();

  const filename = generateFilename(`receipt_${receipt.id}`, 'csv');
  const filepath = `${EXPORT_DIR}${filename}`;

  // Create two sections: receipt summary and line items
  const lines: string[] = [];

  // Receipt summary section
  lines.push('=== RECEIPT SUMMARY ===');
  lines.push('Field,Value');
  lines.push(`Merchant Name,${escapeCSV(receipt.merchant_name)}`);
  lines.push(`Receipt Date,${escapeCSV(receipt.receipt_date)}`);
  lines.push(`Receipt Number,${escapeCSV(receipt.receipt_number)}`);
  lines.push(`Invoice Type,${escapeCSV(receipt.invoice_type)}`);
  lines.push(`Subtotal,${escapeCSV(receipt.subtotal)}`);
  lines.push(`Tax,${escapeCSV(receipt.tax)}`);
  lines.push(`Total,${escapeCSV(receipt.total)}`);
  lines.push(`Currency,${escapeCSV(receipt.currency)}`);
  lines.push(`Payment Method,${escapeCSV(receipt.payment_method)}`);
  lines.push(`Confidence Score,${escapeCSV(receipt.confidence_score)}`);
  lines.push('');

  // Line items section
  lines.push('=== LINE ITEMS ===');
  lines.push('Item Name,Quantity,Price');
  for (const item of receipt.items) {
    lines.push(
      `${escapeCSV(item.name)},${escapeCSV(item.quantity)},${escapeCSV(item.price)}`
    );
  }

  await FileSystem.writeAsStringAsync(filepath, lines.join('\n'), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return filepath;
}

/**
 * Export multiple receipts to CSV (Google Sheets friendly format)
 */
export async function exportReceiptsToCsv(
  receipts: Receipt[]
): Promise<string> {
  await ensureExportDir();

  const filename = generateFilename('receipts_export', 'csv');
  const filepath = `${EXPORT_DIR}${filename}`;

  // Headers
  const headers = [
    'ID',
    'Merchant Name',
    'Receipt Date',
    'Receipt Number',
    'Invoice Type',
    'Item Name',
    'Item Quantity',
    'Item Price',
    'Subtotal',
    'Tax',
    'Total',
    'Currency',
    'Payment Method',
    'Confidence Score',
    'Created At',
  ];

  const lines: string[] = [headers.join(',')];

  // Each receipt can have multiple rows (one per line item)
  for (const receipt of receipts) {
    if (receipt.items.length === 0) {
      // Receipt with no items - single row
      lines.push(
        [
          escapeCSV(receipt.id),
          escapeCSV(receipt.merchant_name),
          escapeCSV(receipt.receipt_date),
          escapeCSV(receipt.receipt_number),
          escapeCSV(receipt.invoice_type),
          '', // No item name
          '', // No quantity
          '', // No price
          escapeCSV(receipt.subtotal),
          escapeCSV(receipt.tax),
          escapeCSV(receipt.total),
          escapeCSV(receipt.currency),
          escapeCSV(receipt.payment_method),
          escapeCSV(receipt.confidence_score),
          escapeCSV(receipt.created_at),
        ].join(',')
      );
    } else {
      // One row per line item
      for (let i = 0; i < receipt.items.length; i++) {
        const item = receipt.items[i];
        lines.push(
          [
            escapeCSV(i === 0 ? receipt.id : ''), // Only show ID on first row
            escapeCSV(i === 0 ? receipt.merchant_name : ''),
            escapeCSV(i === 0 ? receipt.receipt_date : ''),
            escapeCSV(i === 0 ? receipt.receipt_number : ''),
            escapeCSV(i === 0 ? receipt.invoice_type : ''),
            escapeCSV(item.name),
            escapeCSV(item.quantity),
            escapeCSV(item.price),
            escapeCSV(i === 0 ? receipt.subtotal : ''),
            escapeCSV(i === 0 ? receipt.tax : ''),
            escapeCSV(i === 0 ? receipt.total : ''),
            escapeCSV(i === 0 ? receipt.currency : ''),
            escapeCSV(i === 0 ? receipt.payment_method : ''),
            escapeCSV(i === 0 ? receipt.confidence_score : ''),
            escapeCSV(i === 0 ? receipt.created_at : ''),
          ].join(',')
        );
      }
    }
  }

  await FileSystem.writeAsStringAsync(filepath, lines.join('\n'), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return filepath;
}

/**
 * Export receipts in specified format
 */
export async function exportReceipts(
  receipts: Receipt[],
  format: ExportFormat
): Promise<string> {
  if (format === 'json') {
    return receipts.length === 1
      ? exportReceiptToJson(receipts[0])
      : exportReceiptsToJson(receipts);
  } else {
    return receipts.length === 1
      ? exportReceiptToCsv(receipts[0])
      : exportReceiptsToCsv(receipts);
  }
}

/**
 * Share an exported file
 */
export async function shareFile(filepath: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();

  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(filepath, {
    mimeType: filepath.endsWith('.json') ? 'application/json' : 'text/csv',
    dialogTitle: 'Export Receipt Data',
  });
}

/**
 * Export and share in one step
 */
export async function exportAndShare(
  receipts: Receipt[],
  format: ExportFormat
): Promise<void> {
  const filepath = await exportReceipts(receipts, format);
  await shareFile(filepath);
}

/**
 * Get all exported files
 */
export async function getExportedFiles(): Promise<string[]> {
  await ensureExportDir();
  const files = await FileSystem.readDirectoryAsync(EXPORT_DIR);
  return files.map((f) => `${EXPORT_DIR}${f}`);
}

/**
 * Delete an exported file
 */
export async function deleteExportedFile(filepath: string): Promise<void> {
  await FileSystem.deleteAsync(filepath, { idempotent: true });
}

/**
 * Clear all exported files
 */
export async function clearExportedFiles(): Promise<void> {
  await FileSystem.deleteAsync(EXPORT_DIR, { idempotent: true });
  await ensureExportDir();
}

/**
 * Generate a flat CSV for Google Sheets (one receipt per row, items as JSON)
 */
export async function exportReceiptsToFlatCsv(
  receipts: Receipt[]
): Promise<string> {
  await ensureExportDir();

  const filename = generateFilename('receipts_flat_export', 'csv');
  const filepath = `${EXPORT_DIR}${filename}`;

  const headers = [
    'ID',
    'Merchant Name',
    'Receipt Date',
    'Receipt Number',
    'Invoice Type',
    'Items (JSON)',
    'Item Count',
    'Subtotal',
    'Tax',
    'Total',
    'Currency',
    'Payment Method',
    'Confidence Score',
    'Has Error',
    'Created At',
  ];

  const lines: string[] = [headers.join(',')];

  for (const receipt of receipts) {
    lines.push(
      [
        escapeCSV(receipt.id),
        escapeCSV(receipt.merchant_name),
        escapeCSV(receipt.receipt_date),
        escapeCSV(receipt.receipt_number),
        escapeCSV(receipt.invoice_type),
        escapeCSV(JSON.stringify(receipt.items)),
        escapeCSV(receipt.items.length),
        escapeCSV(receipt.subtotal),
        escapeCSV(receipt.tax),
        escapeCSV(receipt.total),
        escapeCSV(receipt.currency),
        escapeCSV(receipt.payment_method),
        escapeCSV(receipt.confidence_score),
        escapeCSV(receipt.error_message ? 'Yes' : 'No'),
        escapeCSV(receipt.created_at),
      ].join(',')
    );
  }

  await FileSystem.writeAsStringAsync(filepath, lines.join('\n'), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return filepath;
}
