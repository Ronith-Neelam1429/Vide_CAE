# Mechanics source audit

Status: **no calibration or validation claim**.

The current mechanics solver uses representative elastic, viscoelastic, and bone-fatigue constants to screen normal-contact protocols. It does not yet have an audited open dataset that contains the same contact geometry, force history, anatomical site, and measured displacement/strain required for like-for-like comparison.

## Acceptance criteria for a benchmark

A candidate case must include:

1. A raw time series for applied force or pressure and the matched displacement/strain response.
2. Contact area or indenter geometry, loading waveform, frequency, and preconditioning/rest history.
3. Anatomical site and enough subject or specimen metadata to select an appropriate tissue profile.
4. A redistribution license and stable source record.
5. A locked split: calibration cases are never reused as hold-out cases.

## Known references informing model constants

- Agache PG et al. (1980), *Mechanical properties and Young's modulus of human skin in vivo*, Arch Dermatol Res 269:221–232.
- Reilly DT, Burstein AH (1975), *The elastic and ultimate properties of compact bone tissue*, J Biomech 8:393–405.
- Carter DR, Caler WE (1985), *A cumulative damage model for bone fracture*, J Orthop Res 3:84–90.
- Pattin CA, Caler WE, Carter DR (1996), *Cyclic mechanical property degradation during fatigue loading of cortical bone*, J Biomech 29:69–79.

These references support parameter ranges and governing-law choices only. They are not a substitute for a benchmark record and must not be presented as validation data.
