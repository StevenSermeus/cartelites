# Application mobile — design et parcours

## Identité et connexion à une instance

L’application mobile est indépendante des magasins. Elle conserve une identité neutre « Espace vendeur », une palette bleue et des composants communs. Aucun logo Cartélites ni configuration d’une boutique ne sont embarqués dans son identité. Le site web garde l’identité et le logo du magasin.

À la première ouverture : saisir l’URL de l’API → vérifier la compatibilité et la connexion → enregistrer l’adresse → se connecter au compte de cette instance. L’adresse du site public n’est pas nécessairement celle de l’API. La convention d’URL et la vérification de compatibilité devront être définies avec le backend avant implémentation, sans supposer qu’un simple statut HTTP 200 suffit.

**L’URL est persistante** : enregistrée localement sur l’appareil, relue au lancement, conservée après fermeture/redémarrage et lors d’une simple déconnexion. Elle reste consultable et modifiable via **Plus → Instance connectée**. Ce réglage ne doit pas dépendre d’une URL figée dans le binaire ni d’une variable de build pour chaque magasin.

Changer d’instance exige une confirmation si une session ou une saisie est en cours. Déconnecter l’ancien compte, abandonner les brouillons après confirmation, annuler les requêtes en vol et vider les données en mémoire avant de connecter la nouvelle instance. Ne jamais transmettre le jeton d’une instance à une autre. Conserver les jetons dans le stockage sécurisé natif, séparément de la préférence d’URL. Les redirections réseau ne doivent pas transmettre les identifiants à une autre origine.

États de configuration : première ouverture, adresse renseignée, vérification en cours, instance reconnue, adresse invalide, API inaccessible, API incompatible, confirmation de changement et échec d’enregistrement local. Une erreur réseau ne supprime pas l’adresse déjà enregistrée. Prévoir HTTPS, absence d’identifiants dans l’URL, validation du format et normalisation convenue avec l’API.

Dans la maquette, la vérification réseau est explicitement simulée. Le bouton « Enregistrer et se connecter » persiste uniquement l’URL dans le stockage local du navigateur, si celui-ci est autorisé ; l’écran d’erreur indique un refus du stockage. Aucune authentification réelle n’est effectuée. L’application native utilisera son stockage de préférences persistant.

## Navigation et formulaires

Cinq onglets : Stock, Vendre, Rachats, Dépôts, Plus. Les détails conservent l’onglet de leur section actif. Plus donne accès aux clients, au compte et à la configuration de l’instance. Le tableau de bord, les exports, le catalogue et les mentions du site sont identifiés comme des vues web, et non comme des capacités natives existantes. L’adresse éventuelle du site doit venir de la configuration de l’instance ; ne pas la déduire arbitrairement de l’URL de l’API.

Les rachats et dépôts sont répartis en trois étapes : **Client → Articles → Vérifier**. Changer d’étape conserve les champs saisis dans le prototype. La sélection client utilise la recherche par nom, email, téléphone ou référence, avec résultats limités et paginés, identification des homonymes et action « Changer de client ». Les états de recherche, erreur, aucun résultat et sélection sont disponibles pour les deux formulaires.

Les listes et historiques possèdent des contrôles Précédent/Suivant et un nombre limité de lignes. La production doit rechercher, filtrer, trier et paginer côté serveur, y compris dans les fiches et les sélecteurs. Proposition : 10 résultats pour les sélecteurs, 25/50 lignes pour les listes, aucune option « Tout afficher ». Recherche temporisée, réponses obsolètes ignorées, critères conservés et retour à la première page après changement de recherche. Les jeux fictifs de deux lignes par page servent seulement à montrer les interactions.

## Composants et états mobiles

### Photos prises sur place

Sur les articles de rachat, de dépôt et les emplacements autorisant l’ajout de photos, proposer **Prendre une photo** (caméra native), **Choisir dans la galerie** et, pour les justificatifs, **Importer un fichier**. Après capture : aperçu, reprendre, utiliser cette photo ou annuler. Une annulation conserve le formulaire et la photo précédente. Demander la permission caméra au moment de la première utilisation ; en cas de refus, expliquer comment ouvrir les réglages et garder l’import disponible. Prévoir caméra indisponible, capture annulée, préparation de l’image, envoi en cours et échec avec réessai sans recréer l’opération. Ne pas annoncer de sauvegarde serveur avant confirmation de l’envoi ; aucune file d’envoi hors ligne n’est prévue.

État constaté dans le code : le rachat utilise actuellement `DocumentPicker.getDocumentAsync` pour sélectionner une image JPEG/PNG. La capture directe par caméra et le sélecteur de galerie natif restent à implémenter ; leur disponibilité n’a pas été vérifiée sur appareil.

- Cibles tactiles de 44 px minimum, champs de 48 px, texte de saisie de 16 px et coordonnées sur plusieurs lignes.
- Formulaires en une colonne, actions principales accessibles et étapes courtes.
- Dialogues larges avec annuler/valider, messages près des champs et arrière-plan inactif.
- Paiements mixtes, encaissements différés, versements partiels, surpaiements, accords et conflits conservent les règles du plan principal.
- Chargement, absence de données, erreur et succès sont proposés selon la page ; aucune confirmation d’enregistrement sans réponse du serveur dans la future application.
- En natif : adapter les actions au clavier et aux zones de sécurité, faire défiler le champ invalide dans la zone visible, tester le retour système, VoiceOver et les tailles de texte agrandies. Ces comportements système ne sont pas reproduits par le prototype HTML.

## Livrables et portée

`mobile-mockups.html` reprend les familles de pages et les états métier du plan principal, avec une fondation mobile propre et le parcours de configuration d’instance. `app-mockups.html` est la maquette du site web, désormais avec le véritable logo du magasin. Leurs interactions sont locales, leurs données fictives. Aucun fichier de l’application Expo ni aucune API n’ont été modifiés.

Vérifications : 163 états rendus à 320 et 390 px sans erreur de script, débordement horizontal ou dialogue coupé. Le passage entre les résultats clients, la sélection, la conservation de la date en changeant d’étape, la validation du format d’URL et l’enregistrement local conduisant à la connexion ont été contrôlés. Ces vérifications concernent les maquettes, pas un simulateur iOS ni le réseau réel.

## Proposition mobile — achats fournisseurs et dons (20 novembre 2026)

Le prototype démarre dans Stock. Le bouton Ajouter du stock ouvre Facture → Produits → Vérifier. Une facture peut contenir des scellés et des cartes à l’unité (numéro, langue et état/gradation). Quantité, coût unitaire HT, prix de vente TTC, régime et taux de TVA restent explicites. Les montants et fournisseurs sont fictifs ; aucun traitement fiscal n’est validé par cette maquette.

Stock et Vendre réunissent les provenances. Le panier accepte plusieurs références et quantités avec un total commun et un règlement espèces, virement, mixte ou à encaisser. Masquer du catalogue conserve le produit dans le stock interne et le sélecteur de vente ; la visibilité porte sur la fiche produit, indépendamment de sa quantité. L’état de visibilité est manipulable dans la liste et la fiche du prototype. Le catalogue web historique n’est pas connecté à ces données de démonstration.

Donner / Offrir conserve date, quantité, bénéficiaire facultatif, motif, note et coût connu. L’action est interdite aux dépôts. Une annulation restitue la quantité et conserve la ligne annulée. Dons et cadeaux propose un export CSV réel des seules données fictives en mémoire, filtré par période, avec références d’achat et coûts inconnus signalés. Les fichiers joints restent des sélections locales simulées, sans stockage ni envoi. Le prototype perd ses opérations au rechargement.

### Modèle Convex proposé, à implémenter

Séparer les fiches produits (identité, variantes, prix demandé, visibilité catalogue), les réceptions/factures et les lots (produit, quantité reçue/restante, coût, régime fiscal et provenance). Une fiche display peut agréger plusieurs lots de réception, sans mélanger leurs coûts. L’état, langue et gradation distinguent les variantes de singles ; les exemplaires individualisés restent traçables. Une mutation serveur affecte les unités vendues ou données aux lots disponibles, par ordre de réception proposé, et enregistre les mouvements et coûts figés. Elle contrôle les quantités et applique tous les débits atomiquement. Une annulation restitue les quantités aux lots d’origine. Prévoir une clé d’idempotence pour les réessais. Le catalogue ne lit que les fiches visibles avec disponibilité, sans exposer les coûts ni les fournisseurs. Origine et régime fiscal restent indépendants.

La maquette montre les quantités et la visibilité, mais ne simule pas encore l’allocation entre plusieurs lots, les abonnements Convex ni les coûts comptables définitifs de la conversion display → boosters. Les lignes ajoutées restent distinctes dans sa mémoire ; le regroupement persistant nécessite le modèle ci-dessus. Les autres écrans historiques utilisent leurs jeux fictifs antérieurs.

Vérifications de cette extension : rendu à 390 px et parcours à 320 px, sans erreur de console ; panier display + single (152 €), validation de vente, don, annulation et réception fournisseur ; absence de débordement sur les sept nouvelles vues ou vues remplacées. Ces contrôles ne constituent pas une validation native ni backend. Les vérifications antérieures des 163 états ne couvrent pas cette extension.

### Ticket de vente

La confirmation ouvre un ticket avec lignes, quantités, total et statut de paiement. Le détail d’une vente propose le même accès. Le parcours prévoit téléchargement PDF, régénération versionnée et envoi à une adresse email modifiable. Dans la maquette ces trois actions sont explicitement simulées, sans PDF, objet R2 ni email réel.

Implémentation prévue : figer les informations de vente et de boutique nécessaires au ticket ; générer le PDF côté serveur depuis cet instantané, jamais depuis le catalogue courant. Conserver dans Convex les versions, clés R2 privées, dates, statut de génération et historique d’envoi. Télécharger via accès autorisé et URL temporaire ; régénérer une nouvelle version en conservant les précédentes. L’envoi utilise la version sélectionnée et le fournisseur email configuré ; enregistrer les erreurs et permettre un réessai sans dupliquer la vente ni l’envoi. Un échec PDF/R2/email ne remet pas en cause la vente validée. Une vente annulée doit être clairement marquée et ne doit pas produire un ticket affirmant une vente active. La présentation fiscale du ticket sera issue des régimes enregistrés sur les lignes, à spécifier avant production.


### Ouverture des displays et photos produits

La fiche d’un display détenu en propre propose Ouvrir un display : quantité à ouvrir, boosters par display, fiche booster existante ou nouveau produit, récapitulatif du coût transféré et confirmation. Le format (Display, Booster, Coffret, ETB, Autre) est choisi lors de la réception des scellés. Les cartes à l’unité gardent leurs champs dédiés. Le prototype débite les displays et crédite les boosters en mémoire ; le nouveau produit est masqué par défaut, le produit existant conserve son prix et sa visibilité. L’historique conserve les ouvertures et annulations ; une sortie des boosters issus de l’ouverture empêche son annulation. La simulation consomme ces lots avant le stock initial ; l’allocation métier définitive reste à implémenter.

Côté Convex, prévoir une mutation atomique et idempotente de conversion, des lots enfants liés aux lots parents, le transfert exact du coût en centimes (répartition des restes), le régime et les références de facture hérités, ainsi que les mouvements inverses pour une annulation autorisée. Ne pas remplacer le coût des anciens boosters lors d’une réception issue d’ouverture. Les abonnements doivent actualiser les deux disponibilités ensemble. Les quantités de panier sont revérifiées à la validation. Cette proposition ne modifie pas le backend.

Photos : caméra ou galerie dans le formulaire fournisseur et sur la fiche d’un produit, jusqu’à six photos JPEG/PNG/WebP de 10 Mo chacune, aperçu, choix de couverture et suppression. Les photos des lignes de réception sont conservées dans la fiche ajoutée ; la couverture apparaît dans Stock et Vendre. Dans le navigateur, la capture dépend de l’appareil ; un sélecteur local peut remplacer la caméra. Les URL de fichiers restent uniquement en mémoire, sans envoi R2 et sans persistance au rechargement. Les permissions natives, compression, miniatures et réessais d’envoi seront intégrés au parcours existant lors de l’implémentation Expo/API/R2.

Contrôles supplémentaires à 320 px : ouverture, annulation, vente d’un booster bloquant l’annulation, rejet d’un fichier non image, aperçu d’image, couverture persistante entre vues et suppression ; aucune erreur de console ni débordement sur la vue d’ouverture contrôlée.


## Harmonisation mobile selon les principes Apple

Les composants et parcours du fichier mobile existant sont réutilisés, sans nouveau prototype indépendant ni modification de la maquette web. Palette neutre et accent bleu, police système, titres hiérarchisés, listes groupées, séparateurs discrets, formulaires cohérents et actions principales distinguées des secondaires. Stock et Vendre utilisent une liste compacte commune ; visibilité, don, ouverture et photos restent dans la fiche produit. Les cinq onglets conservent icônes et libellés, dans une barre stable séparée de la zone de contenu défilante. Les retours sont placés avant le titre. Les champs de photos restent accessibles au clavier et les filtres exposent leur sélection via aria-pressed.

Le cadre HTML de 844 px sert seulement à montrer le défilement et la barre d’onglets. Il ne définit pas la hauteur de l’application native. En Expo, employer les dimensions disponibles, les safe areas, les contrôles et sélecteurs natifs, les tailles de texte système et une gestion réelle du clavier. Les pictogrammes SVG sont des approximations pour la maquette, pas des SF Symbols officiels. Aucun effet de verre n’est nécessaire à la hiérarchie retenue.

Références Apple consultées : [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [UI Design Dos and Don’ts](https://developer.apple.com/design/tips/). L’application de ces principes à ce produit est une proposition de design, pas une certification Apple.

Vérification : rendu des 187 états à 320 px sans erreur de script ni débordement horizontal ; inspection visuelle de Stock à 390 px et du formulaire fournisseur à 320 px ; parcours d’ouverture et présence des sélecteurs de photos conservés. VoiceOver, Dynamic Type et permissions caméra natives restent à vérifier lors de l’implémentation.


### Application native — première intégration du design

Le thème partagé Expo utilise l’accent bleu, avec une variante sombre. Les cinq onglets sont ordonnés Stock, Vendre, Rachats, Dépôts, Plus ; les routes du navigateur suivent le même ordre. L’en-tête porte l’identité neutre Espace vendeur. Champs partagés, pagination, titres et actions secondaires reprennent la hiérarchie de la maquette. Les lignes du stock conservent leur comportement réel, avec le prix sous les informations produit et un chevron distinct ; une photo indisponible affiche un emplacement accessible.

Cette passe porte sur le design des écrans natifs existants. Les nouvelles fonctions fournisseur, lots, dons, conversion et tickets décrites plus haut ne sont pas implémentées par cette passe. Les parcours photo et métier nouveaux restent ceux du prototype.

Validation native : `pnpm --filter @tcg-marge/mobile typecheck` réussi. Tentative de vérification iOS interrompue car le simulateur est déjà réservé par une autre session (`DEVICE_IN_USE`), sans reprise ni fermeture de cette session. Aucune validation visuelle native revendiquée.

### Intégration des fonctions métier (suite)

La passe suivante implémente les achats fournisseurs, les lots, le panier avec quantités, les dons, leur export CSV, les conversions display → boosters, les pièces jointes R2, les photos avec couverture et les tickets versionnés/archivés/envoyables. Les composants natifs réutilisent Field, AttachmentPreview, ItemThumbnail, Pagination et ReceiptPdfViewer. Les écrans HTML restent des prototypes indépendants en mémoire ; les nouveaux écrans Expo appellent les API réelles. Le modèle concret utilise `items` comme fiche produit pour l’origine supplier, et `stockLots` comme historique des réceptions/conversions, sans migration des articles individuels existants.

Les tests couvrent l’idempotence, les quantités concurrentes, le rollback d’un panier mixte, les coûts exacts des lots, dons, annulations, visibilité du catalogue, instantanés des tickets et échanges API/R2/Brevo simulés. Le PDF exemple a été rendu avec Poppler et contrôlé visuellement. TypeScript et le bundle Expo iOS passent. La validation tactile native, caméra et services externes réels reste distincte : le simulateur précédemment ouvert était occupé par une autre session, qui n’a pas été interrompue.
