# Prototypes complets Cartélites

Ouvrir `web.html`, `mobile.html` ou `catalogue.html` dans un navigateur. Les fichiers sont autonomes et ne nécessitent ni serveur ni installation. Ils sont également affichables dans la conversation.

## Ce qui fonctionne

- **Web** : stock, filtres et pagination ; fiches et photos ; contacts ; sociétés de gradation libres ; rachat ; réception fournisseur ; panier et paiements ; historiques et corrections ; dépôts, signatures, restitutions et versements ; dons, ouverture de displays et annulations ; documents et emails simulés ; exports CSV ; compte et paramètres.
- **iPhone** : cinq onglets Rachats, Vendre, Stock, Activité, Plus et écrans détaillés, parcours guidés, brouillons locaux, mêmes opérations principales, galerie, documents et partage simulé.
- **Convention** : 48 articles, recherche réelle dans le stock de démonstration, filtres combinés, tri, grille/liste, pages et taille de page ; fiche produit avec plusieurs vues, description, état, langue, gradation, prix et disponibilité ; parcours informatifs rachat/dépôt, boutique et pages légales de travail.

La recherche de cartes lors des acquisitions appelle réellement TCGDex. Elle n’utilise pas des réponses fictives. `tcgdex-search.js` est le code source partagé ; une copie est embarquée dans chacun des prototypes internes pour les rendre autonomes. Les requêtes par nom sont paginées ; les numéros complets sont vérifiés par série. Exemples vérifiés en direct : `60/106` en français (Pikachu, Balbuto et Foretress dans trois séries distinctes), `060/106` en anglais, `XY95`, `SVP001`. `001/XY-P` reconnaît le format mais indique que la série manque dans le catalogue japonais consulté. Les langues absentes du fournisseur sont signalées, sans substituer silencieusement une autre langue.

La recherche **Convention** porte uniquement sur les articles disponibles dans son jeu de données, pas sur toutes les cartes TCGDex. Un produit peut avoir une description et plusieurs photos, avec une couverture. Les informations d’achat, de marge, de déposant et les justificatifs ne sont pas affichés publiquement.

## Parcours à essayer

1. Stock → Ajouter au stock → Rachat → contact → recherche TCGDex ou saisie manuelle → état/gradation/valeur/pourcentage → récapitulatif → enregistrement → document → signatures de démonstration → envoi simulé.
2. Fournisseur → contact et référence → produits/quantités/coûts/TVA → facture → récapitulatif → réception → lots → ouvrir un display → annuler l’ouverture.
3. Stock → panier → quantités/prix → paiement espèces/virement/mixte/à encaisser → confirmation → ticket → historique → correction de paiement → annulation.
4. Dépôt → déposant → articles/prix/commission → conditions → récapitulatif → signature → vente ou restitution → solde → versement partiel.
5. Fiche produit → description et photos → ajouter plusieurs images → choisir une couverture → galerie → visibilité.
6. Convention → recherche → filtres → page suivante → fiche → galerie et agrandissement → retour conservant les filtres.

## Simulation et limites explicites

Chaque prototype conserve son propre jeu de données local et indépendant ; modifier le stock web ne met pas à jour le catalogue public de cette maquette. La future application partagera les mêmes données serveur. Le stockage navigateur est utilisé lorsqu’il est disponible, avec repli en mémoire. Le bouton Réinitialiser remet les données de démonstration à leur état initial.

Les scénarios permettent d’explorer les erreurs réseau, les conflits et les échecs d’email. Aucun compte réel, paiement, email, transfert bancaire, signature contractuelle ou modification de production n’est créé. Seule la recherche TCGDex fait des appels réseau réels. Les images de catalogue proviennent de TCGDex ; les vues non disponibles sont indiquées comme emplacements. L’ajout de photos internes utilise les fichiers choisis localement.

Les aperçus de documents sont des représentations HTML illustratives. Ils ne remplacent pas les générateurs PDF sauvegardés ni les originaux signés. Les signatures saisies sont une simulation du parcours. Les exports de démonstration sont CSV ; l’export Excel final reste prévu dans le document de conception.

Les composants web représentent le design shadcn prévu mais ces prototypes autonomes n’embarquent pas React/shadcn. Le téléphone est une simulation HTML des interactions natives, pas une application iOS compilée. Les textes légaux sont des brouillons de navigation à valider avant publication.

Si la recherche externe est bloquée par l’aperçu intégré, ouvrir le fichier HTML dans un navigateur avec accès à Internet. Une erreur explicite et la saisie manuelle restent disponibles.

## Vérifications

- `web-check.js` : assertions injectables de parcours rachat, signature, vente mixte, correction, annulation, don, fournisseur, dépôt et pagination.
- `mobile-check.js` : 11 groupes de parcours, dont la pagination du catalogue via un transport de test ; aucune fausse réponse n’est ajoutée au prototype livré.
- `catalogue-check.js` : recherche, filtres, pagination, fiche, galerie, retour, parcours informatifs et reprise après erreur.
- Les tests s’injectent après les scripts, avant la **dernière** balise `</body>` dans une copie jetable du HTML. Ils réinitialisent les données de la copie.
- Les requêtes TCGDex ont aussi été vérifiées directement contre le service public, séparément des tests de parcours.

## Priorité mobile et sélection du panier

Le mobile démarre sur Rachats : nouveau rachat, brouillons à reprendre et historique. Vendre ouvre directement la liste de sélection. Les articles au panier sont mis en évidence avec leur quantité, une coche et des boutons moins/plus ; le plus se désactive lorsque tout le stock disponible est sélectionné. Le total et le nombre d’unités restent accessibles depuis la liste. Dépôts et paramètres se trouvent dans Plus.
