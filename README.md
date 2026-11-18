# TVA sur marge — Belgique

Monorepo `pnpm` pour le suivi de provenance, des rachats, ventes et stock, avec application Expo iOS, web React et backend Hono/Convex.

## Applications et packages

- `apps/mobile` — Expo / React Native, SecureStore pour le jeton iOS ; les données métier viennent du serveur.
- `apps/web` — React / Vite, accès via cookie `HttpOnly` et export `.xlsx`.
- `apps/api` — API Hono versionnée, auth Argon2id/JWT, OpenAPI et relais authentifié vers Convex.
- `convex` — schéma et fonctions métier transactionnelles.
- `packages/domain` — schémas Zod et règles métier sans dépendance à l’interface.

Web et iOS passent par l’API Hono commune ; celle-ci applique l’authentification et transmet les mutations métier à Convex. L’application iOS ne conserve pas de cache métier ni de file hors ligne. Sans Internet, elle affiche une erreur et ne confirme pas l’enregistrement. Les comptes, empreintes de mot de passe, limites de connexion et révocations sont également stockés dans Convex ; Hono ne possède pas de base SQLite.

## Installer et lancer

Utiliser pnpm 9.15.4, puis installer les dépendances :

```sh
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

Configurer `apps/api/.env` à partir de `.env.example`. Définir l’URL Convex, le secret partagé de service Convex, l’émetteur JWT, l’audience et une paire de clés RS256 pour l’API et `convex/auth.config.ts`. Le même secret de service doit être défini dans l’environnement Convex. Les clés restent dans l’environnement et ne sont jamais commitées. Configurer `WEB_ORIGIN` et `COOKIE_SECURE` selon le mode local ou HTTPS.

Générer un secret de service avec `openssl rand -base64 32`, le mettre dans `CONVEX_AUTH_SECRET` côté Hono et Convex, puis démarrer MinIO local. Le compte MinIO racine ne doit servir qu’au développement ; en production, fournir un compte limité au bucket privé. Pour le courriel de réinitialisation, configurer `RESEND_API_KEY` et `RESET_FROM_EMAIL` côté Hono.

Pour MinIO en local : copier `.env.docker.example` vers `.env.docker`, puis lancer `pnpm dev:minio`. La console MinIO est disponible sur le port 9001. Créer dans cette console le bucket privé indiqué par `MINIO_BUCKET` (par défaut `tcg-marge-private`) avant de téléverser un justificatif. Les variables `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY` et `MINIO_SECRET_KEY` dans `apps/api/.env` doivent correspondre à ce service. Le registre public ne fournit plus l’image communautaire MinIO officielle ; l’image Bitnami locale est figée et réservée au développement. Avant une mise en production, fournir une image MinIO/AIStor maintenue et autorisée dans `MINIO_IMAGE`, ainsi que les identifiants de registre et une licence si nécessaire.

Configurer `apps/mobile/.env.local` à partir de son `.env.example`. Sur un appareil physique, `EXPO_PUBLIC_API_URL` doit désigner une adresse HTTPS accessible depuis l’iPhone.

Commandes du workspace :

```sh
pnpm dev:convex
pnpm dev:api
pnpm dev:web
pnpm dev:mobile
pnpm typecheck
pnpm check
```

Pour remplir le Convex local avec des données de démonstration (clients, rachats sur plusieurs dates, cartes gradées, ventes et rachats en attente), démarrez l’API et définissez les identifiants du compte vendeur local :

```sh
DEMO_SEED_EMAIL=demo@tcg-marge.test DEMO_SEED_PASSWORD='mot-de-passe-local' pnpm --filter @tcg-marge/api seed:demo
```

Le seed ajoute 50 clients, 200 rachats de 5 cartes chacun et des ventes. Il est relançable sans doublonner et refuse une API ou un Convex qui ne sont pas en loopback local. Les nombres peuvent être ajustés avec `DEMO_CLIENTS`, `DEMO_PURCHASES`, `DEMO_CARDS_PER_PURCHASE` et `DEMO_SELL_EVERY`. Il ne supprime aucune donnée.

La recette complète requiert un déploiement Convex de développement, MinIO local et un fournisseur d’e-mails configuré pour vérifier la réinitialisation du mot de passe.

## Conventions de code

Les couches restent séparées : écrans et composants présentent l’interface, le repository API gère les appels réseau, le package `domain` porte les contrats et règles communes, et les fonctions Convex contrôlent les invariants métier côté serveur. Les montants sont stockés en centimes et les dates Unix en millisecondes.

Biome formate et contrôle le code TypeScript/TSX, CSS et les fichiers JSON ciblés. Les documents Markdown de cadrage sont exclus du formatage automatique.

## État et décisions restant à prendre

Les flux de compte, rachats, ventes, stock, export Excel, conflits en ligne, justificatifs MinIO et récupération de compte sont implémentés. Le produit exige une connexion Internet active et n’offre pas de mode hors ligne. La recette fonctionnelle nécessite un déploiement Convex de développement, l’API et le web configurés, le bucket MinIO créé et un fournisseur de courriel configuré pour vérifier la récupération de compte. La mise en production reste conditionnée par des secrets et domaines HTTPS réels, une politique de sauvegarde/restauration, la supervision, une image de stockage maintenue et autorisée, ainsi que la validation de la distribution iOS.
