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
