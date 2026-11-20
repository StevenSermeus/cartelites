import type { Tcg } from '../../../packages/domain/src/riftbound';
import pokemonLogo from '../../../assets/tcg/pokemon.png';
import riftboundLogo from '../../../assets/tcg/riftbound.png';
export function TcgChoices({
  value,
  onChange,
  all = false,
}: {
  value: Tcg | 'all';
  onChange: (value: Tcg | 'all') => void;
  all?: boolean;
}) {
  return (
    <div className="tcg-choices" role="group" aria-label="Jeu de cartes">
      {all && (
        <button
          type="button"
          className="tcg-choice"
          aria-pressed={value === 'all'}
          onClick={() => onChange('all')}
        >
          Tous les TCG
        </button>
      )}
      {(['pokemon', 'riftbound', 'other'] as const).map((tcg) => (
        <button
          type="button"
          className="tcg-choice"
          key={tcg}
          aria-pressed={value === tcg}
          onClick={() => onChange(tcg)}
        >
          {tcg !== 'other' && <img src={tcg === 'pokemon' ? pokemonLogo : riftboundLogo} alt="" />}
          <span>{tcg === 'pokemon' ? 'Pokémon' : tcg === 'riftbound' ? 'Riftbound' : 'Autre'}</span>
        </button>
      ))}
    </div>
  );
}
