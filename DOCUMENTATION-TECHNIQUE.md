# Note technique — site web et application iOS

**Statut : proposition d’architecture, aucune implémentation commencée.**

## Décisions confirmées depuis cette proposition

Le stockage objet utilise désormais un bucket privé Cloudflare R2 via son API S3, avec la région de signature `auto`. Les mentions de MinIO et de Docker Compose ci-dessous appartiennent à la proposition historique. La configuration actuelle est décrite dans le README et `apps/api/.env.example` : `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY`. Les fichiers transitent par l’API Hono authentifiée pour le téléversement et le téléchargement; les identifiants R2 restent côté serveur. Les objets existants doivent être copiés en conservant leurs clés avant la bascule. Ce changement ne modifie pas le stockage interne de Convex.

Le PRD v1 a depuis été révisé : Internet est requis sur web et iOS ; il n’y a pas de cache métier iOS ni de file de synchronisation différée. Expo/React Native remplace SwiftUI. Les deux clients utilisent l’API Hono commune ; aucun client n’appelle directement Convex. Convex est le stockage applicatif central, y compris pour les comptes et révocations, et Hono ne stocke pas de données applicatives dans SQLite. Les éléments ci-dessous décrivent la proposition d’origine et ne prévalent pas sur ces décisions.

## Objectif

Préparer un produit avec un site web et une application iOS, un backend Convex auto-hébergé, une authentification par cookie et JWT, le stockage de mots de passe avec Argon2id et MinIO pour les images.

## Architecture envisagée

- **Site web** : application web TypeScript/React. Le framework exact reste à choisir au démarrage.
- **Application iOS** : application native Swift/SwiftUI. Elle utilisera les mêmes fonctions métier Convex que le site.
- **Backend et API** : Convex auto-hébergé pour les données et fonctions métier, avec **Hono** comme routeur HTTP de l’API publique. Hono sera monté sur les HTTP Actions Convex (intégration Hono/Convex), afin que les routes HTTP appellent les fonctions métier Convex sans dupliquer les règles d’accès. Le backend Convex n’héberge pas le site web : celui-ci devra être déployé séparément. Si une dépendance Hono requiert un runtime Node.js non disponible dans les HTTP Actions, l’API Hono devra être un service séparé qui appelle Convex via son client serveur.
- **Données** : base Convex pour les données métier. Les fichiers image seront stockés dans MinIO, pas dans les documents Convex.
- **Développement local** : CLI Convex (`npx convex dev`) avec un backend local, plus MinIO local via Docker Compose. Lancer `convex dev` maintient le backend local actif pendant le développement. Les déploiements locaux Convex sont en bêta; l’alternative de développement cloud Convex devra être décidée si cette contrainte est gênante.

## Auto-hébergement Convex

Le déploiement devra prévoir les services backend Convex, dashboard Convex et frontend web, ainsi qu’un stockage persistant et des sauvegardes. Le guide officiel d’auto-hébergement utilise par défaut un stockage local SQLite; il décrit également des options SQL et S3 pour certains fichiers et index Convex. MinIO sera le stockage objet de l’application; sa compatibilité S3 ne signifie pas automatiquement qu’il remplace le stockage interne Convex sans configuration et validation spécifiques.

La configuration et les secrets nécessaires au backend auto-hébergé (URL publique, clé admin, secrets d’instance, paramètres de stockage) seront fournis par l’environnement de déploiement et ne seront jamais intégrés au dépôt ni exposés au client.

## Authentification

### Création de compte et connexion

1. Le client envoie les identifiants par HTTPS à une fonction serveur dédiée.
2. Le serveur normalise et valide l’adresse e-mail, puis calcule ou vérifie le mot de passe avec **Argon2id**. Le hash et ses paramètres sont stockés; le mot de passe brut ne l’est jamais.
3. Après authentification, le serveur émet un JWT signé, de courte durée, contenant uniquement les claims nécessaires (identifiant utilisateur, émetteur, audience, dates d’émission et d’expiration).
4. Pour le web, le JWT est placé dans un cookie `HttpOnly`, `Secure`, avec `SameSite=Lax` (ou `Strict` si le parcours le permet), limité au chemin et au domaine nécessaires. Le JavaScript du navigateur ne doit pas pouvoir lire le jeton.
5. Le client iOS conserve son jeton dans le Keychain et l’envoie comme bearer token; les cookies du navigateur ne sont pas le mécanisme de stockage iOS.

### Validation, expiration et déconnexion

Les fonctions serveur vérifient signature, algorithme autorisé, émetteur, audience et expiration pour chaque requête authentifiée. Prévoir une stratégie de rotation/renouvellement des jetons, révocation (par exemple version de session ou sessions persistées) et suppression du cookie à la déconnexion. Les mutations web doivent être protégées contre les requêtes CSRF; `SameSite` est une défense complémentaire, pas l’unique contrôle. Ajouter limitation des tentatives de connexion, erreurs non révélatrices et journalisation sans secrets.

L’intégration de cette authentification personnalisée avec Convex (notamment la validation des JWT par les clients web et iOS et le déploiement auto-hébergé) devra être vérifiée avec la version et les capacités retenues avant d’arrêter les interfaces. Ne pas confondre cette approche avec Convex Auth : le dépôt d’auto-hébergement indique que la CLI ne prend pas encore en charge les déploiements auto-hébergés pour Convex Auth.

## API HTTP et OpenAPI

Hono définit les routes versionnées (par exemple `/api/v1`) et les middlewares transverses : authentification, validation, CORS, limitation de débit et format d’erreur uniforme. Les schémas d’entrée et de sortie seront définis avec Zod et `@hono/zod-openapi`; ils serviront à la validation des requêtes et à générer le contrat **OpenAPI 3** à partir des routes. Publier le document JSON (par exemple `/openapi.json`) et une interface interactive de consultation (par exemple `/docs`), avec les schémas de réponses, codes d’erreur, paramètres d’authentification et exemples. La spécification devra être versionnée ou exportable en CI afin que le contrat puisse être comparé et consommé par les clients web et iOS.

## Tests d’intégration dès le départ

Les tests d’intégration font partie du socle initial du projet et valident les frontières réelles entre l’API Hono, Convex, l’authentification et MinIO. En local et en CI, démarrer des dépendances isolées (Convex auto-hébergé local et MinIO, typiquement via Docker Compose), appliquer le schéma/fonctions Convex, puis exécuter les tests contre ces services. Les tests unitaires seuls ou des mocks ne suffisent pas à valider ces parcours.

Parcours prioritaires à couvrir :

- inscription, connexion, hash Argon2id et refus des identifiants invalides;
- lecture/écriture authentifiée et refus des accès anonymes ou d’un utilisateur tiers;
- expiration, renouvellement, déconnexion/révocation du JWT et attributs du cookie web;
- refus des origines CORS non autorisées et des mutations web sans protection CSRF requise;
- upload d’image autorisé dans MinIO, métadonnées associées dans Convex, et refus des types/taille/droits invalides;
- réponses d’erreur et validation des payloads conformes au contrat OpenAPI;
- génération de `/openapi.json` et vérification de la validité du document généré.

Chaque test doit utiliser des données et identifiants éphémères, isoler ou nettoyer ses objets et enregistrements, et ne pas dépendre d’un service tiers partagé. CI doit échouer si la suite d’intégration ou la validation OpenAPI échoue. Le framework de test et l’orchestration CI seront choisis avec la stack web/serveur, en gardant la possibilité d’utiliser `app.request()` de Hono pour les tests ciblés de routes et un environnement Convex/MinIO réel pour l’intégration.

## Téléversement d’images avec MinIO

1. Le client demande au backend une autorisation de téléversement pour une image et un usage précis.
2. Le backend vérifie l’identité, les droits, le type MIME et la taille, puis génère une URL S3 présignée à durée courte (ou fait transiter le fichier par un endpoint contrôlé si les validations doivent se faire avant stockage).
3. Le client envoie l’image directement dans un bucket privé MinIO.
4. Le backend confirme/valide l’objet, puis enregistre dans Convex sa clé, son propriétaire, ses métadonnées et son état. Les URL présignées de lecture seront temporaires, ou les images passeront par une couche de diffusion contrôlée.

Configurer CORS de MinIO pour les seules origines nécessaires, des limites de taille, une liste de types acceptés, des noms d’objet non devinables, et des règles de suppression/nettoyage des uploads orphelins. Les clés d’accès MinIO restent exclusivement côté serveur. Prévoir une analyse de contenu si le risque produit l’exige.

## Environnements et configuration

Prévoir des configurations séparées pour local, préproduction et production. Chaque environnement dispose de ses propres secrets, base Convex, bucket MinIO et domaines autorisés. Fournir les paramètres via variables d’environnement ou gestionnaire de secrets; committer uniquement un fichier d’exemple sans valeur sensible. En production, imposer HTTPS, sauvegardes testées et surveillance de l’espace disque, des erreurs et de la disponibilité des services.

## Décisions à prendre avant implémentation

- Framework et hébergement du site web.
- Runtime et mode d’hébergement définitifs de l’API Hono (HTTP Actions Convex ou service Hono séparé).
- Version minimale d’iOS et choix de distribution.
- Emplacement et moteur de persistance Convex en production, politique de sauvegarde et de restauration.
- Format, durée et renouvellement des JWT; stratégie précise de révocation et de gestion multi-appareils.
- Politique de visibilité des images, limites d’upload, formats acceptés et éventuelle modération.
- Noms de domaines, origines CORS et gestion des secrets.

## Références

- [Convex — déploiements locaux pour le développement](https://docs.convex.dev/cli/local-deployments)
- [Convex — CLI](https://docs.convex.dev/cli/overview)
- [Convex Backend — guide d’auto-hébergement](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md)
- [Hono — tests](https://hono.dev/docs/guides/testing)
- [Hono — génération OpenAPI](https://hono.dev/examples/hono-openapi)
- [Convex — HTTP Actions](https://docs.convex.dev/functions/http-actions)
- [Convex — Hono avec Convex](https://stack.convex.dev/hono-with-convex)
