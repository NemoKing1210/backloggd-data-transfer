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
        game_id: null,
        title: 'Raft',
        slug: 'raft',
        log: {
          game_liked: false,
          is_play: true,
          is_playing: false,
          is_backlog: false,
          is_wishlist: false,
          status: 'completed',
          total_hours: null,
          total_minutes: null,
          time_source: 1,
          override_cover_id: null,
        },
        playthroughs: [
          {
            title: 'Windows PC',
            rating: 5,
            review: '',
            review_spoilers: false,
            platform: 6,
            hours_played: null,
            mins_played: null,
            is_master: false,
            is_replay: false,
            start_date: '2024-08-02',
            finish_date: '',
            edition_id: null,
            edition_type: null,
            medium_id: null,
            played_platform: null,
            storefront_id: null,
            hours_finished: null,
            mins_finished: null,
            hours_mastered: null,
            mins_mastered: null,
            sync_sessions: false,
          },
        ],
        dates: [
          {
            range_start_date: '2024-08-02',
            range_end_date: '2024-08-03',
            status: 5,
            note: '',
            hours: null,
            minutes: null,
            start_date: '2024-08-02',
            finish_date: '',
          },
        ],
      },
      {
        game_id: null,
        title: 'Celeste',
        slug: 'celeste',
        log: {
          game_liked: false,
          status: 'backlog',
        },
        playthroughs: [
          {
            title: 'Windows PC',
            platform: 6,
            rating: null,
            review: '',
            start_date: '',
            finish_date: '',
          },
        ],
        dates: [],
      },
    ],
  });
}
