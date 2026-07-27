# AGENTS.md

## Cursor Cloud specific instructions

Vide (`vide-cae`) is a single Tauri 2 desktop app: a React 19 + TypeScript +
Three.js frontend with an embedded Rust bioheat solver. Everything runs locally
— there is no backend API, database, or external service. Standard commands live
in `README.md` and `package.json`; the notes below are the non-obvious ones.

### Toolchains

- Node 22 / npm 10 (frontend), Cargo/Rust (solver).
- The Rust default toolchain **must be `>= 1.85`** (set to `stable`). A
  transitive dependency (`idna_adapter`) requires the `edition2024` Cargo
  feature. If `cargo` / `npm run tauri dev` fails with
  `feature 'edition2024' is required`, run `rustup default stable`.

### Running the app

- Full end-to-end (UI + Rust IPC solver): `npm run tauri dev`. This launches
  Vite on port **1420** and the Tauri desktop window.
- The desktop window needs a GUI display; an X server is available on
  `DISPLAY=:1`. In this VM, WebKitGTK renders only with software rendering, so
  start with these env vars set:
  `WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 LIBGL_ALWAYS_SOFTWARE=1`.
  Without them the window may be blank / crash.
- `npm run dev` (Vite alone) serves the UI on port 1420, but simulation actions
  (`run_simulation`, `verify_solver`) invoke the Rust shell over Tauri IPC and
  will fail in browser-only mode. Use `npm run tauri dev` for anything that runs
  the solver.

### Testing / lint / build

- Solver tests (headless, no GUI): `cd src-tauri && cargo test`.
- Frontend has no ESLint or unit-test framework configured; `npm run build`
  runs `tsc` (typecheck) followed by `vite build` and serves as the lint/build
  check.

### Import fixture

- `dev/sample-cube.stl` is a small STL usable for the import → contact → run
  workflow. In the Tauri file dialog, press `Ctrl+L` to type a path directly.
