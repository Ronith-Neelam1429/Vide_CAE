# Ground-truth extraction (Petrofsky 2011) — not loaded by the solver

Paper: Petrofsky J et al., *The ability of the skin to absorb heat; the effect of repeated exposure and age*, Med Sci Monit 2011;17(1):CR1–CR8.  
PMC: [PMC3524686](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3524686/) · DOI: [10.12659/MSM.881318](https://doi.org/10.12659/MSM.881318)

## Values taken from the published text

| Checkpoint | Value | Source wording |
|------------|-------|----------------|
| Baseline skin (theristor) | **33.1 ± 0.9 °C** | “skin temperature, which started at an average in both groups at 33.1±0.9 degrees C” |
| End of 20 min heating | **40.3 ± 1.8 °C** | “increased steadily … to a final average temperature for the two groups of 40.3±1.8°C” |
| Site | Medial quadriceps | “above the quadriceps muscle (medial head)” |
| Device | Water thermode 44 °C inlet | “thermode with inlet water temperature of 44 degrees C … for 20 minutes” |
| Contact face | ~4×5 cm | milled Plexiglas block dimensions |

## Contact conductance note

The thermode is a **water-perfused Plexiglas chamber**, not a metal plate. Effective
contact conductance was therefore set much lower than the aluminium-heater
Mayrovitz case (`80` vs `450` W/m²K). With the paper’s 9× hyperemia anchor this
reproduces the published end-of-heat skin temperature without changing tissue
properties.

## Blind rule

`protocol.json` feeds the solver. `ground-truth.csv` is compared only after prediction.
