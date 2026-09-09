import type { Correction } from './types';

export const correction: Correction = {
  date: '2026-09-09',
  what_was_wrong: 'The corpus feed called a snapshot Bitcoin-anchored whenever a timestamp submission record existed, including pending and failed submissions. The corpus submitted its digests but had no follow-up pass to collect completed proofs. All six published entries still said pending in the September 9 read, although completed proofs were available from their calendars.',
  how_long: 'The feed wording shipped September 3. The corpus upgrade gap was present from its first published snapshot, August 9, through the September 9 investigation. The captured snapshots retain their original signatures and digests.',
  found_by: 'A keeper-requested verification follow-through read every published corpus snapshot and queried its timestamp calendar. The saved inputs and independent Bitcoin-header checks are in research/verification-2026-09-09; the method is in docs/VERIFICATION_OBSERVATIONS_2026-09-08.md.',
  what_changed: 'An hourly, bounded corpus pass retrieves completed proofs and retries failed submissions without changing signed snapshots. It counts unreadable and invalid records and reports deferred work. The feed states the stored timestamp status and requires independent Bitcoin verification. test/corpus-anchors.spec.ts checks pending responses, failed submissions, tampering, bounded work and agreement between R2 records and KV pointers; the pending-feed assertion failed before the wording changed.',
};
