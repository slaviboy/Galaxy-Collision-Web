# Classes

Each TypeScript class in `src/`, what it is for, and how it fits the simulation.

---

## Entry and UI

### `index.ts` (module, not a class)

Webpack entry. Finds canvas `#cvCollision`, sizes it to the window, constructs `CollisionRenderer` and `UiController`. Exports `collision` and `uiController` on the `GalaxyCollision` library global.

---

### `UiController` — `src/ui/UiController.ts`

**What it does:** Connects the left-hand HTML form to the renderer.

**How it works:** `bindControls` attaches `onchange` / `oninput` handlers that write flags, theta, FOV, and reset into `CollisionRenderer`. Keyboard shortcuts live on the renderer; after a key press it calls `setFlagsChangedCallback`, which runs `syncFromRenderer` so checkboxes and sliders match.

**Important fields:**

- `renderer` — the single `CollisionRenderer` instance.

---

## Simulation core

### `IModel` — `src/core/IModel.ts`

**What it does:** Abstract ODE: a named system with a state vector of length `dim`.

**How it works:** The integrator never knows about particles. It only calls:

- `eval(state, time, deriv)` — fill `deriv = f(state, t)`
- `getInitialState()` — starting `y(0)`
- `isFinished(state)` — stop condition

`ModelNBody` is the only implementation.

**Important fields:**

- `_dim` — length of `state` / `deriv` (`N * 4` for n-body)
- `_name` — display name

---

### `IIntegrator` — `src/core/IIntegrator.ts`

**What it does:** Abstract time stepper. Holds step size `h`, simulated time, and a pointer to an `IModel`.

**How it works:** Subclasses implement `setInitialState`, `singleStep`, and `getState`. `evaluate` is a helper for Runge–Kutta: it forms `y + h * k` and calls `model.eval`.

**Important fields:**

- `m_h` — step size in years (100 for the collision)
- `m_time` — absolute simulated time
- `m_pModel` — the n-body model
- `m_sID` — short label shown in the stats overlay, e.g. `ADB6 (dt=100)`

---

### `IntegratorADB6` — `src/core/IntegratorADB6.ts`

**What it does:** Sixth-order Adams–Bashforth integration of the n-body ODE. This is the solver the C++ demo actually uses.

**How it works:**

1. **Warmup (`setInitialState`)** — five classical RK4 steps fill derivative history `_f[0..4]`. Each RK4 step calls `eval` four times (tree rebuilds). A last `eval` fills `_f[5]`.
2. **Steady state (`singleStep`)** — one linear combination of the six stored derivatives, then one `eval` for the new right-hand side:

   `y_{n+1} = y_n + h * (c0 f_n + c1 f_{n-1} + … + c5 f_{n-5})`

   History buffers are rotated so `_f[5]` is always the newest derivative.

**Important fields:**

- `_state` — current `Float64Array` of positions and velocities
- `_f[6]` — derivative history (each length `dim`)
- `_c[6]` — ADB6 weights `4277/1440`, `-7923/1440`, `9982/1440`, `-7298/1440`, `2877/1440`, `-475/1440`

---

### `ModelNBody` — `src/core/ModelNBody.ts`

**What it does:** The physical model: two galaxies, masses, Barnes-Hut gravity, collision initial conditions.

**How it works:**

- Constructor sets `BHTreeNode.s_gamma = gamma_1` and calls `initCollision()`.
- `initCollision` allocates 5000 particles and the two black holes (see [overview.md](overview.md)).
- `eval` (called by the integrator):
  1. `builtTree` — reset the quadtree to a square of half-side `_roi` around `_center`, insert every particle that lies inside, compute mass and center of mass, then set `_center` to that COM so the tree tracks the system.
  2. For particles `1 .. N-1`, `calcForce` → write `(vx, vy, ax, ay)` into `deriv`.
  3. Reset tree statistics, then force on particle 0 last so overlay “calculations” and `wasTooClose` flags refer to the primary black hole.

Particles outside the ROI throw during insert and are skipped (they still keep their last velocity).

**Important fields:**

- `_pInitial` — packed IC `[x,y,vx,vy] * N`
- `_pAux` — packed masses `[mass] * N`
- `_root` — Barnes-Hut root
- `_roi` — region of interest half-width (tree square is 2×roi on a side)
- `_center` — tree center; follows COM after the first `eval`
- `gamma_1` — G in pc³ / Msun / year²
- `_timeStep` — 100 years

---

### `BHTreeNode` — `src/core/BHTree.ts`

**What it does:** One square cell of the Barnes-Hut quadtree, plus static tree-wide parameters.

**How it works:**

**Insert**

- Empty (`_num == 0`): store the particle as a leaf.
- Leaf (`_num == 1`): if the new point coincides, push it to `s_renegades`; otherwise split into four quadrants, move the old particle, insert the new one.
- Internal (`_num > 1`): recurse into NE/NW/SW/SE.

**Mass distribution** (after all inserts): leaves copy the particle; internal nodes mass-weight children’s centers of mass.

**Force** (`calcTreeForce`):

- One particle in the node → pairwise `calcAcc` (Newtonian with softening).
- Several particles → if `d/r <= theta`, monopole at `_cm`; else open children and sum.

`calcForce` adds renegade pairwise terms. Child nodes are taken from a static **pool** so `reset()` does not allocate every frame.

**Important fields:**

- `quadNode[4]` — children (NE, NW, SW, SE)
- `_particle` — leaf payload
- `_mass`, `_cm` — subtree mass and center of mass
- `_min`, `_max`, `_center` — cell geometry
- `_num` — particle count in the subtree
- `_bSubdivided` / `wasTooClose()` — whether this node was opened in the last force walk (used to draw the “approximation” tree)
- `s_theta` — opening angle (default 0.9)
- `s_gamma` — G in simulation units
- `s_soft` — 0.01, added inside `sqrt(dx²+dy²+s_soft)`
- `s_renegades` — coincident particles
- `pool` / `poolUsed` — recycled child nodes

`EQuadrant` is the child-index enum (`NE=0 … SE=3`).

---

### `ParticleData` and layout helpers — `src/core/Types.ts`

**What it does:** Typed view onto one particle in the packed arrays. Not a copy of the particle.

**How it works:** `state` + `aux` + `index`. Getters `x,y,vx,vy,mass` read/write `state[index*4 + …]` and `aux[index]`. `copyFrom` / `clone` copy the *view*, not the numbers — required because insert stores a view on the leaf.

`setDeriv` writes one particle’s `(vx, vy, ax, ay)` into the derivative buffer.

**Constants:** `STATE_STRIDE = 4`, `DERIV_STRIDE = 4`, `AUX_STRIDE = 1`.

---

### `Constants` — `src/core/Constants.ts`

Physical constants used to build `gamma_1`: solar mass (kg), parsec (m), Newton’s G. Not used at runtime except through `gamma_1`.

---

## Rendering

### `CollisionRenderer` — `src/core/CollisionRenderer.ts`

**What it does:** Application shell: WebGL context, camera, display flags, animation loop, keyboard, stats overlay.

**How it works:**

1. Constructor creates four vertex buffers, `ModelNBody`, `IntegratorADB6`, runs warmup, starts `mainLoop`.
2. `update` — `singleStep` unless paused; rebuild axis at COM, optional tree/ROI; upload particle VBO; refresh HTML stats.
3. `render` — clear `(0, 0, 0.1)`, draw axis, tree, particles, ROI.
4. Flags are a bitmask (`DisplayState`) matching C++ `NBodyWnd`.

**Important fields:**

- `_fov` — orthographic axis length in parsecs (default 30)
- `flags` — overlay / pause bits
- `model` / `solver` — physics
- `camPos` `(0,0,2)`, `camLookAt` origin, `camOrient` `(0,1,0)`
- `vertBodies`, `vertAxis`, `vertTree`, `vertRoi`

`DisplayState` bits: AXIS, BODIES, STAT, TREE, TREE_COMPLETE, CENTER_OF_MASS, PAUSE, VERBOSE, HELP, ROI.

`TreeMode`: `'off' | 'approx' | 'complete'`.

---

### `VertexBufferBase<T>` — `src/vertices/VertexBufferBase.ts`

**What it does:** Shared WebGL2 plumbing: compile shaders, own VAO/VBO/IBO, draw indexed geometry.

**How it works:** Subclass implements `getVertexShaderSource` / `getFragmentShaderSource` and optionally `onSetCustomShaderVariables` / `onBeforeDraw`. `initialize` creates GPU objects once. `createBuffer` packs `VertexBase.writeTo` into a `Float32Array`. `uploadDynamic` is the per-frame path that skips CPU vertex objects. `draw` binds program, sets `viewMat`/`projMat`, blends, `drawElements`.

**Important fields:**

- `vbo`, `ibo`, `vao`
- `elementCount` — index count; 0 means skip draw
- `blendSrc` / `blendDst` — particles use standard alpha; lines use additive

---

### `VertexBufferLines` — `src/vertices/VertexBufferLines.ts`

**What it does:** Colored line segments for axis, tree cells, and ROI.

**How it works:** Attributes: position (vec3, location 0), color (vec4, location 1). Vertex shader: `gl_Position = projMat * vec4(position, 1)`. `onBeforeDraw` sets `lineWidth`.

---

### `VertexBufferParticles` — `src/vertices/VertexBufferParticles.ts`

**What it does:** White point sprites for the 5000 bodies.

**How it works:** `updateFromState` copies `state[i*4], state[i*4+1]` into a reused `Float32Array` (z=0, RGBA=1) and calls `uploadDynamic` with `gl.POINTS`. Uniform `pointSize = 2`. Blend dest is `ONE_MINUS_SRC_ALPHA` so overlapping points stay opaque white, like C++ `glPointSize(2)` without additive blend.

---

### `AttributeDefinition` — `src/core/AttributeDefinition.ts`

**What it does:** One `vertexAttribPointer` record: shader location, component count, byte offset.

Used by all vertex buffers to describe the interleaved layout.

---

## Small types (`src/entities/`)

### `Vec2`

2D vector (`x`, `y`) for tree bounds, COM, and accelerations. Simulation plane is 2D.

### `Vec3`

3D vector for camera and for lifting COM into clip space (`z = 0`).

### `Color`

RGBA floats in `[0, 1]` packed into line/particle vertices.

### `VertexBase`

Abstract: `numberOfFloats()` and `writeTo(Float32Array, offset)` so `VertexBufferBase` can pack any vertex type.

### `VertexColor`

Concrete vertex: `pos` (3 floats) + `col` (4 floats) = 7 floats. Used for both lines and particles.

---

## How the pieces call each other

```
index.ts
  CollisionRenderer
    ModelNBody ──insert/force──► BHTreeNode
    IntegratorADB6 ──eval──► ModelNBody
    VertexBufferParticles  ◄── state x,y
    VertexBufferLines      ◄── axis / tree / ROI
  UiController ──flags/sliders──► CollisionRenderer
```
