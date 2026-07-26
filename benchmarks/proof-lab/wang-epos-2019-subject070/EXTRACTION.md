# Ground-truth extraction record (not loaded by the simulator)

Source: Wang G et al., *A dataset of speed-resolved blood perfusion and oxygen saturation in human skin response to thermal stimulation* (bioRxiv / Scientific Data, 2020).  
Data file: `T6_070_42.mat` from figshare [10.6084/m9.figshare.8299343.v4](https://doi.org/10.6084/m9.figshare.8299343.v4) (CC0).

## Protocol locked for Vide (inputs only)

| Parameter | Value | Paper / record source |
|-----------|-------|------------------------|
| Baseline window | 1800 s | “30 min baseline recording” before stimulation |
| Heating setpoint | 42 °C | Subject file suffix `_42` |
| Heating duration | 1800 s | “stimulated … for 30 min” |
| Recovery | 1800 s | “30-min rest period” after stimulation |
| Site | Volar forearm | Anterior forearm between palmaris longus and flexor carpi radialis |
| Ambient | 25 °C | Room “24–26 °C” (midpoint) |
| Sampling | 3 Hz | Documented EPOS rate |
| Subject | T6_070 | File name |

## Measured series extracted

- Converted with `tools/ingest_epos_interface_series.py` → `ground-truth.csv`
- Columns: `time_s`, `temperature_c`
- Samples: 16,217 points over 0–5400 s
- Quantity: EPOS probe-reported temperature (thermostatic interface feedback)

## Summary statistics from the extracted record

| Window | Mean T (°C) | Min | Max |
|--------|-------------|-----|-----|
| Baseline 0–1800 s | 32.61 | 32.12 | 33.02 |
| Heating hold 1900–3500 s | 42.000 | 41.98 | 42.12 |
| Recovery 3600–5400 s | 37.05 (mean) | 32.47 | 42.00 |

Ramp to setpoint begins near t ≈ 1800 s; probe reaches 42 °C near t ≈ 1852 s.

## Blind-validation rule

`protocol.json` is the **only** case definition compiled into the prediction path.  
`ground-truth.csv` is read **after** simulation completes, solely for metric comparison.
