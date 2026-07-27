# Hugosdottir 2019 patch-electrode transfer check

Source: Hugosdottir R, Mørch CD, Andersen OK, Helgason T, Arendt-Nielsen L. *Preferential activation of small cutaneous fibers through small pin electrode also depends on the shape of a long duration electrical current*. BMC Neuroscience. 2019;20:52. doi:10.1186/s12868-019-0530-8.

The paper reports the surface patch-electrode median fitted rheobase as `0.40 mA` and median chronaxie as `0.57 ms`. The locked reference values evaluate the Weiss–Lapicque fit

`I_threshold = 0.40 * (1 + 570 / pulse_duration_us)` mA

at the paper's 1, 5, and 50 ms pulse durations.

Vide's production defaults come from a different human Aδ intraepidermal-electrode study (Kodama et al., 2020: 0.178 mA, 270 µs). This is therefore an independent cross-study transfer test. Electrode geometry differs intentionally; a poor score means electrode-specific calibration is required and must not be hidden.
