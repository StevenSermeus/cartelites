# Dépôt-vente — parcours et documents

Maquette de référence : `docs/design/consignment-flow-mockups.html` (copie synchronisée du prototype iPhone de travail `/private/tmp/cartelites-ios-mockups/cartelites-iphone.html`). Elle conserve les autres espaces de l’application et ajoute les écrans Dépôts. Les données, conditions et signatures y sont des exemples, sans opération réelle.

## Périmètre et décisions

- Même parcours métier sur React web et Expo, avec présentation adaptée au support. Expo reprend le design Apple déjà adopté : navigation 51, titre 32, lignes groupées 57, CTA 49, palette Système/Clair/Sombre. React conserve la navigation du site et rend le contenu plus large, sans copier un téléphone dans le navigateur.
- Un contrat de dépôt-vente et inventaire remplace l’emploi d’un bordereau de rachat dans ce parcours. Il constate des articles confiés, pas un achat, ni un paiement.
- La maquette présente le modèle financier déjà implémenté : commission calculée sur le prix de vente effectif, montant retenu déduit pour obtenir la part déposant ; sommes en centimes et taux en points de base. **Aucun nouveau régime TVA, taux TVA, mention TTC/HT ou frais ne doit être inventé.** Le `vatRegime: other` actuel ne constitue pas une validation fiscale.
- Les conditions de la boutique doivent être configurables et leur texte figé dans le contrat présenté et signé. Les exemples « 14 jours » ou « restitution sur rendez-vous » ne sont pas des règles légales ni des paramètres de production à imposer silencieusement. Ne pas inventer une exonération de responsabilité, un abandon d’invendus ou l’application automatique de la marge.
- Fourchette commerciale annoncée : 15–30 %. Proposer ces valeurs dans la saisie ; conserver la compatibilité des contrats existants, dont l’API autorise actuellement 0–100 %. Toute autre valeur nouvelle doit être explicite, ne pas modifier les historiques.
- Le prix convenu actuel est déjà un prix plancher : une vente en dessous est refusée. Conserver cela et présenter « accord préalable pour une remise », plutôt que créer un deuxième prix minimum ambigu.
- Le solde et les versements sont actuellement **par déposant, tous dépôts confondus**. Le montrer explicitement. Ne pas afficher un versement global comme s’il était intégralement affecté à un dossier. Une allocation par dossier serait un changement métier distinct.
- Nouveaux dépôts : concevoir une étape enregistrée « à signer », puis « confirmé » après contrat signé/archivé pour la mise en vente. Compatibilité : ne jamais bloquer rétroactivement ou changer le statut des dépôts existants. Utiliser une version de parcours/contrat explicite, des champs optionnels et une migration additive.

## Création du dépôt

1. **Déposant** : rechercher une fiche existante, créer/modifier les coordonnées, puis date du dépôt. E-mail facultatif : absence = remise manuelle clairement prévue, pas un faux état « envoyé ».
2. **Inventaire** : cartes, scellés et autres articles ; identification, état, série/numéro/langue, gradation/certificat, photos. Un exemplaire = un article traçable avec identifiant stable ; la quantité multiple produit autant d’exemplaires suivis, ou doit avoir une vraie gestion de quantité serveur, pas un simple champ descriptif.
3. **Article / accord financier** : prix convenu, commission, net prévisionnel ; remise soumise à accord. Différencier prévision et montant acquis. Ne pas appliquer de frais cachés. Le modèle initial conserve « aucun frais supplémentaire » si aucun mécanisme de frais n’est configuré.
4. **Conditions** : échéance, modalités de versement/restitution/garde/propriété, conditions particulières. Afficher les textes réellement configurés et leur version. En absence de texte validé : état explicite de configuration manquante, pas des conditions fictives préremplies comme définitives.
5. **Vérifier** : déposant, inventaire, prix/commissions, conditions, destinataire ; actions Modifier par section.
6. **Contrat PDF réel** : contrat + inventaire + conditions, toutes pages accessibles, attestation « aucun versement » ; contrôle lecture puis signature boutique puis déposant. Réutiliser le composant de signature plein écran sans ScrollView corrigé par le parent. La signature mémorisée de la boutique exige confirmation pour ce document ; consentement déposant lié au contrat exact.
7. **Résultat** : original archivé, référence/version, nombre d’articles ; état e-mail séparé (à envoyer/accepté/échec/sans e-mail). Réessai d’envoi du même original, sans nouvelle signature ni duplication du dépôt. Une archive manquante garde une erreur récupérable, jamais un PDF non signé présenté comme signé.

Écrans maquette : `newdepot`, `depotidentity`, `depotitems`, `depotitem`, `depotsealed`, `depotterms`, `depotconditions`, `depotrecap`, `depotpdf`, `depotcompany`, `depotclientsign`, `depotdraw`, `depotfinish`.

## Suivi et opérations

- Liste **Dépôts / À reverser**, recherche client/référence et filtres via capsule flottante. Panneau bas refermable, critères conservés, badge comptant les filtres (pas le texte). États chargement, erreur/réessai, vide, aucun résultat et pagination serveur.
- Dossier : référence, échéance, client ; articles En dépôt/Vendu/Restitué ; contrat À signer/Signé distinct du statut des articles ; solde global déposant correctement libellé ; documents et historique.
- Vente via le parcours Vente existant. La maquette possède un bouton « Simuler une vente encaissée » seulement pour démontrer l’effet. Ce bouton ne doit **pas** devenir un raccourci de vente réelle sans contrôles. Une vente doit conserver le prix réellement payé, la commission applicable à cet instant, la part déposant et l’encaissement.
- Modification prix/commission : accord du déposant obligatoire, événement daté. Si le contrat signé est affecté, produire un avenant/nouvelle version sans écraser l’ancien. Ne pas recalculer rétroactivement les commissions de ventes déjà enregistrées.
- **Décompte** : ventes encaissées, commission, part acquise, versements, reste payable. Les ventes non encaissées sont distinctes et n’augmentent pas le solde disponible. Lire toutes les pages nécessaires côté serveur pour les PDF ; jamais exporter seulement la page actuellement affichée.
- **Reversement** : montant positif ≤ solde disponible, date, mode, référence et confirmation « déjà effectué ». Enregistrement idempotent, puis justificatif et solde actualisé. Aucun virement bancaire n’est déclenché par ce bouton. Versement partiel autorisé. Une erreur de génération du justificatif ne rejoue pas le paiement.
- **Restitution** : sélectionner des articles disponibles, état à la remise, date, aperçu du bon, confirmation/signature déposant dans cadre plein écran, puis enregistrement atomique et archive. Articles vendus ou déjà restitués exclus ; conflit si vendus entre sélection et confirmation. Garder un historique consultable et retirer les articles du stock une seule fois. Aucune vente/commission créée par une restitution.
- **Documents** : contrat signé et versions, décomptes datés, justificatifs de paiement, bons de restitution. Afficher type, référence, date, état signature/archivage/e-mail ; aperçu réel, téléchargement, partage, réessai d’archive/envoi. Les originaux ne changent jamais lorsqu’une fiche ou le solde change.

Écrans maquette : `depot`, `depotdetail`, `depotarticle`, `depotstatement`, `depotpayout`, `depotpayoutdone`, `depotreturn`, `depotreturnpdf`, `depotdocuments`, `depotdocumentview`, `depotstatementview`, `depotpaymentview`, `depotreturnview`.

## Documents à produire

| Document | Déclenchement | Contenu et statut |
|---|---|---|
| Contrat de dépôt-vente + inventaire | Après vérification, avant signatures | Parties, date/référence, inventaire/état/identifiants, prix convenus, commissions et net prévisionnel, conditions/version, échéance, signatures. Mention aucun versement. PDF signé immuable. |
| Décompte du déposant | Sur demande, à une date donnée | Ventes concernées avec références, prix effectifs, commissions figées, parts déposant, versements enregistrés, reste payable. Portée tous dépôts clairement indiquée. Ne constitue pas à lui seul une preuve de paiement. |
| Justificatif de reversement | Après paiement enregistré | Identifiant paiement, déposant, montant/date/mode/référence, opérateur et solde/portée à cet instant. Ne prétend pas être un justificatif bancaire. Si espèces et reçu signé souhaité, prévoir signature de réception explicite, pas une signature boutique appliquée automatiquement. |
| Bon de restitution | Après remise confirmée | Dossier, articles/exemplaires restitués, état/date, parties, accusé de réception/signature, référence événement. Pas de total vendu ni de commission. |
| Accord modifié / avenant | Modification acceptée du prix ou des conditions | Référence du contrat précédent, valeurs avant/après, auteur/date/accord, nouvelles signatures si nécessaires selon le flux retenu. Original précédent conservé. |

Les aperçus HTML du prototype illustrent ces contenus ; l’implémentation doit utiliser les vrais rendus PDF et vérifier les pages rendues. L’archivage doit être indépendant de l’e-mail, avec état récupérable sur erreur et empreinte/contenu stable.

## État du code et gaps précis

- `apps/api/src/routes/consignments.ts` : schémas create/payment/return/terms existants. Ajouter les conditions versionnées et les contrats de documents/opérations nécessaires, validation partagée avec Convex. Idempotency key obligatoire déjà disponible, à conserver.
- `convex/functions/consignmentOperations.ts` : `createConsignment` crée immédiatement `items.status='available'`; `recordConsignmentPayment` vérifie solde et date ; retour unitaire modifie l’article et insère un événement ; `updateConsignmentTerms` exige une note. Ajouter états des nouveaux contrats sans régresser le modèle existant ; restitution groupée atomique et snapshot de remise ; paiement/document lié sans rejouer l’opération.
- `convex/functions/operations.ts` : ventes de dépôt refusées sous `agreedPriceCents`, commission et part déposant figées dans la vente. Préserver ce comportement ; appliquer l’éventuel verrou de contrat uniquement aux nouveaux dossiers versionnés.
- `convex/functions/schema.ts` : `consignments` n’a que référence, dates, notes ; `consignmentPayments` est au niveau sellerId ; événements sont return/terms ; `signedReceipts.kind` seulement purchase/consignment. Champs/types nouveaux optionnels et stratégie de compatibilité obligatoire, pas de migration destructrice.
- `apps/api/src/routes/receipts.ts` + `convex/functions/signedReceipts.ts` (vérifier le fichier effectif) : pipeline prepare/sign/archive/hash/Brevo à réutiliser, étendre par type de document uniquement avec snapshot déterministe et autorisation adaptée. Ne pas détourner un document de rachat pour une restitution.
- `packages/domain/src/consignmentReceipt.ts` : bon de dépôt existant avec prix convenu/commission/part prévisionnelle, échéance, notes, signatures et avertissement « aucun versement ». Le renforcer comme contrat avec conditions figées, puis ajouter des renderers distincts décompte/reversement/restitution. Ne pas appliquer la déclaration TVA du vendeur d’un rachat automatiquement au dépôt. `apps/api/scripts/generate-receipt-identity.ts` copie les renderers partagés dans `apps/api/src/receipts` : garder la génération synchronisée.
- `apps/web/src/ConsignmentsPage.tsx` : formulaire et opérations actuels monolithiques ; assistant de création + résumé et fiche dossier + documents réels, contrôles/formulaires adaptés au web. `apps/web/src/ReceiptSigning.tsx` pour signature document.
- `apps/mobile/src/screens/ConsignmentScreen.tsx` : assistant et dossier selon maquette, modales opérations/lecteur PDF, recherche flottante conservée. `apps/mobile/src/components/ReceiptSigning.tsx` et `SignaturePad.tsx` sont en correction parallèle par le parent : **ne pas réintroduire `inline` ni modifier le geste de dessin**.
- `apps/mobile/src/data/apiRepository.ts`, types web et read models Convex : faire circuler conditions/version/états et documents sans perte. Les données réelles paginées restent la source, aucune donnée fictive livrée.

## Recette minimale avant livraison

1. Créer carte + scellé, vérifier inventaire et commission ; annuler/revenir sans perte de champs.
2. Champs invalides : dates, montant, taux, coordonnées ; états sans e-mail et sans signataire.
3. Signature boutique réutilisée seulement avec consentement, client plein écran portrait/paysage sans scroll ; modifier tracé réinitialise consentement ; signer une seule fois malgré double tap/réessai.
4. PDF multi-page contient tous les articles/conditions ; total prévisionnel et aucun versement ; dernières pages/signatures lisibles ; originaux inchangés après changement fiche.
5. Vente sous prix convenu refusée ; accord modifié tracé ; commission figée ; vente non encaissée exclue du solde.
6. Décompte total correct sur plusieurs pages, versement partiel, surpaiement/date invalide refusés, réessai idempotent ; erreur document ne double pas le paiement.
7. Retour partiel/groupé, article vendu/conflit refusé, signature et bon liés à la même remise ; absence de vente ou de versement fictif.
8. Dossiers historiques continuent à fonctionner et restent consultables ; nouveau verrou de signature n’affecte que le nouveau flux.
9. Visuels React + Expo clair/sombre, clavier, lecteurs PDF et navigation. Tests de vrais contrôles par simulateur sans opérations fictives sur la production.

## Limites de conception

Cette maquette est une spécification produit, pas une consultation juridique ou fiscale. Le choix du rôle de Cartélites (vente en son nom pour compte d’autrui ou intermédiaire) et le traitement TVA doivent être fixés avec le comptable avant d’introduire un calcul fiscal nouveau. La mise en œuvre peut avancer sur le parcours, l’inventaire, les conditions configurables, les commissions déjà définies et la traçabilité sans inventer cette décision.
