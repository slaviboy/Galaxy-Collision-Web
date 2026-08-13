# Galaxy Collision (WebGL)

Barnes-Hut n-body galaxy collision, ported to TypeScript / WebGL2 from the C++ simulator in `c/`.

## Build

1. Install dependencies:

   > npm install

2. Build:

   > npm run build

3. Open `dist/index.html` in a browser.

The first load runs ADB6’s RK4 warmup (several tree rebuilds) before the animation starts.

## Documentation

- [Architecture](docs/overview.md) — units, frame loop, initial conditions, Barnes-Hut criterion, camera
- [Classes](docs/classes.md) — what each class does, how it works, and important fields

## Controls

| Key | Action |
|---|---|
| `a` | Toggle axis |
| `b` | Toggle particles |
| `t` | Cycle tree overlay (off / approximation / complete) |
| `c` | Toggle center-of-mass crosses |
| `s` | Toggle statistics |
| `r` | Toggle region of interest |
| `h` | Toggle help |
| `y` / `x` | Increase / decrease Barnes-Hut theta |
| `+` / `-` | Zoom in / out |
| Space | Pause |
