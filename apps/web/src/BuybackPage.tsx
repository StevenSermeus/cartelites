import { useEffect } from 'react';
import {
  FiArrowRight,
  FiCheck,
  FiMail,
  FiPhone,
  FiSearch,
  FiLayers,
  FiShield,
} from 'react-icons/fi';
import { brand } from './brand';
import { legal } from '../../../branding/legal';
import logo from '../../../branding/logo.png';
import { SocialLinks } from './SocialLinks';

export function PublicNavigation({ active }: { active: 'catalogue' | 'rachat' }) {
  return (
    <nav className="public-navigation" aria-label="Navigation du site">
      <a href="/convention" aria-current={active === 'catalogue' ? 'page' : undefined}>
        Le catalogue
      </a>
      <a href="/rachat" aria-current={active === 'rachat' ? 'page' : undefined}>
        Rachat & dépôt-vente <FiArrowRight aria-hidden="true" />
      </a>
      <SocialLinks />
    </nav>
  );
}

const proposal = `mailto:${legal.email}?${new URLSearchParams({
  subject: `Proposition de cartes / collection — ${brand.name}`,
  body: 'Bonjour,\n\nJe souhaite vous proposer :\n- Type : cartes / collection / produits scellés\n- Rachat ou dépôt-vente :\n- Séries, langues et quantité approximative :\n- État général / cartes gradées :\n- Ma localisation :\n\nJe joins des photos de l’ensemble et des rectos/versos des principales cartes.\n\nMerci !',
}).toString().replace(/\+/g, '%20')}`;

export default function BuybackPage() {
  useEffect(() => {
    document.title = `Rachat de cartes & dépôt-vente | ${brand.name}`;
    const previous = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const meta = previous ?? document.createElement('meta');
    const content = meta.content;
    meta.name = 'description';
    meta.content = `Vendez vos cartes et collections à ${brand.name} : rachat de 70 à 90 % de la cote retenue. Cartes et scellés en dépôt-vente, commission de 15 à 30 % convenue ensemble.`;
    if (!previous) document.head.append(meta);
    return () => {
      if (previous) meta.content = content;
      else meta.remove();
    };
  }, []);
  return (
    <main className="buyback-page">
      <PublicNavigation active="rachat" />
      <section className="buyback-hero" aria-labelledby="buyback-title">
        <div className="buyback-hero-copy">
          <a href="/convention" className="buyback-brand">
            <img src={logo} alt="" />
            <span>
              {brand.name}
              <small>RACHAT & DÉPÔT-VENTE</small>
            </span>
          </a>
          <p className="buyback-eyebrow">Une carte. Un classeur. Toute une collection.</p>
          <h1 id="buyback-title">
            Votre collection mérite
            <br />
            <em>une vraie attention.</em>
          </h1>
          <p className="buyback-lead">
            Vous avez envie de vendre ? Je rachète vos cartes et vos collections après une
            estimation de leur état et de leur valeur sur le marché. On regarde ce que vous avez, on
            en parle, et vous décidez.
          </p>
          <a className="buyback-button" href="#proposer">
            Proposer ma collection <FiArrowRight aria-hidden="true" />
          </a>
          <p className="buyback-hero-note">
            Cartes à l’unité · Collections · Cartes gradées · Ancien
          </p>
        </div>
        <aside className="buyback-hero-aside" aria-label="Notre approche">
          <span className="buyback-aside-label">AVANT LE PRIX, VOTRE CARTE.</span>
          <FiLayers className="buyback-stack-icon" aria-hidden="true" />
          <h2>Chaque détail compte.</h2>
          <p>
            L’édition, la langue, l’état, la gradation : votre carte ne se résume pas à un prix
            affiché en ligne.
          </p>
          <div className="buyback-aside-rule" />
          <span>
            <FiCheck aria-hidden="true" /> Une estimation expliquée
          </span>
          <span>
            <FiCheck aria-hidden="true" /> Des conditions convenues ensemble
          </span>
          <span>
            <FiCheck aria-hidden="true" /> Votre accord avant de continuer
          </span>
        </aside>
      </section>

      <section className="buyback-section" aria-labelledby="offers-title">
        <p className="buyback-eyebrow">À CHAQUE COLLECTION, SA SOLUTION</p>
        <h2 id="offers-title">Vendre directement ou me confier la vente.</h2>
        <div className="buyback-offers">
          <article className="buyback-offer">
            <span className="buyback-tag">CARTES & COLLECTIONS</span>
            <h3>Le rachat direct</h3>
            <p className="buyback-rate">
              70 à 90 <span>%</span>
            </p>
            <p className="buyback-rate-caption">de la cote retenue après estimation</p>
            <p>
              Vous préférez vendre vos cartes ensemble plutôt que gérer chaque annonce et chaque
              acheteur ? Je vous propose un prix de rachat pour les cartes ou la collection que nous
              avons examinées.
            </p>
            <ul>
              <li>Cartes à l’unité, lots et collections.</li>
              <li>Le taux dépend des cartes, de leur état et du marché.</li>
              <li>Vous connaissez l’offre avant de vous décider.</li>
            </ul>
            <a href="#proposer">
              Me proposer des cartes <FiArrowRight aria-hidden="true" />
            </a>
          </article>
          <article className="buyback-offer buyback-offer-deposit">
            <span className="buyback-tag">SCELLÉS & CARTES</span>
            <h3>Le dépôt-vente</h3>
            <p className="buyback-rate">
              15 à 30 <span>%</span>
            </p>
            <p className="buyback-rate-caption">de commission sur le prix de vente</p>
            <p>
              Vous me confiez vos produits et je m’occupe de leur vente. Nous convenons ensemble du
              prix et de la commission avant le dépôt. Après la vente, votre part correspond au prix
              vendu, déduction faite de la commission convenue.
            </p>
            <ul>
              <li>Pour les produits scellés, je fonctionne en dépôt-vente.</li>
              <li>Cette formule est aussi possible pour vos cartes.</li>
              <li>La commission est fixée ensemble, entre 15 et 30 %.</li>
            </ul>
            <a href="#proposer">
              Parler d’un dépôt-vente <FiArrowRight aria-hidden="true" />
            </a>
          </article>
        </div>
      </section>

      <section className="buyback-method buyback-section" aria-labelledby="method-title">
        <div>
          <p className="buyback-eyebrow">UNE COTE, ÇA SE VÉRIFIE</p>
          <h2 id="method-title">
            L’état d’abord.
            <br />
            Le marché ensuite.
          </h2>
          <p>
            Un beau recto ne raconte pas toute l’histoire. Je regarde aussi le verso, les coins, les
            bords et la surface pour évaluer l’état de la carte. Puis je recherche des références de
            prix adaptées à ce que vous me proposez.
          </p>
        </div>
        <div className="buyback-references">
          <div>
            <FiSearch aria-hidden="true" />
            <div>
              <h3>Cardmarket, en général</h3>
              <p>
                Pour situer la carte sur le marché, en tenant compte de sa version, de sa langue et
                de son état.
              </p>
            </div>
          </div>
          <div>
            <FiShield aria-hidden="true" />
            <div>
              <h3>GCC, eBay & Vinted</h3>
              <p>
                Pour compléter l’estimation, notamment pour les cartes gradées et les cartes
                anciennes.
              </p>
            </div>
          </div>
          <p className="buyback-method-note">
            L’objectif : vous expliquer la cote retenue et l’offre qui en découle. Une annonce
            isolée ne suffit pas à déterminer la valeur de toute votre collection.
          </p>
        </div>
      </section>

      <section className="buyback-section" aria-labelledby="steps-title">
        <p className="buyback-eyebrow">COMMENT ÇA SE PASSE ?</p>
        <h2 id="steps-title">De vos premières photos à notre accord.</h2>
        <ol className="buyback-steps">
          <li>
            <span>01</span>
            <h3>Montrez-moi ce que vous avez</h3>
            <p>
              Envoyez une vue d’ensemble, quelques photos recto-verso et les informations utiles :
              séries, langues, quantité et éventuelles gradations.
            </p>
          </li>
          <li>
            <span>02</span>
            <h3>On affine l’estimation</h3>
            <p>
              J’examine les cartes et leur état, puis je recherche les prix de référence. Les photos
              permettent un premier échange ; l’offre se précise après vérification des cartes.
            </p>
          </li>
          <li>
            <span>03</span>
            <h3>Vous choisissez la formule</h3>
            <p>
              Rachat direct ou dépôt-vente pour les cartes ; dépôt-vente pour le scellé. Nous
              convenons du montant ou des conditions de vente avant de poursuivre.
            </p>
          </li>
          <li>
            <span>04</span>
            <h3>On formalise les conditions</h3>
            <p>
              Nous reprenons les articles et les conditions convenues dans un document, avec un
              exemplaire pour vous. Les modalités de remise et de règlement sont précisées ensemble.
            </p>
          </li>
        </ol>
      </section>

      <section className="buyback-contact" id="proposer" aria-labelledby="contact-title">
        <div>
          <p className="buyback-eyebrow">COMMENÇONS PAR VOTRE COLLECTION</p>
          <h2 id="contact-title">
            Un classeur qui dort ?<br />
            Une collection qui évolue ?
          </h2>
          <p>
            Pas besoin d’avoir déjà tout coté. Présentez-moi vos cartes ou vos scellés : nous
            verrons ensemble quelle formule vous convient.
          </p>
          <a className="buyback-button" href={proposal}>
            <FiMail aria-hidden="true" /> Envoyer ma proposition
          </a>
          <p className="buyback-contact-hint">
            Un e-mail prérempli s’ouvre. Ajoutez vos photos avant de l’envoyer.
          </p>
        </div>
        <div className="buyback-contact-details">
          <h3>Pour bien démarrer</h3>
          <ul>
            <li>Une photo de l’ensemble.</li>
            <li>Le recto et le verso des principales cartes.</li>
            <li>Les défauts visibles, sans les masquer.</li>
            <li>Votre localisation et la formule souhaitée.</li>
          </ul>
          <a href={`mailto:${legal.email}`}>{legal.email}</a>
          {legal.phone && (
            <a href={`tel:${legal.phone.replace(/\s/g, '')}`}>
              <FiPhone aria-hidden="true" /> {legal.phone}
            </a>
          )}
        </div>
      </section>

      <section className="buyback-faq buyback-section" aria-labelledby="faq-title">
        <h2 id="faq-title">Avant de me contacter</h2>
        <details>
          <summary>Est-ce que je peux proposer une collection entière ?</summary>
          <p>
            Oui. Vous pouvez me proposer une carte, un lot ou une collection complète. Une vue
            d’ensemble et des photos des pièces principales permettent de commencer l’échange.
          </p>
        </details>
        <details>
          <summary>Le rachat est-il toujours à 90 % de la cote ?</summary>
          <p>
            La reprise se situe entre 70 et 90 % de la cote retenue après estimation. Le taux et le
            montant proposés dépendent des cartes, de leur état et du marché. Ils vous sont
            communiqués avant votre accord.
          </p>
        </details>
        <details>
          <summary>Vous rachetez aussi les produits scellés ?</summary>
          <p>
            Pour le scellé, je propose du dépôt-vente. Nous fixons ensemble le prix et une
            commission de 15 à 30 % de la vente. Vous percevez votre part après la vente, selon les
            modalités convenues.
          </p>
        </details>
        <details>
          <summary>Puis-je mettre mes cartes en dépôt-vente ?</summary>
          <p>
            Oui, le dépôt-vente est aussi possible pour les cartes. Nous pouvons en discuter lors de
            l’estimation pour choisir la formule adaptée à votre collection.
          </p>
        </details>
      </section>
    </main>
  );
}
