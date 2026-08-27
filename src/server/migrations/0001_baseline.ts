import type { Migration } from './types';
import { BASELINE_SQL } from './0001_baseline.sql';

/**
 * The schema as it stood when migrations became versioned.
 *
 * Everything in it is CREATE TABLE IF NOT EXISTS, so it is safe on a database
 * that already has some or all of these tables from the old hand-run script.
 * It is the only migration that may run over a database it did not create;
 * every later one runs exactly once and is recorded.
 */
export const migration: Migration = {
  version: '0001',
  name: 'baseline',
  async up(m) {
    await m.query(BASELINE_SQL);
  },
};
