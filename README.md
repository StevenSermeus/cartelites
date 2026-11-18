# TVA sur marge — Belgique

Monorepo `pnpm` pour le suivi de provenance, des rachats, ventes et stock, avec application Expo iOS, web React et backend Hono/Convex.

## Applications et packages

- `apps/mobile` — Expo / React Native, SecureStore pour le jeton iOS ; les données métier viennent du serveur.
- `apps/web` — React / Vite, accès via cookie `HttpOnly` et export `.xlsx`.
- `apps/api` — API Hono versionnée, auth Argon2id/JWT, OpenAPI et relais authentifié vers Convex.
- `convex` — schéma et fonctions métier transactionnelles.
- `packages/domain` — schémas Zod et règles métier sans dépendance à l’interface.

Web et iOS passent par l’API Hono commune ; celle-ci applique l’authentification et transmet les mutations métier à Convex. L’application iOS ne conserve pas de cache métier ni de file hors ligne. Sans Internet, elle affiche une erreur et ne confirme pas l’enregistrement. Les comptes, empreintes de mot de passe, limites de connexion et révocations sont également stockés dans Convex ; Hono ne possède pas de base SQLite.

## Déployer avec Docker Compose

Le fichier `docker-compose.yml` utilise Convex Cloud et R2 existants. Il ne crée ni projet Convex ni bucket. Les images sont construites depuis le dépôt avec le `Dockerfile` racine ; le site est compilé par Vite puis servi par Nginx, et Hono tourne avec Node en mode production.

1. Copier `.env.docker.example` vers `.env.docker` et renseigner les valeurs de production. Utiliser une **clé de déploiement du déploiement Production Convex** dans `CONVEX_DEPLOY_KEY`, avec les droits de déploiement et de modification des variables, et son URL correspondante dans `CONVEX_URL`.
2. Définir `WEB_ORIGIN=https://domain-name.be` et `JWT_ISSUER=https://api.domain-name.be` (sans slash final). La construction du site utilise `JWT_ISSUER` comme URL publique de l’API. Le navigateur appelle donc directement `https://api.domain-name.be/api/v1/...` ; Nginx sert uniquement le site. Hono autorise cette origine web avec les cookies via CORS.
3. Renseigner le secret partagé `CONVEX_AUTH_SECRET`, les clés RSA, R2 et éventuellement Resend. Pour les PEM dans `.env.docker`, utiliser une valeur entre apostrophes avec des séparateurs `\n` littéraux. Ne pas partager ce fichier.
4. Configurer le reverse proxy HTTPS externe : `domain-name.be` vers `http://127.0.0.1:8080` et `api.domain-name.be` vers `http://127.0.0.1:3001`. Le proxy de l’API doit transmettre tous les chemins, notamment `/.well-known/jwks.json`, et accepter la taille des pièces jointes. Les ports et adresses d’écoute sont configurables via `WEB_PORT`, `API_PORT`, `WEB_BIND_IP` et `API_BIND_IP`. Si le proxy est un autre conteneur, le connecter au réseau Compose et cibler `web:80` / `api:3001` ; son `localhost` n’est pas celui de l’hôte.

Lancer depuis la racine, après configuration :

```sh
docker compose --env-file .env.docker up -d --build --force-recreate
docker compose --env-file .env.docker ps -a
docker compose --env-file .env.docker logs convex-deploy
```

Le service ponctuel `convex-deploy` synchronise `JWT_ISSUER`, `JWT_AUDIENCE`, `CONVEX_AUTH_SECRET` et les clés publiques JWKS, puis déploie les fonctions et le schéma. Il ne reçoit pas la clé RSA privée. Le JWKS public est intégré à la configuration Convex via `JWT_JWKS`, ce qui permet ce premier déploiement avant le démarrage de Hono. Hors Compose, cette variable est facultative : son absence conserve l’URL JWKS dérivée de l’émetteur. Une rotation de la paire RSA nécessite de relancer le déploiement.

Les services `api` et `web` ont tous deux `depends_on: convex-deploy` avec `condition: service_completed_successfully`. Un échec du déploiement bloque leur démarrage. Nginx attend aussi le healthcheck de l’API. Le service Convex qui reste à l’état `Exited (0)` est normal. Les images peuvent se construire avant le job : cette dépendance porte sur le démarrage des conteneurs. Aucun TLS n’est terminé dans ces conteneurs ; les cookies restent `Secure` puisque l’accès public est HTTPS.

Pour chaque nouvelle version, répéter la commande `up` ci-dessus : `--force-recreate` force aussi une nouvelle exécution du job Convex. Un simple `restart` ne reconstruit pas les images et ne constitue pas un déploiement. La clé de déploiement reste réservée au job et aucun secret n’est injecté dans le build du site. Le déploiement distant Convex n’est pas annulé automatiquement si un service local échoue ensuite. L’application mobile se distribue séparément et utilise `https://api.domain-name.be` comme adresse d’instance.

## Installer et lancer

Utiliser pnpm 9.15.4, puis installer les dépendances :

```sh
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

Configurer `apps/api/.env` à partir de `.env.example`. Définir l’URL Convex, le secret partagé de service Convex, l’émetteur JWT, l’audience et une paire de clés RS256 pour l’API. Dans les variables du déploiement Convex, définir `JWT_ISSUER` et `JWT_AUDIENCE` avec les mêmes valeurs que côté Hono : `convex/functions/auth.config.ts` les lit automatiquement. Sans ces variables, les valeurs locales sont `http://127.0.0.1:3001` et `tcg-marge-clients`. Le même secret de service doit être défini dans l’environnement Convex. Les clés restent dans l’environnement de l’API et ne sont jamais commitées. Configurer `WEB_ORIGIN` et `COOKIE_SECURE` selon le mode local ou HTTPS.

En production, définir explicitement `JWT_ISSUER=https://api.ton-domaine.fr` et `JWT_AUDIENCE=tcg-marge-clients` dans les paramètres du déploiement Production Convex et dans l’environnement Hono. L’URL JWKS est dérivée de l’émetteur (`https://api.ton-domaine.fr/.well-known/jwks.json`) et doit être accessible publiquement. Les variables de `apps/api/.env` ne sont pas automatiquement transmises à Convex. Après configuration, déployer avec `pnpm --filter @tcg-marge/backend exec convex deploy`.

Générer un secret de service avec `openssl rand -base64 32`, le mettre dans `CONVEX_AUTH_SECRET` côté Hono et Convex. Pour les justificatifs, créer un bucket privé Cloudflare R2 et des identifiants S3 limités à ce bucket. Pour le courriel de réinitialisation, configurer `RESEND_API_KEY` et `RESET_FROM_EMAIL` côté Hono.

Configurer `R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY` dans `apps/api/.env` (voir `apps/api/.env.example`). La signature S3 utilise la région fixe `auto`. Le bucket doit rester privé : les téléchargements passent par l’API authentifiée.

Pour migrer d’un ancien MinIO, copiez tous les objets vers R2 en conservant exactement leurs clés avant la bascule. Vérifiez le nombre d’objets et quelques téléchargements, puis déployez l’API avec les identifiants R2. Gardez la source MinIO intacte jusqu’à validation fonctionnelle; les métadonnées Convex et leurs clés d’objet ne changent pas.

Pendant cette copie, suspendre les téléversements pour éviter des fichiers absents de la destination. Comparer les inventaires complets (clés et tailles), puis vérifier le contenu téléchargé avec SHA-256; les ETag ne sont pas toujours des sommes de contrôle comparables. Tester ensuite un téléversement et un téléchargement authentifiés avant de rouvrir les écritures. Les anciens fichiers `.env` ne sont pas convertis automatiquement : renseigner les quatre variables `R2_*` avant de redémarrer l’API. Les tests locaux avec requêtes simulées ne valident pas les identifiants ni l’accès au bucket réel.

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

La recette complète requiert un déploiement Convex de développement, un bucket R2 et des identifiants valides, ainsi qu’un fournisseur d’e-mails configuré pour vérifier la réinitialisation du mot de passe.

## Conventions de code

Les couches restent séparées : écrans et composants présentent l’interface, le repository API gère les appels réseau, le package `domain` porte les contrats et règles communes, et les fonctions Convex contrôlent les invariants métier côté serveur. Les montants sont stockés en centimes et les dates Unix en millisecondes.

Biome formate et contrôle le code TypeScript/TSX, CSS et les fichiers JSON ciblés. Les documents Markdown de cadrage sont exclus du formatage automatique.

## Dépôts-ventes

Le parcours « Dépôts-ventes » du web et du mobile enregistre un dossier par déposant, avec plusieurs articles de type carte, produit scellé ou autre article. Le produit scellé et une commission de 30 % sont proposés par défaut. Le prix convenu est le prix de vente au client ; la commission est déduite de ce montant, et la part du déposant est affichée avant enregistrement. Les coordonnées proviennent des fiches clients existantes. Les photos et justificatifs peuvent être joints aux articles.

Les articles déposés entrent dans le stock commun sans rachat ni prix d'achat. Le taux est conservé par article en points de base (3000 = 30 %). Chaque vente fige son taux, la commission et la part du déposant ; les arrondis sont faits au centime et les deux parts totalisent exactement le prix vendu. Une vente sous le prix convenu exige au préalable un nouvel accord enregistré avec une note d'autorisation. Une vente groupée est transactionnelle : un article indisponible ou un prix refusé annule toute la tentative.

Les reversements sont enregistrés par déposant, avec montant, date, mode et référence. Un versement peut couvrir plusieurs ventes et peut être partiel ; il ne peut pas dépasser le solde dû. Les versements ne sont pas affectés individuellement aux articles : le solde est la somme des parts des ventes actives encaissées (et des anciennes ventes sans renseignement de paiement) moins les versements. Les ventes explicitement « À encaisser » sont exclues tant que leur encaissement n’est pas enregistré. Une vente annulée conserve les paiements déjà effectués et peut produire un solde négatif, signalé comme régularisation. Les ventes futures du même déposant compensent ce solde. La restitution d'un invendu retire l'article du stock et conserve la date et l'historique.

Le tableau de bord distingue marges de rachat et commissions. Les dépôts sont exclus des feuilles d'export des rachats, ventes propres et stock acheté ; des feuilles dédiées présentent dépôts, commissions, versements et soldes. Le champ technique `vatRegime: other` des dépôts signifie qu'ils ne passent pas dans le calcul existant de TVA sur marge : il ne constitue pas une détermination du régime fiscal, ni un calcul de TVA sur commission. Le type de produit et l'origine du stock restent indépendants.

Les anciennes lignes sans origine explicite restent des rachats. Le déploiement des nouvelles fonctions et du schéma Convex doit précéder l'utilisation des nouvelles interfaces ; aucune conversion des rachats existants en dépôts n'est effectuée. Comme les autres données métier, les dépôts sont partagés entre les utilisateurs authentifiés de la société du déploiement ; `ownerId` identifie l'auteur, pas un locataire distinct.

Contrôles ciblés : `pnpm --filter @tcg-marge/api test`, `pnpm --filter @tcg-marge/backend test`, `pnpm typecheck` et `pnpm --filter @tcg-marge/web build`.

## Encaissements des ventes

Lors de la confirmation d'une vente ou d'un panier, choisir espèces, virement, mixte ou « À encaisser ». Un paiement reçu enregistre la date, une référence facultative et les montants en espèces et par virement. Pour un paiement mixte, leur somme doit correspondre exactement au prix total. La répartition par article d'un panier est calculée proportionnellement au centime côté serveur, dans la transaction de vente.

L'historique permet de renseigner ultérieurement un encaissement ou d'en corriger le détail. Les corrections sont historisées et ne créent pas une nouvelle vente. Une vente annulée conserve les informations d'encaissement mais est exclue des totaux actifs. Le statut absent des anciennes ventes reste « Non renseigné » : aucun mode de paiement n'est inventé.

Dans les dépôts-ventes, la vue « À payer » présente les soldes positifs et leur total. « Marquer payé » prépare un versement au montant du solde ; la confirmation enregistre un paiement déjà effectué, avec date et moyen de paiement. Le montant reste modifiable pour un versement partiel. Aucun virement bancaire n'est déclenché par l'application.

## Visibilité du catalogue

Dans Stock, les filtres « Tous », « Visibles » et « Masqués » se combinent à la recherche des articles. Masquer retire un produit du catalogue public, y compris de ses résultats et compteurs ; il reste dans le stock interne et peut toujours être vendu. Les produits existants sont visibles par défaut. Une annulation de vente conserve le choix de visibilité de l'article.

La sélection de visibilité est distincte du panier de vente. Les actions permettent de sélectionner la page ou tous les résultats filtrés (500 maximum par opération), puis de masquer ou réafficher les articles. Un changement de recherche ou de filtre efface cette sélection pour éviter de modifier des articles hors du résultat courant. Les mises à jour sont authentifiées, historisées, idempotentes et transactionnelles : un article devenu indisponible fait échouer tout le lot.

## État et décisions restant à prendre

Les flux de compte, rachats, ventes, stock, export Excel, conflits en ligne, justificatifs R2 et récupération de compte sont implémentés. Le produit exige une connexion Internet active et n’offre pas de mode hors ligne. La recette fonctionnelle nécessite un déploiement Convex de développement, l’API et le web configurés, un bucket R2 et un fournisseur de courriel configuré. La mise en production reste conditionnée par des secrets et domaines HTTPS réels, une politique de sauvegarde/restauration, la supervision, ainsi que la validation de la distribution iOS.

### Synchronisation en temps réel

Les listes paginées du web et du mobile (dont le stock), le tableau de bord web et le catalogue public utilisent des abonnements WebSocket directs à Convex. Les écritures restent des appels HTTP à Hono : une mutation validée déclenche la mise à jour des requêtes concernées sur les autres appareils connectés, sans rechargement manuel.

L’API expose l’URL du déploiement dans `GET /api/v1/instance`. Pour les lectures privées, `GET /api/v1/auth/realtime` échange la session existante contre un jeton de lecture de cinq minutes maximum, conservé uniquement en mémoire et renouvelé par le client Convex. Ce jeton ne permet pas d’appeler les mutations ou l’API comme une session. Sa validité dépend de la session d’origine : déconnexion, révocation et réinitialisation du mot de passe invalident les lectures privées. Les connexions sont partagées entre les vues et fermées quand elles ne sont plus utilisées ; changer d’instance sur mobile ferme aussi les abonnements précédents.

Déployer ensemble les fonctions Convex, l’API, le web et la nouvelle version mobile. L’URL `CONVEX_URL` renvoyée par l’API doit être accessible depuis les appareils (un `localhost` de développement n’est pas accessible depuis un téléphone physique). Aucun nouveau secret ni variable d’environnement n’est nécessaire.

Vérification sur deux appareils après déploiement : ouvrir le stock web et mobile, changer un prix ou masquer un article depuis l’un, constater la mise à jour sur l’autre et dans le catalogue public ; vendre un article et vérifier sa disparition du stock disponible ; couper puis rétablir le réseau et vérifier le rattrapage automatique ; déconnecter la session et vérifier la fermeture des lectures privées.

## Photos des cartes dans Convention

Les nouvelles images JPEG/PNG liées à un article sont rangées dans `cards/<ownerId>/<UUID>`; les autres pièces dans `attachments/<ownerId>/<UUID>`. Les anciennes clés restent compatibles, sans déplacement des objets existants. Ces préfixes organisent les fichiers et ne constituent pas une autorisation.

Le bucket R2 reste privé. Convention affiche en priorité une photo liée uniquement à l’article, puis l’image du catalogue en secours. La route `/api/v1/catalogue/:itemId/photo` vérifie à chaque lecture que l’article est disponible, visible, tarifé et issu d’un rachat actif ou d’un dépôt existant. Une carte masquée ou vendue ne peut plus être lue par cette route. Les réponses ne sont pas mises en cache; une image déjà reçue par un visiteur ne peut pas être révoquée rétroactivement. Les justificatifs de rachat et les PDF ne sont pas diffusés. Les clés R2 ne sont résolues que par une fonction interne Convex appelée via le secret de service.

Déployer les fonctions Convex mises à jour avant de redémarrer l’API et de publier le web : la validation des nouveaux préfixes et l’action de résolution des photos doivent être disponibles ensemble.

Les octets des images JPEG/PNG sont mis en cache en mémoire dans chaque processus API, après le contrôle d’accès de chaque requête. Le cache est partagé entre Convention et les téléchargements authentifiés, mais ne contient aucune décision d’autorisation : une carte masquée ou vendue reste refusée, même si ses octets sont déjà en mémoire. Les réponses navigateur restent `private, no-store`. Les PDF et les erreurs ne sont pas mis en cache.

Par défaut, le cache garde au maximum 64 Mio, 512 images et 4 Mio par image, pendant cinq minutes; les images plus grandes sont transmises sans être conservées. Les entrées les moins récemment utilisées sont évincées en premier. `IMAGE_CACHE_MAX_BYTES` ajuste la capacité (0 désactive le cache), et `IMAGE_CACHE_TTL_SECONDS` sa durée. Le cache est perdu au redémarrage et indépendant entre réplicas API. Une nouvelle photo ayant une nouvelle clé d’objet dispose immédiatement de sa propre entrée. Les accès simultanés lors du premier chargement peuvent chacun lire R2.
