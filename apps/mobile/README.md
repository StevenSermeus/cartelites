# Application mobile

## Build de développement iOS

Le projet inclut `expo-dev-client`. La version autonome utilise `dev.wdee.cartelites` et la variante « Cartélites Dev » utilise `dev.wdee.cartelites.dev` : les deux peuvent être installées ensemble.
Pour installer un build sur un iPhone connecté en USB :

1. Configurer un compte Apple et un certificat Apple Development dans Xcode, puis activer le mode développeur sur l’iPhone.
2. Depuis `apps/mobile`, lancer `pnpm ios --device` et sélectionner l’iPhone et l’équipe personnelle de signature.
3. Pour les sessions suivantes, lancer `pnpm start` et ouvrir le serveur de développement dans « Cartélites Dev ».

Pour construire la version autonome avec le JavaScript embarqué, utiliser `pnpm ios:release --device`. Ces scripts régénèrent le dossier natif pour la variante choisie avant compilation. `APP_VARIANT=development` sélectionne la variante Dev dans `app.config.js` ; la configuration par défaut correspond à la version autonome.

Le dossier natif `ios/` est généré par Expo et n’est pas versionné. Les modifications natives doivent passer par `app.json` ou un config plugin pour survivre à sa régénération.

L’application Expo utilise `EXPO_PUBLIC_API_URL` comme origine de l’API Hono, par exemple `http://127.0.0.1:3001` pour le simulateur local. Sur un iPhone physique, remplacer `127.0.0.1` par l’adresse réseau de la machine de développement. Copier `.env.example` vers `.env.local`, puis redémarrer Expo après tout changement d’environnement.

Le JWT iOS est conservé uniquement dans iOS SecureStore/Keychain. Les données métier ne sont pas conservées localement ; chaque lecture et écriture passe par Hono et Convex. Une connexion Internet est requise. Sans réseau, l’application affiche une erreur et ne confirme aucune modification.

### Signature et lecture des PDF

La signature se dessine dans un écran dédié, en paysage, puis se confirme avec
« Valider la signature ». La rotation de l’appareil doit être déverrouillée.
Les tracés restent au format 3:1 utilisé dans les documents.

Le lecteur intégré utilise `react-native-pdf` et `react-native-blob-util` : après
mise à jour, reconstruire le client natif (`pnpm --filter @tcg-marge/mobile ios`).
Un simple rechargement Metro ne suffit pas pour ajouter ces modules ni pour
mettre à jour les orientations autorisées. Expo Go ne contient pas ce lecteur.

La signature réutilisable est stockée dans le profil du compte sur le serveur,
commune au web et au mobile. « Recharger ma signature enregistrée » récupère la
version courante ; les deux appareils doivent utiliser le même compte et la
même instance. La case d’enregistrement dans le parcours de signature prend
effet à la validation finale ; les paramètres du compte permettent de
l’enregistrer indépendamment d’un document.
