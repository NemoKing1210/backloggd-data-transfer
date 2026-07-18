import { entryDisplayTitle, primaryPlaythrough } from './schema.js';
import { normalizeTitle } from '../utils/title.js';

/**
 * @typedef {{
 *   title: string,
 *   count: number,
 *   keptSourceIndex: number,
 *   droppedSourceIndices: number[],
 * }} DuplicateTitleGroup
 *
 * @typedef {{
 *   entries: import('./schema.js').TransferEntry[],
 *   duplicateGroups: DuplicateTitleGroup[],
 *   originalCount: number,
 *   removedCount: number,
 * }} DedupeResult
 */

/**
 * Keep one entry per normalized title (richest data wins).
 * @param {import('./schema.js').TransferEntry[]} entries
 * @returns {DedupeResult}
 */
export function dedupeEntriesByTitle(entries) {
  const list = Array.isArray(entries) ? entries : [];
  /** @type {Map<string, {
   *   title: string,
   *   best: import('./schema.js').TransferEntry,
   *   bestScore: number,
   *   keptSourceIndex: number,
   *   droppedSourceIndices: number[],
   *   count: number,
   * }>} */
  const groups = new Map();
  /** @type {import('./schema.js').TransferEntry[]} */
  const untitled = [];

  list.forEach((entry, index) => {
    const title = entryDisplayTitle(entry);
    const key = normalizeTitle(title);
    if (!key) {
      untitled.push(entry);
      return;
    }

    const score = entryCompletenessScore(entry);
    const prev = groups.get(key);
    if (!prev) {
      groups.set(key, {
        title: title || key,
        best: entry,
        bestScore: score,
        keptSourceIndex: index,
        droppedSourceIndices: [],
        count: 1,
      });
      return;
    }

    prev.count += 1;
    if (score > prev.bestScore) {
      prev.droppedSourceIndices.push(prev.keptSourceIndex);
      prev.best = entry;
      prev.bestScore = score;
      prev.keptSourceIndex = index;
      prev.title = title || prev.title;
    } else {
      prev.droppedSourceIndices.push(index);
    }
  });

  /** @type {DuplicateTitleGroup[]} */
  const duplicateGroups = [];
  /** @type {import('./schema.js').TransferEntry[]} */
  const unique = [];

  for (const group of groups.values()) {
    unique.push(group.best);
    if (group.count > 1) {
      duplicateGroups.push({
        title: group.title,
        count: group.count,
        keptSourceIndex: group.keptSourceIndex,
        droppedSourceIndices: group.droppedSourceIndices.slice().sort((a, b) => a - b),
      });
    }
  }

  duplicateGroups.sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title),
  );

  const entriesOut = [...unique, ...untitled];
  return {
    entries: entriesOut,
    duplicateGroups,
    originalCount: list.length,
    removedCount: Math.max(0, list.length - entriesOut.length),
  };
}

/**
 * @param {import('./schema.js').TransferEntry} entry
 */
function entryCompletenessScore(entry) {
  const pt = primaryPlaythrough(entry);
  let score = 0;
  if (entry.game_id != null) score += 20;
  if (entry.slug) score += 4;
  if (pt.rating != null) score += 8;
  if (pt.review) score += 6;
  if (pt.start_date) score += 3;
  if (pt.finish_date) score += 3;
  if (pt.platform != null || pt.title) score += 2;
  if (entry.log?.game_liked) score += 1;
  if ((entry.dates || []).length) score += 2;
  return score;
}
