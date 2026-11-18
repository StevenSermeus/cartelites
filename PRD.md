La v1 permet de suivre les rachats et les reventes de biens destinés au régime de TVA sur marge en Belgique, de retrouver la personne auprès de laquelle chaque bien a été acheté, de connaître le stock disponible et d’exporter les données dans Excel. Le produit comprend une application web et une application iOS connectées à Internet. Les deux applications utilisent immédiatement les mêmes données centrales.

Priorité métier : conserver la provenance de chaque objet. L’identité du client final est facultative et ne bloque jamais une vente.

Version : 1 — mise à jour du 16 novembre 2026. Statut : spécifications v1 révisées ; une connexion Internet est requise pour utiliser les fonctions métier sur web et iOS.

## Statut des éléments de ce PRD

- **Exigences confirmées** : les objectifs métier, la provenance par objet, l’enregistrement des rachats et ventes, le calcul du stock, l’export Excel, la connexion Internet requise sur web et iOS et les exigences de sécurité décrivent le résultat attendu de la v1.
- **Décisions confirmées** : le web et iOS passent par la même API Hono ; l’application iOS est réalisée avec Expo ; le dépôt est un monorepo pnpm avec Biome ; Convex est le stockage central ; Hono ne stocke pas de données applicatives dans SQLite. L’usage métier nécessite Internet.
- **Propositions d’architecture** : les autres technologies, services et mécanismes présentés dans « Principe technique proposé » restent des pistes tant qu’ils ne sont pas confirmés ci-dessous.
- **Décisions ouvertes** : les points explicitement listés dans « Hors périmètre et points à préciser » doivent être tranchés avant l’implémentation concernée. Une exigence produit reste applicable quelle que soit la solution retenue.
- **Hors périmètre v1** : les fonctions exclues en fin de document ne sont pas des critères de livraison de cette version.

Les règles de saisie et de fonctionnement décrites comme hypothèses de v1 sont des propositions de comportement à confirmer lors du cadrage produit; elles ne valent pas décision fiscale ou technique.

## Objectifs

Enregistrer quand un bien a été racheté, à qui et à quel prix.

Relier chaque vente au bien et à son achat d’origine.

Déduire automatiquement le stock des achats et des ventes enregistrés.

Générer un fichier Excel contenant tous les achats, toutes les ventes et le stock actuel.

La v1 couvre le suivi opérationnel et les données destinées à la comptabilité. Les règles fiscales de calcul et les registres réglementaires belges restent à préciser avant d’annoncer une conformité fiscale complète.

## Périmètre et hypothèses de la v1

Les choix suivants précisent le fonctionnement proposé pour cette première version :

Les montants sont enregistrés en euros.

Chaque objet physique possède un identifiant interne unique, même si plusieurs objets ont le même nom.

Un rachat peut contenir plusieurs objets ; chaque objet reçoit son propre prix d’achat.

Une vente peut contenir plusieurs objets ; chaque objet reçoit son propre prix de vente.

Le stock est suivi à l’unité. La répartition automatique du prix d’un lot entre ses objets est hors périmètre ; les prix unitaires sont saisis par l’utilisateur.

Le régime applicable à l’objet est enregistré ; l’outil ne déduit pas automatiquement son éligibilité fiscale.

## Applications et connexion

| Surface | Périmètre de la v1 |
|---|---|
| Application web | Gestion des rachats, ventes, vendeurs, stock, conflits et export Excel. Internet requis |
| Application iOS | Gestion des vendeurs, rachats, ventes, justificatifs et stock depuis le service central. Internet requis |
| Service central | Données communes, contrôle des accès, opérations métier et détection des conflits |

Le web et iOS utilisent une connexion par e-mail et mot de passe. La première connexion, l’activation d’un nouvel appareil et la réinitialisation du mot de passe exigent Internet. L’utilisation métier suppose une connexion Internet disponible ; aucune consultation ni saisie métier hors ligne n’est prévue en v1. Chaque compte dispose de ses propres données ; les règles d’accès sont contrôlées côté serveur.

### Exigences de compte et de sécurité

La création de compte, la connexion, la réinitialisation du mot de passe et l’activation d’un nouvel appareil nécessitent une connexion sécurisée. L’adresse e-mail est normalisée et validée côté serveur. Les mots de passe sont hachés avec Argon2id; le mot de passe en clair n’est jamais stocké. Les erreurs de connexion ne révèlent pas si une adresse est enregistrée et les tentatives sont limitées.

Le serveur émet des jetons de courte durée. Pour le web, le jeton est conservé dans un cookie `HttpOnly`, `Secure` et `SameSite`; les mutations sont protégées contre les requêtes CSRF. iOS conserve son jeton dans le Keychain. Chaque requête authentifiée vérifie la signature, l’émetteur, l’audience et l’expiration. La déconnexion et la révocation empêchent les sessions révoquées de continuer à accéder aux données. La stratégie de renouvellement, de révocation et de gestion des sessions multi-appareils reste à arrêter.

Les données d’un compte ne sont accessibles qu’à ce compte, y compris lors des lectures, écritures, exports et accès aux justificatifs. Les secrets de signature, clés d’administration et identifiants de stockage restent côté serveur et sont fournis par l’environnement.

L’application iOS requiert une connexion Internet active pour consulter et modifier les données métier. Elle ne propose pas de mode hors ligne, ne conserve pas de copie locale des données métier et ne met pas en attente les opérations. Seul le jeton de session est conservé dans le stockage sécurisé du système. Une session expirée ou révoquée nécessite une reconnexion avant tout accès métier.

## Disponibilité et conflits en ligne

Chaque lecture et chaque écriture métier requiert une connexion au service central ; les données affichées proviennent du serveur. Une coupure réseau ou une indisponibilité du service empêche la consultation et l’enregistrement. L’application affiche une erreur explicite, ne présente pas de données précédemment chargées comme à jour et ne présente pas l’opération comme enregistrée. L’utilisateur peut reprendre son action une fois la connexion rétablie.

Le serveur conserve la date métier saisie et la date de réception. Les ventes concurrentes d’un même objet sont contrôlées par une mutation atomique : une seule vente active est acceptée. L’opération concurrente refusée est conservée comme conflit à traiter explicitement en ligne ; aucune écriture ne remplace automatiquement l’autre.

## Principe technique proposé

Le web et iOS utilisent un service central commun avec une API authentifiée. Toutes les lectures et écritures métier sont en ligne. Aucun cache métier local, file d’opérations, synchronisation différée, rapprochement après reconnexion ou fonctionnement hors ligne n’est prévu en v1. La persistance du jeton iOS utilise le stockage sécurisé du système.

La proposition technique de référence est une application web TypeScript/React, une application iOS Expo/React Native, un backend Convex et une API HTTP Hono versionnée utilisée par les deux clients. Hono appelle Convex pour les comptes, sessions et données métier ; Hono ne conserve pas de base applicative SQLite. Le dépôt utilise pnpm et Biome. Le choix entre Hono monté sur les HTTP Actions Convex ou déployé comme service séparé reste à confirmer selon les capacités de runtime. Le site web est déployé séparément du backend.

Les données métier sont stockées dans Convex. Les images et justificatifs sont conservés dans un bucket privé Cloudflare R2 (API S3), avec leurs métadonnées et leur propriétaire enregistrés dans Convex. L’API signe les requêtes avec la région `auto` et applique l’autorisation avant tout téléchargement; les clients ne reçoivent pas de credentials directs. Une migration de stockage doit copier les objets en préservant exactement leurs clés avant la bascule, afin de garder les références Convex valides. Le téléversement et la confirmation d’un justificatif requièrent Internet ; son statut est suivi séparément de celui de l’opération métier.

L’API expose un contrat OpenAPI 3 généré à partir des schémas de validation, avec réponses, erreurs, paramètres d’authentification et exemples. Le contrat est disponible en JSON et versionné ou exportable pour les clients web et iOS. Les configurations local, préproduction et production isolent domaines, secrets, bases et stockages. La production exige HTTPS, sauvegardes restaurables et surveillance de la disponibilité, des erreurs et de l’espace disque.

Les tests d’intégration aux frontières API, Convex, authentification et R2 font partie du socle de livraison. Ils utilisent des services isolés et des données éphémères; CI échoue si ces parcours ou la validation du contrat OpenAPI échouent. Les scénarios minimaux couvrent inscription et connexion, séparation des comptes, expiration et révocation des sessions, protections CSRF/CORS, téléversement autorisé et refus des fichiers invalides, ainsi que la validation des réponses d’erreur.

## Enregistrement des rachats

L’utilisateur crée un rachat, sélectionne ou crée le vendeur d’origine et ajoute les objets achetés.

| Donnée | Exigence |
|---|---|
| Référence du rachat | Unique, générée automatiquement |
| Date du rachat | Obligatoire |
| Vendeur d’origine | Obligatoire : nom et prénom, ou dénomination |
| Coordonnées du vendeur | Champs disponibles pour l’adresse et les coordonnées ; exigences fiscales à préciser |
| Identifiant de l’objet | Unique, généré automatiquement |
| Désignation de l’objet | Obligatoire |
| Numéro de série | Facultatif, lorsqu’il existe |
| Prix d’achat de l’objet | Obligatoire, montant réellement payé |
| Régime de TVA | Indicateur permettant d’identifier les objets suivis sous le régime de la marge |
| Référence et pièce justificative | Référence de bordereau ou facture et possibilité de joindre le document |
| Notes | Facultatives |

La validation du rachat fait entrer ses objets en stock. Depuis la fiche d’un objet, l’utilisateur retrouve directement la date du rachat, le vendeur et le justificatif associé. |
## Enregistrement des ventes

L’utilisateur sélectionne un ou plusieurs objets disponibles et enregistre leur vente.

| Donnée | Exigence |
|---|---|
| Référence de vente | Unique, générée automatiquement |
| Date de vente | Obligatoire |
| Objet vendu | Obligatoire, sélectionné dans le stock |
| Prix de vente par objet | Obligatoire, montant réellement encaissé pour l’objet |
| Achat d’origine | Relié automatiquement à partir de l’objet |
| Client final | Facultatif |
| Référence du justificatif de vente | Facultative |
| Notes | Facultatives |

La validation de la vente sort les objets concernés du stock. L’utilisateur peut consulter l’écart entre le prix de vente et le prix d’achat pour chaque objet vendu. Cet écart est présenté comme une marge avant autres frais et traitement fiscal, pas comme un bénéfice net ou une TVA à déclarer.

## Stock

La liste du stock affiche uniquement les objets disponibles, avec leur identifiant, leur désignation, leur numéro de série éventuel, la date du rachat, le vendeur d’origine et le prix d’achat.

L’utilisateur peut rechercher un objet par identifiant, désignation, numéro de série ou vendeur. La fiche d’un objet conserve son historique d’achat et, une fois vendu, sa vente associée.

Le stock est calculé à partir des opérations valides : un objet acheté et non vendu est disponible ; un objet vendu ne l’est plus. L’utilisateur n’a pas à tenir une seconde liste de stock manuellement. Le stock affiché sur web et iOS provient du service central.

## Export Excel

Depuis l’application web connectée, un bouton génère un fichier .xlsx avec trois onglets. L’export contient l’historique central complet des achats et des ventes, ainsi que le stock au moment de la génération. La date et l’heure de génération sont indiquées dans le classeur.

| Onglet | Contenu et colonnes |
|---|---|
| Achats | Une ligne par objet acheté : référence du rachat, identifiant de l’objet, date du rachat, identité et coordonnées du vendeur, désignation, numéro de série, prix d’achat, régime de TVA, référence du justificatif, statut de l’opération |
| Ventes | Une ligne par objet vendu : référence de vente, identifiant et désignation de l’objet, date et prix de vente, référence et date de l’achat d’origine, vendeur, prix d’achat, écart vente moins achat, régime de TVA, statut de l’opération |
| Stock | Une ligne par objet disponible : identifiant, désignation, numéro de série, référence et date du rachat, vendeur d’origine, prix d’achat, régime de TVA |

Les identifiants sont identiques dans les trois onglets afin de rapprocher les données. Les dates sont de vraies dates Excel et les montants des valeurs numériques. Les justificatifs restent accessibles dans l’application ; le classeur contient leurs références.

Les opérations annulées restent identifiables dans les onglets historiques et sont exclues des totaux actifs et du stock. L’onglet Stock reste présent avec ses en-têtes lorsqu’il est vide.

## Règles de cohérence et corrections

Dans les données centrales, un objet ne peut pas avoir deux ventes actives. Les écritures concurrentes depuis plusieurs appareils connectés sont sérialisées par le serveur et une vente perdante est conservée comme conflit à résoudre.

La date de vente ne peut pas précéder la date du rachat.

Deux objets portant la même désignation restent distincts et conservent chacun leur vendeur et leur coût d’origine.

La validation d’une vente et la sortie de stock constituent une seule opération centrale sur le serveur : elles réussissent ou échouent ensemble. L’interface confirme une opération uniquement après la réponse positive du serveur.

Une vente annulée rend l’objet disponible et conserve la trace de l’annulation.

Un rachat ne peut pas être annulé tant qu’une vente active existe pour l’un de ses objets.

Les corrections et annulations conservent un historique ; les opérations validées ne disparaissent pas silencieusement.

Les prix sont enregistrés avec une précision de deux décimales.

## Critères d’acceptation

Les scénarios ci-dessous expriment des résultats observables de la v1. Les critères liés à un choix technique ouvert vérifient le comportement requis, sans imposer une technologie particulière.

| Cas | Résultat attendu |
|---|---|
| Rachat auprès d’un particulier | La date, l’identité du vendeur et le prix sont conservés ; l’objet apparaît en stock. |
| Recherche de provenance | Depuis l’objet, retrouver son rachat, le vendeur et le justificatif associé. |
| Deux objets identiques de vendeurs différents | Chaque objet conserve le vendeur et le prix d’achat qui lui correspondent. |
| Vente sans client final | La vente est acceptée et l’objet sort du stock. |
| Vente d’un objet déjà vendu | L’opération est refusée et le stock ne change pas. |
| Annulation d’une vente | L’objet revient en stock et la vente annulée reste dans l’historique. |
| Export des achats et ventes | Les trois onglets existent et chaque vente est rapprochée de son achat par l’identifiant d’objet. |
| Export du stock | Les lignes correspondent exactement aux objets disponibles dans l’état exporté. |
| Application en ligne uniquement | Chaque écran de données métier récupère ses données du service central ; web et iOS n’exposent aucune consultation ni modification métier hors ligne. |
| Perte de connexion | Une coupure empêche toute nouvelle lecture ou écriture métier ; un message d’erreur est visible et aucune donnée en mémoire n’est présentée comme à jour. |
| Opération en ligne | Après une réponse positive du serveur, le rachat, la vente ou le changement de stock apparaît sur les deux clients après rechargement des données centrales. |
| Échec réseau pendant une écriture | L’application n’annonce pas l’opération comme enregistrée et n’envoie pas automatiquement une opération en attente après reconnexion ; l’utilisateur vérifie l’état central avant de recommencer. |
| Jeton expiré | Les données métier ne sont pas affichées avant reconnexion ; après authentification, l’application recharge les données du serveur. |
| Ventes concurrentes | Une vente active au plus est acceptée ; l’autre opération reste visible comme conflit à résoudre. |
| Export Excel typé | Le fichier .xlsx contient des dates et montants typés, des identifiants rapprochables et l’horodatage de génération. |
| Stock vide | L’onglet Stock est présent avec ses en-têtes et aucune ligne objet. |
| Justificatif sans connexion | iOS affiche une erreur de connexion et ne présente pas un justificatif distant comme disponible ; aucun fichier n’est mis en attente de téléchargement. |
| Échec du téléversement | L’état du justificatif reste en erreur ou en attente même si l’opération métier a déjà été enregistrée. |
| Modification concurrente | Le conflit est signalé ; sa résolution est explicite et traçable, sans écrasement automatique. |
| Changement de compte | Le nouveau compte ne peut pas consulter les données serveur de l’ancien compte. |
| Séparation des comptes | Lectures, mutations, exports et justificatifs d’un autre compte sont refusés côté serveur. |
| Session révoquée | L’accès métier est refusé et l’application demande une nouvelle connexion. |
| Sécurité web | Le JavaScript ne lit pas le jeton du cookie, les mutations sont protégées contre CSRF et une session révoquée est refusée. |
| Mot de passe | Le mot de passe en clair n’est pas stocké et les erreurs de connexion ne révèlent pas si l’adresse existe. |
| Contrat OpenAPI | Le contrat publié est valide et décrit entrées, sorties, erreurs et authentification des routes versionnées. |
| Justificatif image | Un fichier autorisé est téléversé ; type, taille ou droits invalides sont refusés et le statut est indépendant de l’opération. |
| Sauvegarde | Une sauvegarde de production peut être restaurée selon une procédure documentée ; les secrets ne sont pas exposés aux clients. |

Exemple de recette : deux objets identiques sont achetés, le premier à Alice pour 100 € et le second à Bob pour 140 €. Le premier est vendu 180 € sans identifier le client. L’export Ventes indique Alice et un prix d’achat de 100 € ; le stock contient uniquement l’objet acheté à Bob pour 140 €. L’écart affiché pour la vente est de 80 €, avant autres frais et traitement fiscal.

## Hors périmètre et points à préciser

Hors périmètre de la v1 : CRM des clients acheteurs, synchronisation des marketplaces, comptabilité générale, déclarations TVA, facturation électronique, génération automatique des bordereaux et factures, répartition automatique des lots, gestion complète des retours, pertes et réparations. Les corrections de saisie restent couvertes par les règles d’annulation.

À préciser pour le volet fiscal belge : les informations et justificatifs obligatoires sur le vendeur, la méthode de calcul de TVA sur marge applicable à l’activité, les règles d’éligibilité et le format des registres à remettre au comptable. Ces éléments complètent le suivi décrit ici ; un export d’achats et de ventes ne constitue pas, à lui seul, une validation de conformité fiscale.

À décider avant production : runtime et hébergement Hono; version minimale d’iOS et distribution; persistance Convex en production et politique de sauvegarde/restauration; format, durée, renouvellement et révocation des jetons; gestion multi-appareils; visibilité, formats et limites des justificatifs; domaines, origines CORS et gestion des secrets. Les capacités de l’authentification JWT personnalisée avec les clients Convex et le déploiement auto-hébergé doivent être validées avec les versions retenues. Le développement local doit également choisir entre les déploiements locaux Convex, encore en bêta selon la note technique, et un déploiement cloud de développement.

Décision d’architecture prise : le web et iOS utilisent l’API Hono commune ; les clients n’appellent pas directement les fonctions Convex. L’API transmet les appels authentifiés à Convex. Le mode d’hébergement de Hono reste à choisir.
