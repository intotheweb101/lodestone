import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getCollectionWithCards } from '@/lib/collection/store';
import { runMigrations } from '@/lib/db/migrations';

function escapeCsv(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: NextRequest) {
  runMigrations();

  const user = getUserFromRequest(req);
  if (!user || user.id === 'local') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const entries = getCollectionWithCards(user.id);

  const header = 'Name,Quantity,Foil,Set code,Collector number,Price (USD)\n';
  const rows = entries.map(e =>
    [
      escapeCsv(e.name),
      escapeCsv(e.quantity),
      escapeCsv(e.foil ? 'Yes' : 'No'),
      escapeCsv(e.set_code),
      escapeCsv(e.collector_number),
      escapeCsv(e.price_usd != null ? e.price_usd.toFixed(2) : ''),
    ].join(',')
  );

  const csv = header + rows.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="lodestone-collection.csv"',
    },
  });
}
