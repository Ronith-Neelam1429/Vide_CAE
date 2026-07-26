# Heat validation source audit

Date: 2026-07-26  
Scope: human volar forearm contact heating with raw temperature–time series  
Evidence rule: raw tabular only (no figure digitization); comparison-only reporting (no pass/fail)

## Required fields for an eligible case

- Open reuse terms (or explicit academic DUA that allows bundling/redistribution)
- Downloadable raw table/CSV (not charts alone)
- Anatomical site: human forearm (volar preferred)
- Contact heating protocol with documented thermode geometry and temperature program
- Measured temperature at a like-for-like target (`skin_surface` under contact, or documented `thermode_interface`)
- Enough metadata to lock protocol inputs without guessing

## Candidates reviewed

### 1. PainMonit Experimental Dataset (PMED) — Gouverneur et al., Scientific Data 2024

- DOI / data: [10.1038/s41597-024-03878-w](https://doi.org/10.1038/s41597-024-03878-w), figshare [10.6084/m9.figshare.26965159](https://doi.org/10.6084/m9.figshare.26965159)
- Licence: article CC BY 4.0; dataset public with academic-research data-use agreement
- Protocol: Medoc Pathway CHEPS, 27 mm diameter, non-dominant forearm (~10 cm below elbow), 10 s stimulus windows, baseline ~32 °C, max 49 °C
- Raw CSV: yes (semicolon / comma-decimal streams at 250 Hz including thermode temperature)
- Contact-site skin temperature: **no** — included “skin temperature” is Empatica E4 wrist temperature, not under the thermode. Authors also dropped it from ML baselines for weak pain correlation.
- Verdict: **protocol eligible, measured contact-site series unavailable**. Case shipped as awaiting contact-site measurements. Must not compare wrist E4 temperature to simulated contact-site surface temperature.

### 2. BioVid Heat Pain Database

- Access: signed agreement, academic non-commercial only; not anonymously downloadable
- Signals: video / GSR / ECG / EMG; not an open contact-site skin T(t) table
- Verdict: **rejected** for this release (access + measurement target)

### 3. Mayrovitz et al. 2020 — local forearm skin heating

- Paper: Effects of local forearm skin heating on skin properties ([10.1111/cpf.12653](https://doi.org/10.1111/cpf.12653))
- Protocol: aluminium heater on forearm, 35 °C → 42 °C, ~12 min hold, perfusion/TEWL endpoints
- Continuous raw open T(t) CSV: **not located**
- Published discrete IR skin temperatures (text): preheat **29.4 ± 1.1 °C**, immediate post-removal **39.5 ± 1.9 °C**; SBF **8.8×**
- Verdict: **eligible as a discrete skin-surface checkpoint case** in proof-lab (`mayrovitz-2020-forearm-42c-skin`). Continuous under-heater series still unavailable.

### 4. Other reviewed sources

- PhysioNet wearable TEMP CSVs: ambient/wearable skin temp, not controlled contact heating
- Acupuncture heat-producing needling Excel (MDPI Data 2018): open tables, but not thermode contact heating
- Thenar / palm Peltier interface-temperature studies: wrong site for the forearm hold-out plan; figures without raw tables

### 5. EPOS local forearm thermal-stimulation dataset — Wang et al. 2019

- DOI / data: paper [10.1101/2020.03.04.976456](https://doi.org/10.1101/2020.03.04.976456);
  data [10.6084/m9.figshare.8299343.v4](https://doi.org/10.6084/m9.figshare.8299343.v4)
- Licence: **CC0**; Data 1 archive has per-subject MATLAB/Excel records.
- Protocol: 29 healthy participants, anterior/volar forearm; PeriFlux 6000 EPOS
  thermostatic + laser-Doppler probe; 38/40/42/44 °C in randomized order;
  30 min baseline, 30 min heating, 30 min recovery; 3 Hz sampling.
- Raw target: temperature at the stimulated and recorded probe site is present
  (`time`, `temperature`, `oxygen`, `perfusion`) for every session.
- Verdict: **eligible as a device/thermode-interface trajectory benchmark**, pending
  conversion and schema verification. It does **not** establish skin-under-probe
  temperature independently from the thermostatic probe, so it cannot calibrate
  `contactConductanceWM2K` or validate the Pennes tissue-temperature prediction.
  It will be kept separate from the skin-surface calibration/hold-out claim.

## Decision for this release

1. Ship two forearm protocol cases (`calibration` = PMED CHEPS 10 s; `holdout` = Mayrovitz-style local 42 °C) with locked inputs and explicit `availability` status.
2. Do **not** claim experimental validation.
3. Keep synthetic CSVs only under `fixtures/` for unit tests of alignment/metrics; UI must never present them as published experiments.
4. When eligible raw contact-site series become available, drop them beside the manifests, set `availability` to `ready`, and re-run calibration → locked hold-out comparison without changing the dashboard contract.
