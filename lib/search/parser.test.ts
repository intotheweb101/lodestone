import { describe, it, expect } from 'vitest';
import { parseQuery, serializeQuery, type ParsedQuery } from './parser';

// ── parseQuery — basic term parsing ──────────────────────────────────────────

describe('parseQuery', () => {
  it('returns empty result for an empty string', () => {
    const result = parseQuery('');
    expect(result.terms).toHaveLength(0);
    expect(result.order).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('parses a bare word as a name term', () => {
    const { terms } = parseQuery('lightning');
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({ field: 'name', op: ':', value: 'lightning', negate: false });
  });

  it('parses a quoted name with spaces', () => {
    const { terms } = parseQuery('"lightning bolt"');
    expect(terms[0]).toMatchObject({ field: 'name', op: ':', value: 'lightning bolt' });
  });

  it('parses a negated bare name', () => {
    const { terms } = parseQuery('-goblin');
    expect(terms[0]).toMatchObject({ field: 'name', negate: true, value: 'goblin' });
  });

  it('parses t: as type field', () => {
    const { terms } = parseQuery('t:creature');
    expect(terms[0]).toMatchObject({ field: 'type', op: ':', value: 'creature', negate: false });
  });

  it('parses type: as type field', () => {
    const { terms } = parseQuery('type:instant');
    expect(terms[0].field).toBe('type');
  });

  it('parses o: as oracle field', () => {
    const { terms } = parseQuery('o:flying');
    expect(terms[0]).toMatchObject({ field: 'oracle', value: 'flying' });
  });

  it('parses c: as colors field and normalises to uppercase letters', () => {
    const { terms } = parseQuery('c:WUB');
    expect(terms[0]).toMatchObject({ field: 'colors', value: 'WUB' });
  });

  it('parses guild names in color field', () => {
    expect(parseQuery('c:azorius').terms[0].value).toBe('WU');
    expect(parseQuery('c:grixis').terms[0].value).toBe('UBR');
    expect(parseQuery('id:mardu').terms[0].value).toBe('RWB');
  });

  it('parses id: as identity field', () => {
    const { terms } = parseQuery('id:WUBRG');
    expect(terms[0].field).toBe('identity');
  });

  it('parses mv>= operator for numeric field', () => {
    const { terms } = parseQuery('mv>=3');
    expect(terms[0]).toMatchObject({ field: 'mv', op: '>=', value: '3' });
  });

  it('parses pow< operator', () => {
    const { terms } = parseQuery('pow<4');
    expect(terms[0]).toMatchObject({ field: 'pow', op: '<', value: '4' });
  });

  it('parses r: as rarity field', () => {
    const { terms } = parseQuery('r:rare');
    expect(terms[0]).toMatchObject({ field: 'rarity', value: 'rare' });
  });

  it('parses f: as format field', () => {
    const { terms } = parseQuery('f:commander');
    expect(terms[0]).toMatchObject({ field: 'format', value: 'commander' });
  });

  it('parses is: field', () => {
    const { terms } = parseQuery('is:commander');
    expect(terms[0]).toMatchObject({ field: 'is', value: 'commander' });
  });

  it('parses kw: as keyword field', () => {
    const { terms } = parseQuery('kw:flying');
    expect(terms[0]).toMatchObject({ field: 'keyword', value: 'flying' });
  });

  it('parses negated field term', () => {
    const { terms } = parseQuery('-t:artifact');
    expect(terms[0]).toMatchObject({ field: 'type', value: 'artifact', negate: true });
  });

  it('handles multiple terms in one query', () => {
    const { terms } = parseQuery('t:creature mv>=3 -r:common');
    expect(terms).toHaveLength(3);
    expect(terms[0].field).toBe('type');
    expect(terms[1].field).toBe('mv');
    expect(terms[2]).toMatchObject({ field: 'rarity', negate: true });
  });

  it('parses an unknown key as an error + falls back to name search', () => {
    const { terms, errors } = parseQuery('xyz:lightning');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/unknown filter key/i);
    // The whole token (minus negate) becomes a name term
    expect(terms[0].field).toBe('name');
  });

  // ── order ────────────────────────────────────────────────────────────────

  it('parses order:cmc', () => {
    const { order } = parseQuery('order:cmc');
    expect(order).toMatchObject({ key: 'cmc', dir: 'asc' });
  });

  it('parses order:name', () => {
    const { order } = parseQuery('order:name');
    expect(order).toMatchObject({ key: 'name', dir: 'asc' });
  });

  it('parses order:cmc dir:desc', () => {
    const { order } = parseQuery('order:cmc dir:desc');
    expect(order).toMatchObject({ key: 'cmc', dir: 'desc' });
  });

  it('parses dir: before order: (handles any token ordering)', () => {
    const { order } = parseQuery('dir:desc order:price');
    expect(order).toMatchObject({ key: 'price', dir: 'desc' });
  });

  it('returns error for unknown sort key', () => {
    const { errors } = parseQuery('order:foobar');
    expect(errors.some(e => /unknown sort key/i.test(e))).toBe(true);
  });

  it('does not include order: tokens in terms', () => {
    const { terms } = parseQuery('t:creature order:cmc');
    expect(terms).toHaveLength(1);
    expect(terms[0].field).toBe('type');
  });

  // ── New operators ─────────────────────────────────────────────────────────

  it('parses usd>= as price_usd field with numeric op', () => {
    const { terms } = parseQuery('usd>=10');
    expect(terms[0]).toMatchObject({ field: 'price_usd', op: '>=', value: '10' });
  });

  it('parses usd< as price_usd field', () => {
    const { terms } = parseQuery('usd<5.00');
    expect(terms[0]).toMatchObject({ field: 'price_usd', op: '<', value: '5.00' });
  });

  it('parses eur: as price_eur field', () => {
    const { terms } = parseQuery('eur:2');
    expect(terms[0]).toMatchObject({ field: 'price_eur', op: ':', value: '2' });
  });

  it('parses art: as artist field', () => {
    const { terms } = parseQuery('art:tolkien');
    expect(terms[0]).toMatchObject({ field: 'artist', op: ':', value: 'tolkien' });
  });

  it('parses artist: as artist field', () => {
    const { terms } = parseQuery('artist:"Rebecca Guay"');
    expect(terms[0]).toMatchObject({ field: 'artist', value: 'rebecca guay' });
  });

  it('parses ft: as flavor field', () => {
    const { terms } = parseQuery('ft:goblin');
    expect(terms[0]).toMatchObject({ field: 'flavor', op: ':', value: 'goblin' });
  });

  it('parses flavor: as flavor field', () => {
    const { terms } = parseQuery('flavor:mana');
    expect(terms[0]).toMatchObject({ field: 'flavor', value: 'mana' });
  });

  it('parses year: as year field', () => {
    const { terms } = parseQuery('year:2023');
    expect(terms[0]).toMatchObject({ field: 'year', op: ':', value: '2023' });
  });

  it('parses year>= as year field with numeric op', () => {
    const { terms } = parseQuery('year>=2020');
    expect(terms[0]).toMatchObject({ field: 'year', op: '>=', value: '2020' });
  });

  it('parses banned: as banned field', () => {
    const { terms } = parseQuery('banned:commander');
    expect(terms[0]).toMatchObject({ field: 'banned', op: ':', value: 'commander' });
  });

  it('parses restricted: as restricted field', () => {
    const { terms } = parseQuery('restricted:vintage');
    expect(terms[0]).toMatchObject({ field: 'restricted', op: ':', value: 'vintage' });
  });

  it('parses cn: as cn field', () => {
    const { terms } = parseQuery('cn:100');
    expect(terms[0]).toMatchObject({ field: 'cn', op: ':', value: '100' });
  });

  it('parses border: as border field', () => {
    const { terms } = parseQuery('border:borderless');
    expect(terms[0]).toMatchObject({ field: 'border', op: ':', value: 'borderless' });
  });

  it('parses frame: as frame field', () => {
    const { terms } = parseQuery('frame:showcase');
    expect(terms[0]).toMatchObject({ field: 'frame', op: ':', value: 'showcase' });
  });

  it('parses order:released', () => {
    const { order } = parseQuery('order:released');
    expect(order).toMatchObject({ key: 'released', dir: 'asc' });
  });

  it('parses order:usd as price order', () => {
    const { order } = parseQuery('order:usd dir:desc');
    expect(order).toMatchObject({ key: 'price', dir: 'desc' });
  });

  it('parses is:nonfoil', () => {
    const { terms } = parseQuery('is:nonfoil');
    expect(terms[0]).toMatchObject({ field: 'is', value: 'nonfoil' });
  });

  it('parses is:showcase', () => {
    const { terms } = parseQuery('is:showcase');
    expect(terms[0]).toMatchObject({ field: 'is', value: 'showcase' });
  });

  it('parses is:borderless', () => {
    const { terms } = parseQuery('is:borderless');
    expect(terms[0]).toMatchObject({ field: 'is', value: 'borderless' });
  });

  it('negates new field terms', () => {
    const { terms } = parseQuery('-art:tolkien');
    expect(terms[0]).toMatchObject({ field: 'artist', negate: true, value: 'tolkien' });
  });
});

// ── serializeQuery ────────────────────────────────────────────────────────────

describe('serializeQuery', () => {
  it('serializes a plain name term', () => {
    const q: ParsedQuery = {
      terms: [{ field: 'name', op: ':', value: 'bolt', negate: false }],
      order: null,
      errors: [],
    };
    expect(serializeQuery(q)).toBe('bolt');
  });

  it('serializes a name term with spaces in quotes', () => {
    const q: ParsedQuery = {
      terms: [{ field: 'name', op: ':', value: 'lightning bolt', negate: false }],
      order: null,
      errors: [],
    };
    expect(serializeQuery(q)).toBe('"lightning bolt"');
  });

  it('serializes a negated type term', () => {
    const q: ParsedQuery = {
      terms: [{ field: 'type', op: ':', value: 'creature', negate: true }],
      order: null,
      errors: [],
    };
    expect(serializeQuery(q)).toBe('-t:creature');
  });

  it('serializes numeric operators correctly', () => {
    const q: ParsedQuery = {
      terms: [{ field: 'mv', op: '>=', value: '3', negate: false }],
      order: null,
      errors: [],
    };
    expect(serializeQuery(q)).toBe('mv>=3');
  });

  it('appends order and dir when present', () => {
    const q: ParsedQuery = {
      terms: [],
      order: { key: 'cmc', dir: 'desc' },
      errors: [],
    };
    expect(serializeQuery(q)).toBe('order:cmc dir:desc');
  });

  it('omits dir when ascending (default)', () => {
    const q: ParsedQuery = {
      terms: [],
      order: { key: 'name', dir: 'asc' },
      errors: [],
    };
    expect(serializeQuery(q)).toBe('order:name');
  });

  it('round-trips a compound query', () => {
    const raw = 't:creature mv>=3 -r:common';
    const q = parseQuery(raw);
    const serialized = serializeQuery(q);
    // Re-parse the serialized form and compare term count + fields
    const q2 = parseQuery(serialized);
    expect(q2.terms.length).toBe(q.terms.length);
    expect(q2.terms.map(t => t.field)).toEqual(q.terms.map(t => t.field));
    expect(q2.terms.map(t => t.negate)).toEqual(q.terms.map(t => t.negate));
  });

  it('serializes usd>= field correctly', () => {
    const q: ParsedQuery = {
      terms: [{ field: 'price_usd', op: '>=', value: '10', negate: false }],
      order: null,
      errors: [],
    };
    expect(serializeQuery(q)).toBe('usd>=10');
  });
});
