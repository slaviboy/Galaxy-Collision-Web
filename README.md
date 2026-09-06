# Galaxy Collision (WebGL)

Barnes-Hut n-body galaxy collision, ported to TypeScript / WebGL2 from the C++ simulator in `c/`.

## Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/slaviboy/RepositoryImages/main/apps/GalaxyCollisionWeb/Screenshot%202026-09-06%20at%2018.29.31.png" width="49%" />
  <img src="https://raw.githubusercontent.com/slaviboy/RepositoryImages/main/apps/GalaxyCollisionWeb/Screenshot%202026-09-06%20at%2018.29.21.png" width="49%" />
</p>


## Live Demo

**Live site:** [slaviboy.github.io/Galaxy-Collision-Web](https://slaviboy.github.io/Galaxy-Collision-Web/)

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
