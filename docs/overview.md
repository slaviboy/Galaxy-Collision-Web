# Architecture

This app is a TypeScript / WebGL2 port of the C++ Barnes-Hut galaxy collision simulator in `c/`. Physics (initial conditions, tree, integrator) follows that code; rendering uses the same webpack + `gl-matrix` + WebGL2 pattern as `Galaxy-Renderer-Typescript-main`.

## What the program does

Two galaxies (5000 particles) fall toward each other under gravity. Direct n-body would be O(N²). Barnes-Hut groups distant particles into a quadtree and treats a far-away cell as one mass at its center of mass, bringing the cost down to about O(N log N).

Units:

- Distance: parsec
- Mass: solar mass
- Time: year

Newton's G is converted into those units as `ModelNBody.gamma_1`.

## Frame loop

```
requestAnimationFrame
  └─ CollisionRenderer.mainLoop
       ├─ IntegratorADB6.singleStep          (unless paused)
       │    └─ ModelNBody.eval
       │         ├─ builtTree  (insert all particles, compute mass/CM)
       │         └─ calcForce  (acceleration for each body)
       ├─ upload particle x,y to GPU
       ├─ rebuild axis / tree / ROI line buffers
       └─ draw
```

`eval` is the expensive step: it rebuilds the quadtree and walks it once per particle. ADB6 is used because after a short RK4 warmup each frame needs **one** `eval`, not four.

## Data layout

Integrator state is a `Float64Array` of length `N * 4`:

```
index i:  x, y, vx, vy
```

Masses live in a parallel `Float64Array` of length `N` (they never change). `ParticleData` is a view: array references plus an index, equivalent to C++ pointers into `PODState` / `PODAuxState`.

The derivative vector has the same length, laid out as:

```
index i:  vx, vy, ax, ay     (dx/dt, dy/dt, dvx/dt, dvy/dt)
```

## Initial condition (`InitCollision`)

| Index | Role |
|---|---|
| 0 | Primary black hole at origin, mass `1e6` |
| 1 … N1 | Disk around BH1, radius scale 10, circular orbits |
| N1 + 1 | Secondary black hole at `(10, 10)`, mass `1e5`, orbital speed × 0.9 |
| rest | Disk around BH2, radius scale 3, velocities added to BH2 |

Defaults: N1 = 3999, N2 = 999 (5000 bodies total). Sliders allow N1 from 399–25000 and N2 from 99–10000. Changing either rebuilds the simulation.

Timestep is 100 years. The second black hole’s slightly sub-circular velocity makes the galaxies collide rather than orbit forever.

## Barnes-Hut opening criterion

For a node of width `d` whose center of mass is distance `r` from the target particle:

- if `d / r <= theta` → treat the node as a single mass (monopole)
- else → open the node and visit children

Default `theta = 0.9`. **Higher theta is faster** (more cells approximated, fewer force calculations) and less accurate. The UI slider ranges from 0.1 to 20. Smaller theta is more accurate and slower. Softening `s_soft = 0.01` (≈ 0.1 pc) is added inside the distance square root so close encounters do not blow up.

Particles outside the square region of interest (ROI) are skipped. Two particles at the exact same coordinates are stored as “renegades” and summed directly.

## Camera

Orthographic projection, FOV length 30 pc (same as the C++ SDL window). The camera sits at `(0, 0, 2)` looking at the origin. The axis overlay is drawn at the **center of mass**, not at the origin. Zoom multiplies FOV by 0.9 or 1.1.

## File map

| Path | Role |
|---|---|
| `src/index.ts` | Boot: canvas, renderer, UI |
| `src/core/` | Physics + main renderer |
| `src/vertices/` | WebGL buffers |
| `src/entities/` | Small math / vertex types |
| `src/ui/UiController.ts` | HTML panel |

Class-by-class notes: [classes.md](classes.md).
