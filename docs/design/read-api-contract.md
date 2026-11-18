# Contrat de lecture — réemploi des endpoints existants

Toutes les routes ci-dessous sont sous `/api/v1` et utilisent l’authentification existante. **Ne pas créer/consommer `/browse` ni `/records`.** Le retour utilisateur impose de prolonger les routes existantes plutôt que les doubler.

## Collections

Les GET existants `/sellers`, `/stock`, `/sales`, `/purchases`, `/consignments`, `/consignments/balances`, `/conflicts` acceptent désormais les paramètres de pagination. Sans paramètre, leur ancien contrat reste compatible. Les nouvelles interfaces envoient toujours `size=25` (maximum 50).

Paramètres : `size`, `cursor` facultatif, `search` (nom, coordonnées, référence, informations carte selon ressource), `status`, `origin`, `visibility`, `paymentStatus`, `sellerId`, `purchaseId`, `consignmentId`, `itemId`, `from`, `to` selon la ressource. `all` signifie aucun filtre. Réponse paginée : `{ items: T[], nextCursor: string | null, isDone: boolean }`. Les éléments gardent les noms métier existants. Pas de total inventé.

La pagination utilise une fenêtre serveur bornée de documents et applique les recherches sur ces documents pour rester compatible avec les anciennes données sans backfill. Une page filtrée peut donc être vide ou courte avec `isDone=false` : garder Suivant actif tant que `nextCursor` existe ; ne pas conclure « aucun résultat » avant épuisement. Réinitialiser le curseur lorsque les critères changent. Le curseur est lié aux critères et à la taille, et sa réutilisation avec d’autres critères produit une erreur 400. Les pages sont ordonnées par création décroissante, avec ordre stable fourni par Convex.

`/purchases/page` reste compatible et peut encore être utilisé par l’ancien historique numéroté ; préférer `/purchases?size=25` pour les nouvelles lectures par curseur. `/catalogue` conserve son contrat public existant.

## Détails et sous-listes

Ajouter uniquement les GET de détail qui manquaient : `/sellers/:id`, `/stock/:id`, `/sales/:id`, `/purchases/:id`, `/consignments/:id`, `/consignments/balances/:id` (id du vendeur pour le solde). Réponse : record, ou 404. Réutiliser `/conflicts/:id` déjà existant.

Les fiches d’achat/dépôt embarquent au maximum 50 articles avec `hasMoreItems`; les photos au maximum 10 avec `hasMorePhotos`. Ne pas générer un bordereau partiel : demander les pages associées avant l’export ou utiliser le flux documentaire existant. Articles supplémentaires : `/stock?purchaseId=…&status=all&size=25` ou `consignmentId=…`. Les sous-listes sans GET précédent ont des routes dédiées : `/consignments/payments?sellerId=…&size=25`, `/consignments/events?itemId=…&size=25`, `/attachments/page?itemId=…&size=25` (ou purchaseId). Elles utilisent le même format de page. Les soldes conservent `sellerId`, `sellerName`, `earnedCents`, `paidCents`, `balanceCents` ; états `due`, `settled`, `regularization`, `all`.

## Tableau de bord

Nouveau GET `/dashboard/summary`, car aucun endpoint d’agrégats n’existait : `{ summary, days }`.

`summary` : `purchaseCents`, `salesCents` (encaissées), `pendingCents`, `unknownCents`, `cashCents`, `transferCents`, `gains`, `losses`, `commissions`, `consignmentSales`, `net`, `purchaseCount`, `saleCount`, `dueCents`, `regularizationCents`.

`days` : derniers 366 jours actifs, `{ key: 'YYYY-MM-DD', purchases, sales, gains, losses }` en centimes, jour métier Europe/Brussels. Remplir les jours manquants par zéro dans le graphique. Agréger les jours en mois si nécessaire. Les totaux sont calculés côté serveur sur tout l’historique, pas sur une page.

Les agrégats et les soldes sont calculés côté serveur à la demande. Leur coût de lecture reste proportionnel à l’historique concerné ; une matérialisation transactionnelle des agrégats sera nécessaire si cet historique dépasse les limites de lecture Convex. Les collections paginées ne chargent pas toute la base, et les clients ne reçoivent pas les historiques complets pour calculer leurs totaux.

### Répartitions du tableau de bord

`/dashboard/summary` fournit aussi `byTcg` et `byOrigin`, listes de `{ key, label, stockCount, marginCents }`. Le stock compte les articles disponibles (masqués inclus), avec source rachat active ou dépôt. Une liaison de dépôt est reconnue même si son ancien champ `origin` manque. Les cartes anciennes sans TCG conservent le classement Pokémon; les autres produits sans jeu restent dans Autres/non renseignés. La marge reprend toutes les ventes actives, encaissées ou non, avec commission seule pour les dépôts et déduction des pertes; les sommes correspondent à `summary.net`. Les pourcentages de marge sont signés et non calculés si le total est nul ou négatif. La série `days.sales` contient uniquement les ventes `received`, groupées par date d’opération.
