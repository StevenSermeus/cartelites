import { useEffect } from 'react';
import { brand } from './brand';
import { legal, legalReady } from './lib/shopLegal';
import { SocialLinks } from './SocialLinks';

export const legalPages = {
  '/mentions-legales': 'Mentions légales',
  '/confidentialite': 'Confidentialité',
  '/cookies': 'Cookies',
};
export type LegalPath = keyof typeof legalPages;
const information = (value: string) => value.trim() || 'À renseigner par l’exploitant.';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <strong>{brand.name}</strong>
          {legal.companyName && legal.companyName !== brand.name && (
            <p>Une enseigne de {legal.companyName}</p>
          )}
          <p>
            © {new Date().getFullYear()} {legal.companyName || brand.name}
          </p>
          <SocialLinks />
        </div>
        <nav aria-label="Informations et contact">
          <a href="/rachat">Rachat</a>
          <a href="/depot-vente">Dépôt-vente</a>
          <a href="/boutique">La boutique</a>
          {Object.entries(legalPages).map(([path, title]) => (
            <a key={path} href={path}>
              {title}
            </a>
          ))}
          <a href={legal.email ? `mailto:${legal.email}` : '/mentions-legales#contact'}>Contact</a>
        </nav>
        {!legalReady && (
          <p className="legal-pending">Informations légales en cours de finalisation.</p>
        )}
      </div>
    </footer>
  );
}

function LegalNotice() {
  return (
    <>
      <h2>Éditeur du site</h2>
      {legal.companyName && legal.companyName !== brand.name && (
        <p>
          {brand.name} est le nom commercial utilisé par {legal.companyName} pour son activité de
          cartes de collection.
        </p>
      )}
      <dl className="legal-details">
        {[
          ['Nom commercial', brand.name],
          ['Dénomination légale', legal.companyName],
          ['Forme juridique', legal.legalForm],
          ['Pays', legal.country],
          ['Numéro d’entreprise / immatriculation', legal.registration],
          ['TVA', legal.vatNumber],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{information(value)}</dd>
          </div>
        ))}
      </dl>
      <h2 id="contact">Contact</h2>
      <p>
        E-mail :{' '}
        {legal.email ? <a href={`mailto:${legal.email}`}>{legal.email}</a> : information('')}
      </p>
      <p>
        Téléphone :{' '}
        {legal.phone ? (
          <a href={`tel:${legal.phone.replace(/[^+0-9]/g, '')}`}>{legal.phone}</a>
        ) : (
          information('')
        )}
      </p>
      <h2>Hébergement</h2>
      <p>{information(legal.hostName)}</p>
      <p>{information(legal.hostAddress)}</p>
      <p><a href={legal.hostContact}>Coordonnées et contact de l’hébergeur</a></p>
      <h3>Documents PDF et images</h3>
      <p>{legal.storageProvider}</p>
      <p><a href="https://developers.cloudflare.com/r2/reference/data-location/">Localisation des données Cloudflare R2</a></p>
      <h3>Base de données</h3>
      <p>{legal.databaseProvider}</p>
      <p><a href="https://docs.convex.dev/production/regions">Régions d’hébergement Convex</a></p>
      <h2>Présentation du service</h2>
      <p>
        {brand.name} présente un catalogue de cartes et propose un espace de gestion des stocks,
        rachats et ventes. Le catalogue public ne permet pas de passer commande ou de payer en
        ligne.
      </p>
      <h2>Marques et contenus</h2>
      <p>
        Les marques, illustrations de cartes et logos de certification appartiennent à leurs
        titulaires respectifs. Leur présentation ne signifie pas que ces titulaires parrainent ou
        approuvent ce site.
      </p>
      {legal.additionalDisclosures && (
        <>
          <h2>Informations complémentaires</h2>
          <p>{legal.additionalDisclosures}</p>
        </>
      )}
    </>
  );
}

function PrivacyNotice() {
  return (
    <>
      <h2>Responsable du traitement</h2>
      <p>
        {information(legal.companyName)} — {information(legal.country)}
      </p>
      <p>
        Contact relatif aux données personnelles :{' '}
        {legal.privacyEmail ? (
          <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>
        ) : (
          information('')
        )}
      </p>
      <h2>Données et finalités</h2>
      <ul>
        <li>
          Comptes : adresse e-mail, prénom, nom et qualité du signataire renseignés dans les
          paramètres, empreinte du mot de passe, informations de session et demandes de
          réinitialisation, pour ouvrir et sécuriser l’accès au service. L’e-mail et le mot de passe
          sont nécessaires à la création du compte.
        </li>
        <li>
          Opérations : identité et coordonnées des personnes renseignées par les utilisateurs,
          cartes, prix, dates, achats, ventes, photos et justificatifs, pour gérer le stock et
          conserver la provenance des biens. Le nom du vendeur est requis pour une fiche client ;
          les coordonnées complémentaires et l’identité de l’acheteur final sont facultatives dans
          l’application.
        </li>
        <li>
          Navigation : adresse IP et informations techniques transmises aux serveurs lors des
          requêtes, pour fournir le site et ses ressources.
        </li>
      </ul>
      <p>
        Les données de compte sont fournies par leur titulaire. Les données des vendeurs et
        acheteurs peuvent être saisies par l’utilisateur qui enregistre une opération. Le catalogue
        public affiche les cartes et leur prix, sans les fiches clients ni les justificatifs privés.
      </p>
      <h2>Bases légales</h2>
      {information(legal.legalBases).split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      <h2>Destinataires et prestataires</h2>
      <p>
        Les personnes autorisées à gérer le compte accèdent aux données de ce compte. Des
        prestataires techniques peuvent traiter des données pour l’hébergement, le stockage et
        l’envoi des e-mails transactionnels, notamment les réinitialisations de mot de passe, les documents signés et les tickets de vente.
      </p>
      <p>{information(legal.processors)}</p>
      <p>
        Les recherches de cartes sollicitent TCGdex. Certaines images et certains logos sont chargés
        depuis des serveurs tiers (notamment TCGdex, Shopify, Collect Aura, PCA et CCC). Lors de ces
        chargements, ces serveurs reçoivent notamment l’adresse IP et des informations de requête du
        navigateur.
      </p>
      <h2>Transferts internationaux</h2>
      <p>{information(legal.transfers)}</p>
      <h2>Durées de conservation</h2>
      {information(legal.retention).split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      <h2>Vos droits</h2>
      <p>
        Selon les conditions prévues par le RGPD, vous pouvez demander l’accès, la rectification,
        l’effacement, la limitation du traitement et la portabilité de vos données, ou vous opposer
        à certains traitements. Si un traitement repose sur votre consentement, vous pouvez le
        retirer pour l’avenir. Certaines obligations de conservation peuvent limiter l’effacement.
      </p>
      <p>
        Adressez votre demande au contact relatif aux données personnelles indiqué ci-dessus. Vous
        pouvez également introduire une réclamation auprès de l’
        <a href={legal.authorityUrl}>{legal.authorityName}</a>, ou de l’autorité de contrôle
        compétente de votre lieu de résidence ou de travail.
      </p>
      <p>
        L’application ne met pas en œuvre de décision automatisée produisant des effets juridiques
        sur les personnes.
      </p>
      <p>
        Pour le stockage dans votre navigateur, consultez la{' '}
        <a href="/cookies">politique relative aux cookies</a>.
      </p>
    </>
  );
}

function CookieNotice() {
  return (
    <>
      <h2>Cookies de connexion et de sécurité</h2>
      <p>
        L’application utilise deux cookies nécessaires à l’espace connecté. Ils sont définis par le
        service de cette instance lors de l’authentification.
      </p>
      <dl className="legal-details">
        <div>
          <dt>session</dt>
          <dd>
            Maintient votre authentification. Ce cookie est inaccessible au JavaScript de la page
            (HttpOnly).
          </dd>
        </div>
        <div>
          <dt>csrf</dt>
          <dd>
            Contribue à protéger les opérations contre les requêtes frauduleuses provenant d’un
            autre site.
          </dd>
        </div>
        <div>
          <dt>Durée</dt>
          <dd>
            {information(legal.cookieLifetime)} Les cookies sont supprimés lors de la déconnexion
            réussie et remplacés lors du renouvellement de session.
          </dd>
        </div>
      </dl>
      <p>
        Ces cookies servent au fonctionnement du service demandé et ne nécessitent pas de
        consentement préalable lorsqu’ils restent strictement nécessaires à cette finalité.
      </p>
      <h2>Mesure d’audience et publicité</h2>
      <p>
        Le code de cette application n’intègre pas d’outil de mesure d’audience ni de cookie
        publicitaire. Les ressources externes sont décrites dans la{' '}
        <a href="/confidentialite">politique de confidentialité</a>. Toute modification du
        déploiement ou ajout de traceurs doit faire l’objet d’une nouvelle vérification et, si
        nécessaire, d’un recueil du consentement avant leur activation.
      </p>
      <h2>Supprimer ou bloquer les cookies</h2>
      <p>
        Vous pouvez supprimer les cookies dans les paramètres de votre navigateur ou vous
        déconnecter de l’application. Bloquer les cookies de session peut empêcher l’accès à
        l’espace de gestion ; le catalogue public reste accessible sans connexion.
      </p>
    </>
  );
}

export function LegalPage({ path }: { path: LegalPath }) {
  useEffect(() => {
    document.title = `${legalPages[path]} · ${brand.name}`;
  }, [path]);
  return (
    <main className="legal-page">
      <a href="/convention">← Catalogue {brand.name}</a>
      <span aria-hidden="true"> · </span>
      <a href="/">Espace de gestion</a>
      <h1>{legalPages[path]}</h1>
      {legal.updatedAt && <p>Dernière mise à jour : {legal.updatedAt}</p>}
      {!legalReady && (
        <p className="legal-draft" role="note">
          Document en cours de préparation : les informations de l’exploitant et les modalités du
          déploiement doivent être complétées et vérifiées avant la mise en ligne publique.
        </p>
      )}
      <article className="panel">
        {path === '/mentions-legales' ? (
          <LegalNotice />
        ) : path === '/confidentialite' ? (
          <PrivacyNotice />
        ) : (
          <CookieNotice />
        )}
      </article>
    </main>
  );
}
