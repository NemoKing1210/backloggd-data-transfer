import { createDocument } from './schema.js';

/** Sample transfer document for the Import tab “Download example” button. */
export function createExampleTransferDocument() {
  return createDocument({
    source: {
      platform: 'example',
      label: 'Sample transfer file',
    },
    exportedAt: '2026-07-18T12:00:00.000Z',
    entries: [
      {
        title: 'Hades',
        status: 'played',
        rating: 9,
        favorite: true,
        platform: 'PC',
        dateStart: '2024-01-01',
        dateEnd: '2024-01-20',
        review: 'Great combat and story.',
        isDlc: false,
        tags: ['Roguelike', 'Action'],
        externalIds: {},
        sourceFields: {},
      },
      {
        title: 'Celeste',
        status: 'backlog',
        rating: null,
        favorite: false,
        platform: 'PC',
        dateStart: '',
        dateEnd: '',
        review: '',
        isDlc: false,
        tags: ['Platformer'],
        externalIds: {},
        sourceFields: {},
      },
    ],
  });
}
