# Proof lab (temporary blind validation)

This folder holds **paper replication checks** where Vide never sees measured results during simulation.

## Layout per case

- `protocol.json` — experiment inputs only (compiled into the blind prediction path)
- `ground-truth.csv` — measured time series (comparison path only; never passed to the solver)
- `EXTRACTION.md` — human audit trail of what was taken from the paper/dataset

## Cases

| ID | Paper | Status |
|----|-------|--------|
| `wang-epos-2019-subject070-42c` | Wang et al. 2019/2020 EPOS forearm 42 °C | Ready (thermode-interface comparison) |

## Important scope note

The Wang EPOS record reports **probe-controlled interface temperature**, not independent skin-under-probe temperature. It validates protocol/boundary reproduction, not full Pennes skin-surface calibration.
