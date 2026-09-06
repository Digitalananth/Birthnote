import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { listPickupLocations, ShiprocketError } from '@/lib/shiprocket';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/shiprocket/pickup-locations
 *
 * The pickup addresses registered on the Shiprocket account, so the settings
 * form can offer them instead of asking the owner to type a nickname exactly.
 *
 * Failure is reported as an empty list plus a reason, never as an error the
 * form treats as fatal. The settings page must stay usable when Shiprocket is
 * unreachable — otherwise an outage at their end locks the owner out of
 * editing their own GST rates.
 */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (!env.shiprocket.configured()) {
    return NextResponse.json({
      locations: [],
      reason: 'Shiprocket is not configured on the server.',
    });
  }

  try {
    return NextResponse.json({ locations: await listPickupLocations(), reason: null });
  } catch (error) {
    return NextResponse.json({
      locations: [],
      reason:
        error instanceof ShiprocketError
          ? error.message
          : 'Could not reach Shiprocket to list pickup addresses.',
    });
  }
}
