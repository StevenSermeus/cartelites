export function StockVisibilityToolbar({
  selectedCount,
  resultCount,
  pageCount,
  disabled,
  onSelectPage,
  onSelectResults,
  onClear,
  onHide,
  onShow,
}: {
  selectedCount: number;
  resultCount: number;
  pageCount: number;
  disabled: boolean;
  onSelectPage: () => void;
  onSelectResults: () => void;
  onClear: () => void;
  onHide: () => void;
  onShow: () => void;
}) {
  return (
    <fieldset className="stock-visibility-toolbar" disabled={disabled}>
      <legend>Visibilité dans le catalogue</legend>
      <p>Les articles masqués restent dans votre stock et peuvent toujours être vendus.</p>
      <div className="actions">
        <button type="button" className="secondary" disabled={!pageCount} onClick={onSelectPage}>
          Sélectionner cette page ({pageCount})
        </button>
        <button type="button" className="secondary" disabled={!selectedCount} onClick={onClear}>
          Effacer la sélection de visibilité
        </button>
      </div>
      <p role="status">
        {selectedCount} article(s) sélectionné(s) pour la visibilité · {resultCount} résultat(s) sur cette page
      </p>
      {resultCount > 500 && (
        <p>
          Les changements groupés sont limités à 500 articles. Filtrez les articles visibles ou
          masqués pour traiter le lot suivant.
        </p>
      )}
      <div className="actions">
        <button type="button" disabled={!selectedCount} onClick={onHide}>
          Masquer la sélection
        </button>
        <button type="button" className="secondary" disabled={!selectedCount} onClick={onShow}>
          Afficher la sélection
        </button>
      </div>
    </fieldset>
  );
}
