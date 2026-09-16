import { mergeConfig } from 'vitest/config';
import base from './vitest.config.ts';
import CiSequencer from './scripts/ci-sequencer.mjs';

// Only file placement differs. The Worker runtime, isolation, discovery and
// timeouts come from the same configuration used by unsharded local runs.
export default mergeConfig(base, { test: { sequence: { sequencer: CiSequencer } } });
