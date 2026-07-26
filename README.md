# Vide

A desktop CAE tool for exploring how a device's contact with skin heats the
tissue underneath it. Import a mesh, mark where it touches skin, describe the
contact conditions, and run a layered bioheat simulation.

Built with Tauri, React, TypeScript and a Rust solver.

```bash
npm install
npm run tauri dev
```

## Getting an experiment on screen fast

You can start without any CAD file. The Design tab ships **arm-worn presets** —
a **wristband / smartwatch cuff**, an open **bracelet**, and a **compression
sleeve** — each generated as geometry and dropped straight onto the skin patch
(the "arm"). Pick one, mark where it presses the skin, assign a heat stimulus,
and run. Importing an STL/OBJ works exactly the same way afterwards.

## Tissue library

Skin is the first tissue, but the layered solver is generic, so Vide now ships
several organic tissues you can select as the "Skin site" for any contact:

| Tissue | What it models |
| --- | --- |
| Volar forearm / Palm / Fingertip / Upper back / Abdomen | Skin sites with site-specific layer thicknesses and perfusion |
| Bone (subcutaneous, shin) | Thin skin over cortical bone, trabecular bone and marrow |
| Scalp with hair | Insulating keratin-and-air canopy over vascular scalp, galea and skull |
| Articular cartilage | Avascular hyaline cartilage over subchondral bone |
| Cell membrane / monolayer (in vitro) | Bulk-thermal analogue of a cultured construct in medium |

Every tissue reports its own depth markers (for example *skin–bone interface*
and *cortical bone base* instead of *basal layer*), so a reported temperature is
never silently interpreted as skin anatomy. Property values are representative
literature figures with their sources attached, and remain *Unreviewed* in-app
until checked against the primary reference — the in-vitro cell profile in
particular is a bulk-thermal analogue and its burn/Ω interpretation is not
physically meaningful at cellular scale.

Additional tissue-property references beyond the skin sources:

- Biyikli S, Modest MF, Tarr R (1986). *Measurements of thermal properties for
  human femora.* J Biomed Mater Res 20(9):1335-1345.
- Hasgall PA et al. *IT'IS Database for thermal and electromagnetic parameters
  of biological tissues.*
- Duck FA (1990). *Physical Properties of Tissue.* Academic Press.

## The 3D body and animated response

The workspace renders the complete **Z-Anatomy** human body — all bones and
muscles — not procedural placeholders or a flat plane. Toggle **Show anatomy**
to fade the muscle envelope and reveal the full skeleton underneath. Use
**Anatomy credit** in the viewport for full CC BY-SA attribution.

After a run, the **Results** panel shows a playback timeline. Scrub or play it to
watch the *actual solver output* animate on the forearm: a heat contact drives a
hot-spot that reddens and cools with the real surface-temperature series.
The animation is a view of the simulation data, never a canned effect.

## Stimuli

| Stimulus | Status | What it models |
| --- | --- | --- |
| Heat | Implemented | Layered Pennes bioheat + Arrhenius damage (see below) |
| Pressure / mechanical load | Implemented | Layered viscoelastic compression, permanent set, and cortical-bone cyclic fatigue (see below) |
| Cold, Electrical | Not implemented | Deliberately gated until their response models are built and checked |

## What the heat model does

The solver computes the one-dimensional Pennes bioheat equation through a
layered skin stack, driven by a finite contact conductance at the surface:

```
ρc ∂T/∂t = ∂/∂x( k ∂T/∂x ) + ω_b ρ_b c_b (T_a − T) + q_met
q_surface = h_contact (T_device − T_skin)
Ω(t)      = ∫ A exp( −E_a / R T ) dt          (above the threshold temperature)
```

Points worth knowing before trusting a number it produces:

- **The device does not set the skin temperature.** Heat crosses a finite
  contact conductance derived from the interface material, its thickness and
  the applied pressure, so skin always sits below the device. Contact area,
  interface and pressure genuinely change the result.
- **The device can be a real object.** It may be an ideal setpoint, a passive
  thermal mass that cools as it gives up heat, or a power-limited controller.
  The ideal option assumes a controller with unlimited power and is flagged as
  such in the results.
- **Runs start from a resting gradient**, not a uniform body temperature: skin
  already sits near 33 °C over a 37 °C core before anything touches it.
- **Damage keeps accumulating after contact ends.** A post-contact window lets
  the tissue cool while Ω continues to integrate. Omitting it under-reports
  injury.
- **Ω is computed at every depth**, giving a damage depth rather than a single
  scalar.

## Numerics

Finite volume on a graded mesh, advanced by Crank–Nicolson and solved with the
Thomas algorithm.

- Control-volume fluxes with **harmonic-mean face conductivity**, so heat flux
  is conserved exactly across layer interfaces.
- Cells start a few micrometres wide at the surface and grow geometrically,
  always terminating exactly on a layer boundary.
- Crank–Nicolson is unconditionally stable, which decouples the timestep from
  the near-surface cell size. The first two steps of each phase use backward
  Euler to damp the oscillation that a step change in boundary condition would
  otherwise excite.
- Reported temperatures are interpolated to fixed anatomical depths and the
  surface value is extrapolated from the surface flux, so refining the mesh does
  not change which depth is being reported.

Measured order of accuracy is roughly 1.8, consistent with a second-order scheme
on a graded mesh.

## Evidence the solver is correct

`verify_solver` runs an analytic suite on demand, and every simulation embeds its
results in the run manifest:

| Case | Reference |
| --- | --- |
| Semi-infinite solid, step surface temperature | Carslaw & Jaeger §2.5 |
| Semi-infinite solid, constant surface flux | Carslaw & Jaeger §2.9 |
| Perfused half-space, steady state | Pennes (1948) |
| Two-layer slab, steady conduction | Patankar (1980) §4.2.3 |
| Contact-conductance boundary, steady state | Series thermal-resistance network |
| Energy ledger closure | Discrete conservation of the scheme |

Each run additionally reports:

- **Convergence.** The case is re-solved on three systematically refined
  meshes and timesteps; the report gives the change on refinement, the observed
  order and a pass/fail against tolerance.
- **Energy balance.** Every pathway — surface input, storage, perfusion,
  conduction to the core, metabolic generation — is tallied and the residual
  reported.
- **Uncertainty.** A one-at-a-time sensitivity sweep over layer thickness,
  conductivity, perfusion and contact conductance, reported as a band rather
  than a single over-precise value.
- **Dimensionality.** The Fourier number and the analytic disc-source spreading
  factor say whether a depth-only model is defensible for this contact patch,
  and bound how much a 1D model over-predicts when it is not.

```bash
cd src-tauri && cargo test
```

## What the mechanical model does

The pressure stimulus runs a one-dimensional layered mechanical solver that
mirrors the thermal stack. Under a normal contact pressure the same stress is
carried through the depth (series equilibrium), decaying with depth by the
Boussinesq solution for a circular contact, and each layer responds as a linear
Kelvin–Voigt viscoelastic solid:

```
σ(z) = p · [1 − z³ / (a² + z²)^{3/2}]      (Boussinesq axial decay)
ε(t) = (σ/E)(1 − e^{−t/τ})                  (Kelvin–Voigt creep)
```

From this it reports indentation over time (creep during the hold, recovery
after release), per-layer strain and stress, and permanent set once a layer
exceeds its yield strain. A structural (bone) layer shields the softer tissue
behind it, which is why deep marrow does not spuriously compress.

For **cyclic** loading on bone it evaluates fatigue with a Basquin S–N law and
Palmgren–Miner damage:

```
Nf = (σf' / σa)^m        D = N / Nf
```

calibrated to the cortical-bone fatigue literature (σa ≈ 60 MPa → ~10³ cycles),
and reports cycles-to-failure, accumulated damage, residual stiffness and the
permanent shape change accumulating with cycles.

References: Agache et al. (1980) for skin elasticity; Reilly & Burstein (1975)
for cortical bone modulus; Carter & Caler (1981/1985) and Pattin et al. (1996)
for bone fatigue. Verified for internal consistency (series compliance, creep
asymptote, S–N calibration, Miner damage); **not** validated against
experimental deformation datasets.

## Where this is going

The core is a general **contact → stimulus → tissue-response** engine. Skin is
the first validated material; bone, cartilage and in-vitro constructs are
additional modules on the same framework, and heat and mechanical load are the
first two stimulus modules. New tissues and stimuli slot in without
re-architecting the contact workflow, which is the basis for growing this into a
computational testing layer between designing something and building it.

## What it is not

**This is a research prototype, not a validated safety or clinical model, and
nothing it outputs is medical advice.**

The distinction that matters:

- *Verification* asks whether the code solves the equations it claims to. That
  is done, and the suite above is the evidence.
- *Validation* asks whether those equations predict real tissue response. **That
  has not been done.** No published experimental burn dataset has been run
  through this model, and no holdout benchmark exists yet.

Specific gaps to close before describing any result as accurate:

1. **No experimental benchmarks.** Assemble published cases with their skin
   site, contact conditions and measured outcomes, split into calibration and
   holdout sets, and report error against the holdout set only.
2. **Tissue properties are unverified.** Every value carries its source and a
   review status, and all of them currently read as representative literature
   values rather than source-checked ones. They also carry ranges, which is why
   results are reported as bands.
3. **Damage kinetics are unverified.** The Henriques coefficients are the values
   most widely reproduced in secondary literature; confirm them against the
   primary paper before relying on Ω quantitatively.
4. **Contact conductance is estimated, not measured.** For a dry contact it
   comes from a correlation developed for metals, applied to skin. It is the
   single largest source of uncertainty; measure it and enter it directly where
   you can.
5. **Geometry is one-dimensional.** Small contact patches spread heat sideways
   and the model flags this, but it cannot resolve it. An axisymmetric or 3D
   solver is required for small tips and edges.
6. **Heat and mechanical load are implemented; cold and electrical are not.**
   The mechanical model is verified for internal consistency but, like the heat
   path, is not yet validated against experimental data. Cold and electrical
   stimuli remain deliberately absent until their models are built and checked.

## Provenance

Every run exports a time-series CSV, a depth-profile CSV and a JSON manifest.
The manifest records the model version and timestamp, all resolved inputs, the
tissue properties with their sources and review status, solver settings and
mesh resolution, the convergence and verification reports, the uncertainty
bounds and every warning raised.
