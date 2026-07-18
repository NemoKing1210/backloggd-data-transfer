import { TRANSFER_FILENAME_PREFIX } from '../constants.js';
import { createDocument } from './schema.js';

/**
 * @param {import('./schema.js').TransferDocument} doc
 * @param {{ pretty?: boolean }} [options]
 */
export function serializeTransferDocument(doc, options = {}) {
  const normalized = createDocument({
    source: doc.source,
    entries: doc.entries,
    exportedAt: doc.exportedAt,
  });
  const pretty = options.pretty !== false;
  return `${JSON.stringify(normalized, null, pretty ? 2 : 0)}\n`;
}

export function transferFilename(sourcePlatform = 'export') {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = String(sourcePlatform || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export';
  return `${TRANSFER_FILENAME_PREFIX}-${safe}-${stamp}.json`;
}
