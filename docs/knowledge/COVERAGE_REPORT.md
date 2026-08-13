# Knowledge Coverage Report

Generated on 2026-08-13 for the knowledge-governance layer. This report does not
claim that the current local changes have been deployed.

## Coverage

| Area | Status | Evidence |
| --- | --- | --- |
| FEC 18 fields and BOFiP doctrine | PASS | Article A47 A-1 LPF and BOFiP versions are registered; existing `data/fec/fields.json` remains the control catalogue |
| NEP 230/300/315/320/330/450/500/501/530/700 | PASS | H2A index and homologation metadata are registered; NEP remain the primary French audit reference |
| PCG ANC 2014-03 consolidated 2026 | PASS | Consolidated version, publication metadata and verification are registered |
| ANC 2026-03 and 2026-04 | REVIEW_REQUIRED | Official ANC publications are registered as `pending_endorsement`; no effective date is inferred |
| IFRS Required 2026, IFRS 18 and IFRS 19 | PASS_WITH_LIMITATIONS | IASB and EU adoption states are separated; IFRS 19 EU endorsement remains pending |
| IFRS Accounting Taxonomy | PASS | The 2025 taxonomy is registered as the current taxonomy for 2026, with source verification |
| ACPR IFRS/ISA and CNCC IFRS | PASS | Professional guidance is distinguished from enforceable French standards |
| EY/PwC analyses | PASS | Registered only as secondary analysis and prohibited as the source of mandatory requirements |
| Crosswalks | REVIEW_REQUIRED | NEP/ISA entries are correspondence-only; detailed paragraph mappings require human review |
| External statistics | PASS | Every statistic has a period, unit, source version and verification status |
| 35 audit cycles | PASS | Existing `data/cycles/*.yml`, validated by tests |

## Sources

The executable source registry is `lib/knowledge/registry.ts`.
Validation rules live in `lib/knowledge/validation.ts`.
The validator rejects duplicate identifiers, dangling source versions, inconsistent
paragraph references, mandatory rules derived from secondary sources, incomplete
IFRS adoption metadata, unqualified supersession overlaps, unsourced mandatory
numeric rules, incomplete statistics and IFRS-like bulk text.

All unresolved verification points are enumerated in `docs/knowledge/REVIEW_REQUIRED.md`.
