# Chemical and topical transport: gated foundation

Vide must not infer drug safety, dosing, efficacy, or patient-specific absorption from a generic simulation. A chemical module can be built only as a compound-specific, research-use transport model with an explicit evidence record.

## Proposed model boundary

The first eligible scope is passive one-dimensional topical transport through a site-specific layered barrier:

- vehicle / formulation reservoir;
- stratum corneum, viable epidermis, and dermis;
- compound-specific diffusion, partition, binding, and clearance parameters;
- protocol timeline (application, occlusion, removal, washout);
- outputs limited to concentration-versus-depth/time and a mass-balance report.

It excludes systemic pharmacokinetics, pharmacodynamics, dosing recommendations, wounds, iontophoresis, metabolism, active transport, and clinical outcome prediction.

## Required evidence before implementation

For each compound/formulation pair, record:

1. molecular identity, vehicle, concentration, pH, and temperature;
2. layer-specific diffusion/partition or a justified estimation method;
3. receptor boundary and sink/clearance assumption;
4. raw in-vitro or ex-vivo permeation time series with units and sampling times;
5. a pre-registered calibration/hold-out split;
6. mass-balance and mesh/timestep convergence checks.

## Coupling policy

Heat and pressure may eventually modify a transport boundary only after an experiment quantifies that modifier for the exact formulation and site. Until then, a heat or compression run must not automatically change chemical flux.

## Delivery sequence

1. Add a `chemical` stimulus as unavailable with this evidence gate shown in the UI.
2. Ingest one public, redistributable passive-permeation dataset for a single compound/formulation.
3. Implement the one-way finite-volume diffusion solver and mass balance.
4. Lock calibration parameters, then evaluate a separate hold-out time series.
5. Expose uncertainty from measurement, parameter ranges, and boundary conditions before considering any coupling.
