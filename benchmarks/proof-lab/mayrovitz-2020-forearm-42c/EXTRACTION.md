# Ground-truth extraction (Mayrovitz 2020) — not loaded by the solver

Paper: Mayrovitz HN et al., *Effects of local forearm skin heating on skin properties*, Clin Physiol Funct Imaging (2020). DOI: [10.1111/cpf.12653](https://doi.org/10.1111/cpf.12653).

## Values taken from the published text (not figure digitization)

| Checkpoint | Value | Source wording |
|------------|-------|----------------|
| Preheat skin (IR) | **29.4 ± 1.1 °C** | “Preheat skin temperatures (mean ± SD) were 29.4 ± 1.1 … for heat … groups” |
| Immediate post-removal skin (IR) | **39.5 ± 1.9 °C** | “immediate uncovered skin temperature after heating was 39.5 ± 1.9 °C” |
| SBF fold at 42 °C | **8.8×** | “SBF increasing on average 8.8-fold from its baseline of 35 °C” |
| Under-heater estimate | 40–42 °C | Authors’ judgment in Discussion; **not** used as a measured point |

## Locked Vide protocol mapping

- 12 min hold at heater 42 °C → `durationS = 720`
- Brief ambient exposure before “immediate” IR → `postExposureS = 8`
- Baseline skin → `baselineSkinTemperatureC = 29.4`
- Hyperemia max fold → `perfusionMaxFold = 8.8`
- Contact disc 20 mm → `contactAreaMm2 = 314.159`

## Blind rule

`protocol.json` feeds the solver. `ground-truth.csv` is compared only after prediction.
