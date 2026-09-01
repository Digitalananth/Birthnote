import { NextResponse } from 'next/server';
import { requireOwnerApi } from '@/lib/admin-api';
import { readJson } from '@/lib/content-admin';
import { setSetting } from '@/lib/settings';
import { SETTING_KEYS, validateSetting, type SettingKey } from '@/lib/settings-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/settings — save the tax, delivery and invoice settings.
 *
 * Owner-only: these decide what every customer is charged and whose GSTIN
 * appears on a legal document. Staff run the order queue, which is a different
 * job — the same line drawn for the master lists.
 *
 * The whole form is saved at once and validated before anything is written, so
 * a bad rate cannot leave half the settings applied and half not.
 */
export async function PUT(request: Request) {
  const auth = await requireOwnerApi();
  if (auth.error) return auth.error;

  const parsed = await readJson<Record<string, string>>(request);
  if (parsed.error) return parsed.error;

  const errors: Record<string, string> = {};
  const writes: [SettingKey, string][] = [];

  for (const key of SETTING_KEYS) {
    const raw = parsed.body[key];
    // Only what was sent — a form that omits a field leaves it as it was
    // rather than blanking it.
    if (typeof raw !== 'string') continue;
    const checked = validateSetting(key, raw);
    if (checked.value === undefined) {
      errors[key] = checked.error ?? 'That value is not valid.';
    } else {
      writes.push([key, checked.value]);
    }
  }

  if (Object.keys(errors).length) {
    return NextResponse.json(
      { error: 'Please check the highlighted fields.', errors },
      { status: 400 }
    );
  }

  for (const [key, value] of writes) {
    await setSetting(key, value);
  }

  return NextResponse.json({ ok: true, saved: writes.length });
}
