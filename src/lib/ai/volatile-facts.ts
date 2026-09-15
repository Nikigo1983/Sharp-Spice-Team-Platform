/**
 * Volatile / current-state fact refresh signals (Phase 2).
 * When the user asks for "current" data, re-fetch authoritative sources
 * even if ClientRef is locked — do not trust stale conversation state.
 */

const CURRENT_SIGNAL_RE =
  /(?:сейчас|актуальн(?:ый|ая|ое|ые|ого|ой|ому|ым|ом|ую|ими)?|на\s+сегодня|на\s+текущ\w*|перепроверь|обнови(?:ть)?\s+(?:данн|статус|долг|баланс)|current(?:ly)?|as\s+of\s+today|right\s+now)/i;

const VOLATILE_FACT_CUE_RE =
  /долг|баланс|оплат|статус|документ|финанс|payment|debt|balance|status|клиент/i;

const EXTERNAL_NEWS_RE =
  /требован|закон|правил|digital\s+nomad|внж\s+хорват|новост/i;

/**
 * True when the query asks for up-to-date / current client or finance facts.
 * Distinct from web-search "актуальные требования" — those stay false unless
 * a client/finance cue is also present.
 */
export function queryRequiresVolatileRefetch(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (!CURRENT_SIGNAL_RE.test(q)) return false;
  // Pure legal/news "актуальные требования" ≠ Finance refetch.
  if (EXTERNAL_NEWS_RE.test(q) && !VOLATILE_FACT_CUE_RE.test(q)) {
    return false;
  }
  return true;
}
