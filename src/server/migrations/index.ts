import type { Migration } from './types';
import { migration as m0001 } from './0001_baseline';
import { migration as m0002 } from './0002_orders_user_id';
import { migration as m0003 } from './0003_widen_order_events_actor';
import { migration as m0004 } from './0004_order_items';
import { migration as m0005 } from './0005_whatsapp';
import { migration as m0006 } from './0006_phone_sign_in';
import { migration as m0007 } from './0007_app_errors';
import { migration as m0008 } from './0008_dashboard_indexes';
import { migration as m0009 } from './0009_report_indexes';
import { migration as m0010 } from './0010_holds_and_refunds';
import { migration as m0011 } from './0011_master_options';
import { migration as m0012 } from './0012_denomination_combos';

/**
 * Every migration, oldest first. Listed by hand rather than read from the
 * directory because the directory does not exist at runtime: Hostinger prunes
 * the deploy to .next, and only what is imported is in .next.
 *
 * To change the schema: add `NNNN_short_name.ts` with the next number,
 * import it here, append it. Never edit or renumber one that has shipped —
 * it has already run on the production database and will not run again.
 */
export const migrations: readonly Migration[] = [
  m0001,
  m0002,
  m0003,
  m0004,
  m0005,
  m0006,
  m0007,
  m0008,
  m0009,
  m0010,
  m0011,
  m0012,
];
