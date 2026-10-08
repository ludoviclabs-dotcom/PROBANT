# Adaptateur du rootDir Next ESLint

Ce paquet privé remplace uniquement le globSync(pattern, { onlyDirectories:true })
utilisé par @next/eslint-plugin-next/dist/utils/get-root-dirs.js. Il ne prétend
pas implémenter toutes les API et options de fast-glob.

Implémentation : tinyglobby 0.2.17, sans braces ni micromatch. Les chemins littéraux
ne développent pas leurs descendants. Les motifs absolus conservent leurs chemins
absolus, les résultats ne portent pas de barre terminale ajoutée.

Limites : chaîne non vide de 4096 caractères maximum, imbrication de 64 niveaux
maximum, motifs négatifs et NUL refusés, toute autre option refusée. Next décompose
lui-même le réglage rootDir tableau en appels globSync individuels.

Réexaminer la nécessité de l'override lors de toute montée de version du plugin
Next. Les tests lib/security/__tests__/dependency-compat.test.ts vérifient l'API,
le véritable consommateur et la règle de navigation interne, ainsi que l'absence
des paquets vulnérables dans le lock.

Résolution : devDependency racine fast-glob:file:tools/fast-glob-compat et
override global fast-glob:$fast-glob. Next ESLint est le seul consommateur
transitif actuel. Le test du lock refuse un autre consommateur futur, pour
éviter d’appliquer cette API limitée à un usage inconnu.
