# Proof lab (temporary blind validation)

This folder holds **paper replication checks** where Vide never sees measured results during simulation.

## Layout per case

- `protocol.json` — experiment inputs only (compiled into the blind prediction path)
- `ground-truth.csv` — measured time series (comparison path only; never passed to the solver)
- `EXTRACTION.md` — human audit trail of what was taken from the paper/dataset

## Cases

| ID | Paper | Target | Status |
|----|-------|--------|--------|
| `mayrovitz-2020-forearm-42c-skin` | Mayrovitz 2020 | **Skin surface** (IR preheat + immediate post-removal) | Ready |
| `petrofsky-2011-quad-44c-skin` | Petrofsky 2011 | **Skin surface** (theristor start + end of 20 min @ 44 °C) | Ready |
| `wang-epos-2019-subject070-42c` | Wang et al. 2019/2020 EPOS | Thermode/probe interface | Ready |

## Physics used for skin accuracy

- 1-D Pennes bioheat with finite contact conductance
- **Local thermal hyperemia**: dermal/subcut perfusion scales with local tissue temperature (sigmoid), anchored to Mayrovitz (~8.8× at 42 °C) and EPOS (~10×)

## Scope notes

- Mayrovitz provides published **discrete** IR skin temperatures, not a continuous under-heater T(t) series.
- EPOS temperature is **probe-controlled interface** feedback, not independent skin-under-probe ground truth.
