# Personnaliser une instance web

L’identité de l’instance est définie dans `branding/brand.ts`. Elle est utilisée par la connexion, l’espace de gestion, le catalogue public, les métadonnées HTML et l’auteur des exports Excel.

Pour livrer l’application à un autre client :

1. Modifier `name`, `tagline`, `catalogueLabel` et `description` dans `brand.ts`.
2. Remplacer `branding/logo.png` par son logo PNG. Il est affiché sans recadrage et sert aussi de favicon.
3. Modifier `colors` dans `brand.ts` : `primary` et `primaryHover` pour les actions, `onPrimary` pour leur texte, `accent` pour les touches de couleur, `soft` pour les fonds teintés, `canvas` pour le fond de page, `surface` pour les panneaux, `ink` et `muted` pour les textes, `border` pour les séparations. Les états utilisent `success`, `warning` et `danger`.
4. Exécuter `pnpm --filter @tcg-marge/web typecheck` puis `pnpm --filter @tcg-marge/web build` et déployer le résultat.

Choisir des paires de couleurs lisibles : `onPrimary` sur `primary`/`primaryHover`, et `ink`/`muted` sur `surface`/`canvas`. La palette Cartélites conserve des boutons bruns avec texte blanc pour le contraste ; l’or sert d’accent. Les couleurs des certificateurs restent celles de leurs marques.

Les composants utilisent des variables CSS sémantiques `--brand-*`, injectées depuis cette configuration. Ne pas coder le nom du client ou ses couleurs directement dans les écrans. La configuration est propre au déploiement, pas au navigateur de chaque utilisateur ; sa modification nécessite une nouvelle compilation en production.

L’application mobile reste commune à toutes les instances et n’importe pas cette configuration. Le choix de l’URL d’instance dans le mobile est une fonctionnalité distincte. Les mentions métier de marge ou de TVA restent dans les données et calculs comptables, sans servir de nom à l’application web.

## Informations légales de chaque instance

Le footer est commun à la connexion, à l’administration, au catalogue et aux pages publiques `/mentions-legales`, `/confidentialite` et `/cookies`. Ces pages ne demandent pas de connexion. Configurer l’hébergeur web pour servir `index.html` sur ces routes, comme pour les routes `/admin/*` existantes.

Renseigner `branding/legal.ts` avec les informations réelles de l’exploitant. Le contexte initial du projet est belge : confirmer le pays et adapter l’autorité de contrôle et les mentions au pays et au statut de l’entreprise. Les champs vides sont affichés comme manquants, et le document reste marqué en préparation tant que les champs requis ne sont pas renseignés et `reviewed` ne vaut pas `true`. Ce marqueur est un état éditorial, pas une certification juridique.

La politique doit correspondre au déploiement : préciser les prestataires réellement utilisés (application, base de données, fichiers, e-mails), leur localisation, les éventuels transferts hors EEE et les garanties, les bases légales et les durées par catégorie de données. La durée des cookies doit correspondre à `JWT_TTL_SECONDS` de l’API (900 secondes par défaut, configurable). Documenter aussi les archives et sauvegardes ; remplir un texte ne met pas en place une purge automatique.

Le code actuel utilise les cookies `session` et `csrf`, sans outil d’analytics intégré. Vérifier aussi les ajouts de l’hébergeur et les ressources externes avant publication. Tout ajout de traceurs non nécessaires nécessite une analyse et, le cas échéant, un mécanisme de consentement qui bloque leur activation avant accord. Le footer n’ajoute pas de bannière de consentement factice.

Après validation des informations et des textes, renseigner `updatedAt`, passer `reviewed` à `true`, recompiler et déployer. Les obligations de vente à distance (conditions de vente, rétractation, etc.) devront être réévaluées si une commande ou un paiement en ligne est ajouté au catalogue.

Références consultées :
- SPF Économie : https://news.economie.fgov.be/203681-informations-obligatoires-sur-le-site-web-de-votre-entreprise/
- APD, cookies : https://www.autoriteprotectiondonnees.be/professionnel/themes/internet/cookies
- RGPD, information des personnes : https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3

### Marque commerciale et exploitant légal

Ces deux identités sont indépendantes : `brand.name` est le nom visible de l’application et du catalogue (Cartélites), tandis que `legal.companyName` est l’entreprise exploitante (WDEE). Le footer explique leur relation lorsque les noms diffèrent. Les coordonnées, numéros d’entreprise et de TVA, ainsi que le contact confidentialité appartiennent à l’exploitant. Pour une autre entreprise, modifier ces configurations sans changer les composants ; si les deux noms sont identiques, la mention « Une enseigne de » est automatiquement omise.

### Bloc société des bordereaux de rachat web

Les PDF reprennent `companyName`, `legalForm`, `address`, `country`, `registration`, `vatNumber`, `email` et, si renseigné, `website` depuis `legal.ts`, avec le nom commercial depuis `brand.ts`. Les champs manquants sont explicitement indiqués « A renseigner », sauf le site internet facultatif qui est omis lorsqu’il est vide. Aucune information bancaire n’est affichée. Le bloc société est répété sur chaque page ; la pagination tient compte des coordonnées et des descriptions de cartes pour préserver les totaux et signatures.

L’application mobile commune n’importe pas ces valeurs d’instance. Son générateur de reçu reste inchangé ; l’identité société devra lui être fournie par l’instance pour y reprendre ce bloc sans personnaliser le binaire mobile.


### Apparence du PDF et signataire par compte

Le bordereau web réutilise automatiquement `branding/logo.png` et `brand.colors` (couleurs hexadécimales `#RRGGBB`). Le logo est incorporé au PDF, sans dépendance réseau à son ouverture, et conservé dans ses proportions. Le bandeau, les en-têtes de tableau, les lignes alternées, le total et les zones de signature suivent la palette. Changer le logo ou le thème puis reconstruire l’application suffit pour une autre instance.

Dans **Paramètres → Votre signature sur les bordereaux**, chaque utilisateur enregistre son prénom, son nom et sa qualité. Ce profil est stocké sur son compte dans Convex, via `GET/PATCH /auth/profile` authentifiés. Le serveur déduit le compte depuis la session ; le navigateur ne choisit pas un identifiant de compte. Les comptes existants ont initialement des champs vides, affichés « À renseigner » dans le PDF.

La zone « Acheteur · Société » utilise ce profil ; la zone « Vendeur · Client » utilise le nom de la fiche client. Les signatures restent manuscrites : aucune signature n’est générée. Un téléchargement utilise le profil courant du compte connecté, y compris pour un ancien rachat ; il ne constitue pas un archivage immuable des noms au jour de l’opération. Déployer les fonctions et le schéma Convex ainsi que l’API avec cette version du web.
