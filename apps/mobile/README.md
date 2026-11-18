# Application mobile

L’application Expo utilise `EXPO_PUBLIC_API_URL` comme origine de l’API Hono, par exemple `http://127.0.0.1:3001` pour le simulateur local. Sur un iPhone physique, remplacer `127.0.0.1` par l’adresse réseau de la machine de développement. Copier `.env.example` vers `.env.local`, puis redémarrer Expo après tout changement d’environnement.

Le JWT iOS est conservé uniquement dans iOS SecureStore/Keychain. Les données métier ne sont pas conservées localement ; chaque lecture et écriture passe par Hono et Convex. Une connexion Internet est requise. Sans réseau, l’application affiche une erreur et ne confirme aucune modification.
