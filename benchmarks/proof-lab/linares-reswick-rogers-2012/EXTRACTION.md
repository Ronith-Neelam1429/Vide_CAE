# Linares / Reswick–Rogers pressure-duration transfer check

Source: Linares OA, Mawson AR, Suarez E. *Exponential Sum Modeling of Reswick and Rogers Pressure-Duration Curve: A New Analysis and Model*. Journal of Basic & Applied Sciences. 2012;8:720–728. doi:10.6000/1927-5129.2012.08.02.64.

The paper digitally reconstructed the human Reswick–Rogers curve and reported its best tri-exponential coefficients (Table 1):

`P(t) = 650 exp(-1.1469 t) + 457 exp(-0.4905 t) + 77 exp(-0.1117 t)` mmHg, with `t` in hours.

`ground-truth.csv` evaluates that published curve at pre-registered durations and converts pressure using `1 mmHg = 0.133322 kPa`. Vide's production pressure-time screen does not receive these coefficients; it uses the separate Linder-Ganz sigmoid model.

This is an external cross-model transfer check, not a patient-specific injury threshold. It is expected to expose disagreement between the human clinical reconstruction and the rat-muscle sigmoid rather than produce a forced pass.
