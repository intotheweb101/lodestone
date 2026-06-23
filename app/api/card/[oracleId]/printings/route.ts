/**
 * GET /api/card/[oracleId]/printings
 * Returns all print/treatment options for a card.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrintingOptions, groupPrintingsByTreatment } from '@/lib/scryfall/printings';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ oracleId: string }> }
) {
  const { oracleId } = await params;
  const options = getPrintingOptions(oracleId);
  const grouped = groupPrintingsByTreatment(options);

  return NextResponse.json({ options, grouped });
}
