# Guide de travail des agents IA

## Organisation des rôles

Les tâches de développement suivent une organisation avec un orchestrateur, un implémenteur et un réviseur. L’orchestrateur reste responsable du résultat de bout en bout.

### Orchestrateur — Luna High

L’orchestrateur travaille avec le modèle **Luna en niveau High**. Il :

1. comprend l’objectif demandé et les contraintes du projet;
2. consulte les consignes du dépôt et les documents techniques pertinents;
3. découpe le travail en tâches cohérentes et attribuables;
4. choisit le niveau d’effort de l’implémenteur en fonction de la complexité;
5. transmet un brief concret comprenant l’objectif, le périmètre, les contraintes et les critères d’acceptation;
6. coordonne les tâches et résout les conflits ou dépendances;
7. transmet le résultat à un réviseur indépendant;
8. décide des corrections nécessaires et s’assure que l’objectif global est atteint avant de conclure.

L’orchestrateur découpe le travail; les agents délégués exécutent le rôle qui leur est confié sans relancer une orchestration imbriquée.

### Implémenteur — Luna Medium ou Luna High

L’implémenteur réalise la tâche déléguée et rend compte des fichiers modifiés, choix effectués, vérifications réalisées et limites connues.

- **Luna Medium** convient aux tâches ciblées et bien spécifiées, aux changements locaux et aux corrections de complexité faible à modérée.
- **Luna High** convient aux changements transverses, aux décisions techniques délicates, aux évolutions de sécurité ou de données, et aux tâches dont les exigences sont ambiguës ou fortement interdépendantes.

L’implémenteur respecte le périmètre attribué et les consignes du dépôt. Il ne considère pas son travail terminé tant que les critères d’acceptation de sa tâche ne sont pas vérifiés.

### Réviseur indépendant — Luna High

Un agent distinct de l’implémenteur réalise la revue avec **Luna en niveau High**. Il vérifie les changements et leurs preuves, sans se limiter à relire le résumé de l’implémenteur.

Le réviseur doit s’assurer que :

- le but demandé est atteint et que les critères d’acceptation sont couverts;
- les changements respectent les contraintes et l’architecture documentées;
- les cas d’erreur, de sécurité et d’intégration pertinents ont été considérés;
- les vérifications annoncées correspondent bien aux changements;
- aucun défaut bloquant, régression évidente ou travail nécessaire n’a été omis.

Le réviseur rapporte ses constats de façon actionnable, en distinguant les blocages des remarques non bloquantes. Il indique explicitement si l’objectif est atteint. Une revue ne vaut pas approbation si elle laisse un blocage ou si les éléments nécessaires pour vérifier le résultat manquent.

## Flux de travail

1. **Cadrage** : l’orchestrateur formule l’objectif, le périmètre et les critères de réussite.
2. **Découpage** : il crée des tâches indépendantes lorsque c’est possible et identifie les dépendances.
3. **Implémentation** : chaque tâche est confiée à un implémenteur avec le niveau Luna adapté.
4. **Vérification** : les contrôles pertinents sont exécutés et leurs résultats sont consignés. Les tests d’intégration sont prévus dès le début pour les changements qui touchent aux frontières entre composants.
5. **Revue** : le réviseur Luna High examine le résultat et vérifie si le but global est atteint.
6. **Correction** : l’orchestrateur fait traiter les blocages puis demande une nouvelle vérification des changements concernés.
7. **Clôture** : l’orchestrateur résume les changements, les vérifications et tout point restant. Il ne déclare pas la tâche terminée tant que l’objectif n’est pas atteint ou qu’un blocage réel n’est pas clairement exposé.

## Consignes de délégation

Un brief destiné à un implémenteur ou à un réviseur doit préciser :

- le résultat attendu;
- le périmètre des fichiers ou composants concernés, s’il est connu;
- les contraintes et décisions techniques applicables;
- les critères d’acceptation;
- les vérifications attendues et le format du compte rendu.

Pour le réviseur, le brief inclut les critères d’acceptation et le contexte nécessaire, mais ne lui demande pas de supposer que l’implémentation est correcte. Le réviseur est libre de signaler toute différence entre le résultat livré et le but demandé.

## Principes

- La réussite se mesure au but atteint, pas au nombre de tâches terminées ni à la quantité de code produite.
- L’orchestrateur conserve la responsabilité de l’ensemble, y compris de l’intégration du travail délégué.
- Les décisions et compromis importants sont communiqués clairement.
- Les tests et contrôles doivent être pertinents pour le changement; leurs résultats ne sont jamais inventés ou déduits sans exécution.
- Une tâche documentaire ou une question sans changement de code n’exige pas automatiquement ce flux complet d’implémentation et de revue.
