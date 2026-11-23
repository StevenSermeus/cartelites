import { useEffect, useState } from 'react';
import { FiArrowRight, FiMail, FiPhone } from 'react-icons/fi';
import { brand, BrandLogo, AppearanceControl } from './brand';
import { shopConfig } from '../../../shop.config';
import { SocialLinks } from './SocialLinks';
import { Button } from './components/ui/button';
import './public-information.css';

const legal = shopConfig.legal;
type PublicDestination = 'catalogue' | 'rachat' | 'depot' | 'boutique';
export function PublicNavigation({ active }: { active: PublicDestination }) {
  return <nav className="public-navigation" aria-label="Navigation du site">
    {([['catalogue','/convention','Le catalogue'],['rachat','/rachat','Rachat'],['depot','/depot-vente','Dépôt-vente'],['boutique','/boutique','La boutique']] as const).map(([key,href,label])=>
      <a key={key} href={href} aria-current={active===key?'page':undefined}>{label}</a>)}
    <SocialLinks />
  </nav>;
}
const journeys = {
  rachat: {
    title: 'Une nouvelle vie pour vos cartes.',
    description: 'Une carte, un classeur ou une collection : préparez votre proposition, découvrez notre estimation et choisissez en connaissance de cause.',
    steps: [
      ['Préparer', 'Présentez votre collection', 'Préparez une vue d’ensemble et des photos nettes du recto et du verso. Précisez les séries, les numéros complets, les langues, les quantités et les éventuelles gradations. Une carte promo absente d’un catalogue peut être identifiée manuellement.'],
      ['Estimer', 'Une estimation expliquée', 'L’édition, la langue, l’état et la gradation comptent. Nous examinons les cartes et comparons des références de marché pertinentes. Les photos permettent un premier échange ; l’offre se précise après vérification des cartes.'],
      ['Confirmer', 'Vous décidez de vendre', 'Vous connaissez le montant proposé avant de vous engager. Pour les cartes, le rachat se situe entre 70 et 90 % de la cote retenue selon les articles, leur état et le marché. Ce taux indicatif ne constitue pas une offre pour votre collection.'],
      ['Signer', 'Relisez et conservez votre document', 'Vérifiez l’inventaire, les montants et vos coordonnées sur le bordereau avant de signer avec le représentant de la boutique. Un exemplaire PDF est remis par téléchargement ou email. Les originaux signés sont conservés ; une correction donne lieu à une nouvelle version.'],
    ],
  },
  depot: {
    title: 'Vos cartes. Notre vitrine.',
    description: 'Confiez vos cartes ou vos produits scellés à la boutique, avec un inventaire et des conditions convenus ensemble.',
    steps: [
      ['Préparer', 'Identifiez les articles confiés', 'Préparez la liste des articles, leurs références et leur état, avec des photos et les certificats de gradation éventuels. Les produits scellés sont proposés en dépôt-vente ; cette formule est également possible pour les cartes.'],
      ['Convenir', 'Des conditions explicites', 'Nous convenons du prix, de la commission, de la durée et des conditions de restitution avant le dépôt. La commission est fixée ensemble entre 15 et 30 % du prix de vente. Aucun pourcentage affiché ici ne constitue un contrat.'],
      ['Signer', 'Vérifiez le contrat et l’inventaire', 'Relisez les conditions et la liste des articles avant de signer. Vous recevez votre exemplaire du document. Une modification des conditions crée une nouvelle version avec les signatures requises.'],
      ['Suivre', 'Ventes, reversements et restitutions', 'La boutique suit les articles disponibles, vendus et restitués. Après vente, votre part correspond au prix vendu déduction faite de la commission convenue. Les reversements, y compris partiels, et les restitutions sont documentés selon les conditions de votre accord.'],
    ],
  },
};
export default function BuybackPage({ kind='rachat' }: {kind?:'rachat'|'depot'}) {
  const [step,setStep]=useState(0);
  const journey=journeys[kind];
  const proposal=`mailto:${legal.email}?${new URLSearchParams({subject:`${kind==='rachat'?'Rachat':'Dépôt-vente'} — ${brand.name}`,body:'Bonjour,\n\nJe souhaite vous proposer :\n- Cartes / collection / produits scellés :\n- Séries, langues et quantité :\n- État général / gradations :\n- Ma localisation :\n\nJe joins des photos recto-verso.\n\nMerci !'}).toString().replace(/\+/g,'%20')}`;
  useEffect(()=>{document.title=`${kind==='rachat'?'Rachat':'Dépôt-vente'} | ${brand.name}`;setStep(0);},[kind]);
  return <main className="public-information-page">
    <PublicNavigation active={kind}/><AppearanceControl/>
    <header className="public-information-heading"><BrandLogo decorative/><p>{kind==='rachat'?'Rachat de cartes':'Dépôt-vente'}</p><h1>{journey.title}</h1><p>{journey.description}</p></header>
    <section className="public-journey" aria-label="Les étapes en boutique">
      <ol className="public-journey-steps">{journey.steps.map(([label],index)=><li key={label}><Button variant={step===index?'default':'secondary'} aria-current={step===index?'step':undefined} aria-controls="journey-step" onClick={()=>setStep(index)}>{index+1}. {label}</Button></li>)}</ol>
      <div id="journey-step" className="public-journey-content" aria-live="polite"><p className="public-step-count">Étape {step+1} sur {journey.steps.length}</p><h2>{journey.steps[step][1]}</h2><p>{journey.steps[step][2]}</p></div>
      <div className="public-journey-actions"><Button variant="secondary" disabled={step===0} onClick={()=>setStep(step-1)}>Précédent</Button>{step<journey.steps.length-1?<Button onClick={()=>setStep(step+1)}>Étape suivante <FiArrowRight aria-hidden="true"/></Button>:<Button asChild><a href={proposal}><FiMail aria-hidden="true"/>Proposer ma collection</a></Button>}</div>
    </section>
    <section className="public-information-faq"><h2>Avant de nous contacter</h2>
      <details><summary>Comment la cote est-elle évaluée ?</summary><p>Nous prenons en compte la version, la langue, l’état et la gradation. Cardmarket, GCC, eBay et Vinted peuvent fournir des références complémentaires lorsqu’elles sont disponibles. Une annonce isolée ne suffit pas à établir une valeur ; un prix affiché n’est pas nécessairement un prix de vente réalisé.</p></details>
      <details><summary>Peut-on acheter ou réserver en ligne ?</summary><p>Le catalogue présente le stock disponible. La consultation ne réserve pas un article et ce site ne propose pas de paiement en ligne. Contactez la boutique avec sa référence.</p></details>
      <details><summary>Comment conserver mon document ?</summary><p>Conservez l’exemplaire PDF remis après signature. Pour obtenir une copie ou corriger des informations, contactez la boutique en indiquant la référence du document.</p></details>
    </section>
    <div className="public-information-links"><a href="/boutique">Contacter la boutique</a><a href={kind==='rachat'?'/depot-vente':'/rachat'}>{kind==='rachat'?'Découvrir le dépôt-vente':'Découvrir le rachat'}</a><a href="/convention">Explorer les cartes</a></div>
  </main>;
}
export function ShopPage() {
  useEffect(()=>{document.title=`La boutique | ${brand.name}`;},[]);
  return <main className="public-information-page"><PublicNavigation active="boutique"/><AppearanceControl/>
    <header className="public-information-heading"><BrandLogo decorative/><p>La boutique</p><h1>Parlons de votre collection.</h1><p>Une question sur une carte, un rachat ou un dépôt ? Préparez la référence du produit pour faciliter l’échange.</p></header>
    <section className="public-shop-contact" aria-labelledby="shop-contact"><h2 id="shop-contact">{brand.name}</h2><address>{legal.address}<br/>{legal.country}</address><p><a href={`mailto:${legal.email}`}><FiMail aria-hidden="true"/>{legal.email}</a></p>{legal.phone&&<p><a href={`tel:${legal.phone.replace(/[^+\d]/g,'')}`}><FiPhone aria-hidden="true"/>{legal.phone}</a></p>}<p>Confirmez les horaires et les modalités de rendez-vous directement auprès de la boutique.</p></section>
    <div className="public-information-links"><a href="/convention">Explorer les cartes</a><a href="/rachat">Préparer un rachat</a><a href="/depot-vente">Préparer un dépôt</a></div>
  </main>;
}
