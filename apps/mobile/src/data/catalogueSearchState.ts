/** A catalogue reply may only update the exact request context still being edited. */
export function acceptsCatalogueReply(current: {cardSearch: string; language: string; tcg?: string}, request: {query: string; language: string; tcg?: string}) {
  return current.cardSearch.trim() === request.query.trim() && current.language === request.language && (current.tcg ?? 'pokemon') === (request.tcg ?? 'pokemon');
}
