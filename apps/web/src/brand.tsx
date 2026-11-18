import { brand } from '../../../branding/brand';
import logo from '../../../branding/logo.png';
export { brand };

for (const [name, value] of Object.entries(brand.colors)) {
  document.documentElement.style.setProperty(`--brand-${name}`, value);
}
document.title = brand.name;

export function BrandIdentity({ catalogue = false }: { catalogue?: boolean }) {
  return (
    <div className="brand-identity">
      <img className="brand-logo" src={logo} alt={`Logo ${brand.name}`} />
      <div>
        <small>{catalogue ? brand.catalogueLabel : 'Votre espace de gestion'}</small>
        <h1>{catalogue ? 'Cartes disponibles' : brand.name}</h1>
        <p>{catalogue ? brand.description : brand.tagline}</p>
      </div>
    </div>
  );
}
