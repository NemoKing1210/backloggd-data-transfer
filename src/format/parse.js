import {
  TRANSFER_FORMAT_ID,
  TRANSFER_FORMAT_VERSION,
} from '../constants.js';
import { createDocument, createEntry } from './schema.js';

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: import('./schema.js').TransferDocument } | { ok: false, error: string }}
 */
export function parseTransferDocument(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return { ok: false, error: 'Invalid JSON' };
    }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Document must be an object' };
  }
  if (data.format !== TRANSFER_FORMAT_ID) {
    return {
      ok: false,
      error: `Expected format "${TRANSFER_FORMAT_ID}", got "${data.format ?? ''}"`,
    };
  }
  const version = Number(data.version);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Missing or invalid version' };
  }
  if (version > TRANSFER_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported format version ${version} (max ${TRANSFER_FORMAT_VERSION})`,
    };
  }
  if (!Array.isArray(data.entries)) {
    return { ok: false, error: 'entries must be an array' };
  }

  const doc = createDocument({
    source: data.source || { platform: 'custom' },
    entries: data.entries.map((e) => createEntry(e)),
    exportedAt: data.exportedAt || new Date().toISOString(),
  });
  doc.version = version;

  return { ok: true, value: doc };
}
