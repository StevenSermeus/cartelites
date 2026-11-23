# Réimport des anciennes données

Commande dédiée depuis la racine du dépôt : `pnpm data:reimport`.
Elle importe les données transformées dans **une base Convex vide utilisant le nouveau modèle**. Elle refuse une base contenant déjà des données métier ; elle ne vide aucune table. Elle refuse aussi un ancien index d’activité sur une cible sans import enregistré ; elle ne supprime pas cet index. Elle ne fusionne pas deux boutiques et ne synchronise pas les modifications faites après la sauvegarde.

## Préparer l’export

Décompresser/convertir le ZIP Convex avec l’utilitaire existant, dans un dossier privé hors du dépôt :

```sh
python3 scripts/prepare-convex-backup.py /chemin/snapshot.zip /chemin/prive/reimport
```

Le résultat utilisable est `/chemin/prive/reimport/export.json`. Conserver aussi la copie R2 correspondant à cette sauvegarde.

## Simuler

Créer un fichier privé `/chemin/prive/reimport.env` contenant l’URL exacte de la cible et un secret temporaire d’au moins32 caractères :

```dotenv
MIGRATION_TARGET_URL=https://votre-cible.convex.cloud
MIGRATION_SECRET=SECRET_TEMPORAIRE_A_RENSEIGNER
```

Le secret reste hors de Git. La commande de simulation ne contacte ni Convex ni R2 :

```sh
pnpm data:reimport /chemin/prive/reimport/export.json \
  --config /chemin/prive/reimport.env --restore \
  --objects /chemin/copie-r2 --dry-run
```

Le résultat donne les comptes par table, les totaux à rapprocher, les champs/tables historiques conservés, les avertissements, le contrôle des fichiers et `sourceDigest`.

## Importer

Reporter le `sourceDigest` exact de la simulation dans le fichier privé sous `MIGRATION_SOURCE_DIGEST`. Sur la **cible Convex**, renseigner les mêmes `MIGRATION_TARGET_URL`, `MIGRATION_SOURCE_DIGEST` et `MIGRATION_SECRET`, et `MIGRATION_MODE=restore`. L’URL doit être l’origine exacte, sans chemin ni slash final. Ces valeurs autorisent uniquement cette cible et cette sauvegarde.

Exécuter la même commande sans `--dry-run` :

```sh
pnpm data:reimport /chemin/prive/reimport/export.json \
  --config /chemin/prive/reimport.env --restore \
  --objects /chemin/copie-r2
```

La commande contrôle le modèle de la cible, crée les nouveaux identifiants Convex et réécrit les relations, importe par lots, rapproche les quantités/montants/documents/signatures, puis reconstruit l’index d’activité. Une erreur de rapprochement interrompt la finalisation.

En cas de coupure, relancer **exactement la même commande avec le même export**. Les identifiants déjà importés sont retrouvés dans les mappings ; aucun doublon n’est créé. Ne changer ni le fichier source ni la version du transformateur pendant une reprise. Après succès, supprimer le secret temporaire de la cible ou désactiver `MIGRATION_MODE`.

Option facultative : `--report /chemin/prive/resultat.json` conserve un rapport en permissions600 ; utiliser un nouveau nom de fichier pour chaque exécution.

## PDF et images

**Garder le même bucket R2.** Les clés des objets restent identiques : les nouvelles données référencent les PDF et images originaux. Le script ne génère aucun PDF, ne remplace aucun original signé et n’envoie aucun fichier sur R2. `--objects` vérifie la copie locale avant les écritures de données ; cela ne prouve pas que les fichiers sont présents dans un autre bucket.

Si le bucket a été vidé ou changé, restaurer auparavant les fichiers originaux sous leurs clés exactes. Ce script n’effectue pas cette copie distante. Les fichiers ayant une empreinte historique sont vérifiés contre elle ; les images sans empreinte historique sont signalées comme telles.

## Vérification disponible

La sauvegarde fournie a été reconvertie et simulée :1334 enregistrements,11 fichiers locaux présents,6 empreintes historiques vérifiées ; les5 autres fichiers n’ont pas d’empreinte historique de référence. Les mappings, signatures et clés d’objets sont conservés. Les tests couvrent le refus d’une mauvaise cible/source, le mode simulation sans réseau, les reprises et l’absence de doublons. La nouvelle commande a été exécutée sur la répétition locale3224 :0inserté,1334rejoués sans doublons, aucun écart de rapprochement, index d’activité complet. La suite complète passe avec508 tests réussis et un test optionnel ignoré. Voir `reimport-review.md` et `reimport-restore-local-check.json`. Aucun import distant n’a été exécuté par l’agent.
