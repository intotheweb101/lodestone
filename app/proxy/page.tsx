import type { Metadata } from 'next';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { getDeck } from '@/lib/deck/store';
import { mainboardEntries } from '@/lib/deck/model';
import { canView } from '@/lib/auth/access';
import { getScryfallCardsByOracleId } from '@/lib/db/queries';
import { ProxyClient } from './proxy-client';
import type { ProxyCard } from './proxy-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Proxy Printer — Lodestone' };

let migrated = false;

function extractImageUrl(card: { image_uris: Record<string, string> | null; card_faces: unknown[] | null }): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  const faces = card.card_faces as { image_uris?: { normal?: string } }[] | null;
  return faces?.[0]?.image_uris?.normal ?? null;
}

export default async function ProxyPage({
  searchParams,
}: {
  searchParams: Promise<{ deck?: string; cards?: string }>;
}) {
  if (!migrated) { runMigrations(); migrated = true; }

  const user = await resolveActingUser();
  const { deck: deckParam, cards: cardsParam } = await searchParams;

  let proxyCards: ProxyCard[] = [];
  let deckName: string | undefined;
  let deckId: string | undefined;

  if (deckParam) {
    const deck = getDeck(deckParam);
    if (deck && canView(deck, user)) {
      deckName = deck.name;
      deckId = deck.id;
      const entries = mainboardEntries(deck);
      for (const entry of entries) {
        const printings = getScryfallCardsByOracleId(entry.oracle_id);
        const card = printings[0] ?? null;
        proxyCards.push({
          oracle_id: entry.oracle_id,
          card_name: entry.card_name,
          quantity: entry.quantity,
          image_url: card ? extractImageUrl(card) : null,
        });
      }
    }
  } else if (cardsParam) {
    const oracleIds = cardsParam.split(',').filter(Boolean);
    for (const oracleId of oracleIds) {
      const printings = getScryfallCardsByOracleId(oracleId);
      const card = printings[0] ?? null;
      if (card) {
        proxyCards.push({
          oracle_id: oracleId,
          card_name: card.name,
          quantity: 1,
          image_url: extractImageUrl(card),
        });
      }
    }
  }

  return (
    <ProxyClient
      cards={proxyCards}
      deckName={deckName}
      deckId={deckId}
    />
  );
}
