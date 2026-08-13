# Fixtures d'ingestion adverses

Les fixtures volumineuses/binaires sont générées pour garder le dépôt léger :

- `fec.ts` : FEC valide, mauvais header, date invalide, séparateur invalide et générateur de très gros FEC ;
- `stream-parser.test.ts` : champs et lignes gigantesques ;
- `adversarial-files.test.ts` : XLSX malformé, archive à compression pathologique et CSV ambigu ;
- `upload-policy.test.ts` : mauvaise extension/MIME et XLS legacy ;
- `pdf-no-text.pdf` : PDF minimal sans opérateur texte, attendu en revue manuelle.

Les générateurs acceptent un nombre de lignes explicite et n'allouent pas le FEC complet. Le benchmark utilise le même générateur.
