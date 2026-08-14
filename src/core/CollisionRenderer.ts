import { mat4, vec3 } from 'gl-matrix'

import { VertexColor } from '../entities/VertexColor'
import { VertexBufferLines } from '../vertices/VertexBufferLines'
import { VertexBufferParticles } from '../vertices/VertexBufferParticles'
import { VertexBufferGalaxyStars } from '../vertices/VertexBufferGalaxyStars'
import { VertexBufferGalaxyDust } from '../vertices/VertexBufferGalaxyDust'
import { ModelNBody } from './ModelNBody'
import { IntegratorADB6 } from './IntegratorADB6'
import { BHTreeNode } from './BHTree'
import { Vec3 } from '../entities/Vec3'
import { GalaxyAppearance } from './GalaxyAppearance'

/** Bit flags for overlays and simulation control (same values as C++ NBodyWnd). */
export enum DisplayState {
    NONE = 0,
    AXIS = 1 << 0,
    BODIES = 1 << 1,
    STAT = 1 << 2,
    TREE = 1 << 3,
    TREE_COMPLETE = 1 << 4,
    CENTER_OF_MASS = 1 << 5,
    PAUSE = 1 << 6,
    VERBOSE = 1 << 7,
    HELP = 1 << 8,
    ARROWS = 1 << 9,
    ROI = 1 << 10
}

/** How the Barnes-Hut tree is drawn: hidden, force-approximation cells, or every node. */
export type TreeMode = 'off' | 'approx' | 'complete'

/**
 * Main application class: owns the n-body model, ADB6 integrator, WebGL
 * buffers, camera, and the animation loop.
 *
 * Each frame: optionally `solver.singleStep()`, upload particle positions,
 * rebuild overlay geometry (axis / tree / ROI), then draw.
 */
export class CollisionRenderer {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;

    private vertAxis: VertexBufferLines;
    private vertTree: VertexBufferLines;
    private vertRoi: VertexBufferLines;
    private vertBodies: VertexBufferParticles;
    private vertGalaxy: VertexBufferGalaxyStars;
    private vertGalaxyDust: VertexBufferGalaxyDust;
    private appearance: GalaxyAppearance = new GalaxyAppearance();
    /** Galaxy-Renderer look (dust, red giants, H2) instead of white dots. */
    private _realisticLook: boolean = false;
    /** Wall-clock seconds for star flicker / H2 pulse. */
    private visualTime: number = 0;

    /** Orthographic field of view (length of an axis in parsecs). C++ starts at 30. */
    private _fov: number = 30;

    private matProjection: mat4 = mat4.create();
    private matView: mat4 = mat4.create();

    /** Camera at (0,0,2) looking at origin, matching SDLWindow defaults. */
    private camPos: vec3 = vec3.fromValues(0, 0, 2);
    private camLookAt: vec3 = vec3.fromValues(0, 0, 0);
    private camOrient: vec3 = vec3.fromValues(0, 1, 0);

    private flags: DisplayState = DisplayState.BODIES | DisplayState.AXIS | DisplayState.STAT | DisplayState.VERBOSE;

    /** Opening-angle slider range. Higher theta ≈ fewer force terms ≈ faster, less accurate. */
    public static readonly THETA_MIN = 0.1;
    public static readonly THETA_MAX = 20;

    private _galaxy1Stars: number = ModelNBody.GALAXY1_STARS_DEFAULT;
    private _galaxy2Stars: number = ModelNBody.GALAXY2_STARS_DEFAULT;
    private _galaxy1X: number = ModelNBody.GALAXY1_X_DEFAULT;
    private _galaxy1Y: number = ModelNBody.GALAXY1_Y_DEFAULT;
    private _galaxy2X: number = ModelNBody.GALAXY2_X_DEFAULT;
    private _galaxy2Y: number = ModelNBody.GALAXY2_Y_DEFAULT;

    private model: ModelNBody;
    private solver: IntegratorADB6;

    private fps: number = 0;
    private frameCount: number = 0;
    private fpsLastTime: number = 0;

    private statsEl: HTMLElement | null;
    private helpEl: HTMLElement | null;
    /** Called after keyboard toggles so the HTML panel stays in sync. */
    private onFlagsChanged: (() => void) | null = null;

    /**
     * Creates WebGL resources, builds the collision IC, runs ADB6 RK4 warmup,
     * and starts `requestAnimationFrame`.
     */
    public constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        this.gl = this.canvas.getContext("webgl2") as WebGL2RenderingContext;
        if (this.gl === null) {
            throw new Error("Unable to initialize WebGL2. Your browser may not support it.");
        }

        this.vertAxis = new VertexBufferLines(this.gl, 1, this.gl.DYNAMIC_DRAW);
        this.vertTree = new VertexBufferLines(this.gl, 1, this.gl.DYNAMIC_DRAW);
        this.vertRoi = new VertexBufferLines(this.gl, 1, this.gl.DYNAMIC_DRAW);
        this.vertBodies = new VertexBufferParticles(this.gl);
        this.vertGalaxy = new VertexBufferGalaxyStars(this.gl);
        this.vertGalaxyDust = new VertexBufferGalaxyDust(this.gl);

        this.statsEl = document.getElementById("statsOverlay");
        this.helpEl = document.getElementById("helpOverlay");

        this.model = new ModelNBody(
            this._galaxy1Stars, this._galaxy2Stars,
            this._galaxy1X, this._galaxy1Y,
            this._galaxy2X, this._galaxy2Y);
        this.solver = new IntegratorADB6(this.model, this.model.getSuggestedTimeStep());
        this.solver.setInitialState(this.model.getInitialState());

        this.initGL();
        this.bindInput();
        window.addEventListener("resize", () => this.onResize());

        this.fpsLastTime = performance.now();
        window.requestAnimationFrame((timeStamp) => this.mainLoop(timeStamp));
    }

    /** Lets UiController refresh checkboxes after keyboard shortcuts. */
    public setFlagsChangedCallback(cb: () => void): void {
        this.onFlagsChanged = cb;
    }

    /** Invokes the UI sync callback if one is registered. */
    private notifyFlagsChanged(): void {
        if (this.onFlagsChanged) {
            this.onFlagsChanged();
        }
    }

    /** Returns true if `flag` is set in the display bitmask. */
    private hasFlag(flag: DisplayState): boolean {
        return (this.flags & flag) != 0;
    }

    /** Sets or clears a single display flag without touching the others. */
    private setFlag(flag: DisplayState, stat: boolean): void {
        if (stat)
            this.flags |= flag;
        else
            this.flags &= ~flag;
    }

    /** Pause skips `singleStep` but still redraws. */
    public get paused(): boolean {
        return this.hasFlag(DisplayState.PAUSE);
    }

    public set paused(value: boolean) {
        this.setFlag(DisplayState.PAUSE, value);
    }

    public get showBodies(): boolean {
        return this.hasFlag(DisplayState.BODIES);
    }

    public set showBodies(value: boolean) {
        this.setFlag(DisplayState.BODIES, value);
    }

    /**
     * When true, bodies are drawn with Galaxy-Renderer sprites (dust, red
     * giants, flickering stars, H2) instead of white dots. Physics is unchanged.
     */
    public get realisticLook(): boolean {
        return this._realisticLook;
    }

    public set realisticLook(value: boolean) {
        this._realisticLook = value;
        if (value) {
            this.rebuildAppearance();
        }
    }

    public get showAxis(): boolean {
        return this.hasFlag(DisplayState.AXIS);
    }

    public set showAxis(value: boolean) {
        this.setFlag(DisplayState.AXIS, value);
    }

    public get showStat(): boolean {
        return this.hasFlag(DisplayState.STAT);
    }

    public set showStat(value: boolean) {
        this.setFlag(DisplayState.STAT, value);
        this.updateOverlays();
    }

    public get showCom(): boolean {
        return this.hasFlag(DisplayState.CENTER_OF_MASS);
    }

    public set showCom(value: boolean) {
        this.setFlag(DisplayState.CENTER_OF_MASS, value);
    }

    public get showRoi(): boolean {
        return this.hasFlag(DisplayState.ROI);
    }

    public set showRoi(value: boolean) {
        this.setFlag(DisplayState.ROI, value);
    }

    public get showHelp(): boolean {
        return this.hasFlag(DisplayState.HELP);
    }

    public set showHelp(value: boolean) {
        this.setFlag(DisplayState.HELP, value);
        if (value) {
            this.setFlag(DisplayState.STAT, false);
        }
        this.updateOverlays();
    }

    public get treeMode(): TreeMode {
        if (!this.hasFlag(DisplayState.TREE)) {
            return 'off';
        }
        if (this.hasFlag(DisplayState.TREE_COMPLETE)) {
            return 'complete';
        }
        return 'approx';
    }

    public set treeMode(mode: TreeMode) {
        this.flags &= ~(DisplayState.TREE | DisplayState.TREE_COMPLETE);
        if (mode === 'approx') {
            this.flags |= DisplayState.TREE;
        }
        else if (mode === 'complete') {
            this.flags |= DisplayState.TREE | DisplayState.TREE_COMPLETE;
        }
    }

    /** Barnes-Hut opening angle; higher is faster and less accurate. */
    public get theta(): number {
        return this.model.getTheta();
    }

    public set theta(value: number) {
        this.model.setTheta(Math.min(CollisionRenderer.THETA_MAX, Math.max(CollisionRenderer.THETA_MIN, value)));
    }

    public get galaxy1Stars(): number {
        return this._galaxy1Stars;
    }

    public set galaxy1Stars(value: number) {
        const n = this.clampStarCount(value, ModelNBody.GALAXY1_STARS_DEFAULT, ModelNBody.GALAXY1_STARS_MAX);
        if (n === this._galaxy1Stars) {
            return;
        }
        this._galaxy1Stars = n;
        this.reset();
    }

    public get galaxy2Stars(): number {
        return this._galaxy2Stars;
    }

    public set galaxy2Stars(value: number) {
        const n = this.clampStarCount(value, ModelNBody.GALAXY2_STARS_DEFAULT, ModelNBody.GALAXY2_STARS_MAX);
        if (n === this._galaxy2Stars) {
            return;
        }
        this._galaxy2Stars = n;
        this.reset();
    }

    public get galaxy1X(): number {
        return this._galaxy1X;
    }

    public set galaxy1X(value: number) {
        this.setGalaxyCoord('_galaxy1X', value);
    }

    public get galaxy1Y(): number {
        return this._galaxy1Y;
    }

    public set galaxy1Y(value: number) {
        this.setGalaxyCoord('_galaxy1Y', value);
    }

    public get galaxy2X(): number {
        return this._galaxy2X;
    }

    public set galaxy2X(value: number) {
        this.setGalaxyCoord('_galaxy2X', value);
    }

    public get galaxy2Y(): number {
        return this._galaxy2Y;
    }

    public set galaxy2Y(value: number) {
        this.setGalaxyCoord('_galaxy2Y', value);
    }

    private setGalaxyCoord(field: '_galaxy1X' | '_galaxy1Y' | '_galaxy2X' | '_galaxy2Y', value: number): void {
        const n = this.clampCoord(value);
        if (n === this[field]) {
            return;
        }
        this[field] = n;
        this.reset();
    }

    private clampCoord(value: number): number {
        return Math.min(ModelNBody.POSITION_MAX, Math.max(ModelNBody.POSITION_MIN, value));
    }

    /**
     * Slider range for a galaxy: default/10 .. explicit max.
     */
    public static starCountBounds(defaultCount: number, maxCount: number): { min: number, max: number } {
        return {
            min: Math.max(1, Math.floor(defaultCount / 10)),
            max: maxCount
        };
    }

    private clampStarCount(value: number, defaultCount: number, maxCount: number): number {
        const bounds = CollisionRenderer.starCountBounds(defaultCount, maxCount);
        return Math.min(bounds.max, Math.max(bounds.min, Math.floor(value)));
    }

    /** Orthographic field of view in parsecs. */
    public get fov(): number {
        return this._fov;
    }

    public set fov(value: number) {
        this._fov = Math.max(0.5, value);
        this.adjustCamera();
    }

    /**
     * Multiplies FOV by `scale` (0.9 = zoom in, 1.1 = zoom out, like C++ keypad +/-).
     */
    public scaleFov(scale: number): void {
        this.fov = this._fov * scale;
        this.notifyFlagsChanged();
    }

    /** Rebuilds particles and restarts ADB6 (includes RK4 warmup). */
    public reset(): void {
        this.model = new ModelNBody(
            this._galaxy1Stars, this._galaxy2Stars,
            this._galaxy1X, this._galaxy1Y,
            this._galaxy2X, this._galaxy2Y);
        this.solver = new IntegratorADB6(this.model, this.model.getSuggestedTimeStep());
        this.solver.setInitialState(this.model.getInitialState());
        if (this._realisticLook) {
            this.rebuildAppearance();
        }
    }

    /** Assigns visual-only star / dust / H2 sprites to the current n-body particles. */
    private rebuildAppearance(): void {
        this.appearance.rebuild(this.solver.getState(), this.model.numStars1, this.model.getN());
    }

    /** Cycles tree overlay: off → approximation cells → complete tree → off. */
    public cycleTree(): void {
        if (!this.hasFlag(DisplayState.TREE)) {
            this.treeMode = 'approx';
            console.log("Display:  Tree cells used in force calculation");
        }
        else if (this.hasFlag(DisplayState.TREE) && !this.hasFlag(DisplayState.TREE_COMPLETE)) {
            this.treeMode = 'complete';
            console.log("Display:  Complete tree");
        }
        else {
            this.treeMode = 'off';
            console.log("Display:  No tree");
        }
        this.notifyFlagsChanged();
    }

    /** Compiles shaders, allocates GPU buffers, and sets the viewport. */
    private initGL(): void {
        this.vertAxis.initialize();
        this.vertTree.initialize();
        this.vertRoi.initialize();
        this.vertBodies.initialize();
        this.vertGalaxy.initialize();
        this.vertGalaxyDust.initialize();

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.disable(this.gl.DEPTH_TEST);
        this.adjustCamera();
    }

    /** Matches the canvas backing store to the window and rebuilds the projection. */
    private onResize(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width = window.innerWidth + "px";
        this.canvas.style.height = window.innerHeight + "px";
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.adjustCamera();
    }

    /**
     * Orthographic projection of size `_fov`, aspect-corrected, plus lookAt.
     * Matches C++ `glOrtho(-l,l,-l,l,-l,l)` with extra aspect for widescreen.
     */
    private adjustCamera(): void {
        let l: number = this._fov / 2.0;
        let aspect: number = this.canvas.width / this.canvas.height;

        mat4.ortho(
            this.matProjection,
            -l * aspect, l * aspect,
            -l, l,
            -l, l);

        mat4.lookAt(
            this.matView,
            this.camPos,
            this.camLookAt,
            this.camOrient);
    }

    /** Registers the keyboard shortcuts from NBodyWnd. */
    private bindInput(): void {
        window.addEventListener("keydown", (ev: KeyboardEvent) => this.onKeyDown(ev));
    }

    /**
     * Keyboard map (same letters as C++):
     * a axis, b bodies, t tree, c COM, h help, s stats, r ROI, v verbose,
     * y/x theta, +/- zoom, space pause.
     */
    private onKeyDown(ev: KeyboardEvent): void {
        switch (ev.key) {
            case "a":
                this.showAxis = !this.showAxis;
                console.log("Display:  Toggling axis " + (this.showAxis ? "on" : "off"));
                break;
            case "b":
                this.showBodies = !this.showBodies;
                console.log("Display:  Toggling bodies " + (this.showBodies ? "on" : "off"));
                break;
            case "t":
                this.cycleTree();
                return;
            case "c":
                this.showCom = !this.showCom;
                console.log("Display:  Center of mass " + (this.showCom ? "on" : "off"));
                break;
            case "h":
                this.showHelp = !this.showHelp;
                console.log("Display:  Help text " + (this.showHelp ? "on" : "off"));
                break;
            case "s":
                this.showStat = !this.showStat;
                console.log("Display:  statistics " + (this.showStat ? "on" : "off"));
                break;
            case "r":
                this.showRoi = !this.showRoi;
                console.log("Display:  region of interest " + (this.showRoi ? "on" : "off"));
                break;
            case "v":
                this.setFlag(DisplayState.VERBOSE, !this.hasFlag(DisplayState.VERBOSE));
                this.model.setVerbose(this.hasFlag(DisplayState.VERBOSE));
                console.log("Simulation:  verbose mode " + (this.hasFlag(DisplayState.VERBOSE) ? "on" : "off"));
                break;
            case "y":
                this.theta = this.theta + 0.1;
                break;
            case "x":
                this.theta = this.theta - 0.1;
                break;
            case "+":
            case "=":
                this.scaleFov(0.9);
                return;
            case "-":
            case "_":
                this.scaleFov(1.1);
                return;
            case " ":
            case "Pause":
                this.paused = !this.paused;
                console.log("Simulation:  pause " + (this.paused ? "on" : "off"));
                ev.preventDefault();
                break;
            default:
                if (ev.code === "NumpadAdd") {
                    this.scaleFov(0.9);
                    return;
                }
                if (ev.code === "NumpadSubtract") {
                    this.scaleFov(1.1);
                    return;
                }
                return;
        }
        this.notifyFlagsChanged();
    }

    /** Tick marks and axes translated to the center of mass. */
    private updateAxis(origin: Vec3): void {
        let vert: VertexColor[] = [];
        let idx: number[] = [];

        let s: number = Math.pow(10, Math.floor(Math.log10(this._fov / 2)));
        let l: number = this._fov / 100;
        let p: number = 0;

        let r: number = 0.3;
        let g: number = 0.3;
        let b: number = 0.3;
        let a: number = 0.8;
        const ox = origin.x;
        const oy = origin.y;

        for (let i = 0; p < this._fov; ++i) {
            p += s;
            idx.push(vert.length);
            vert.push(new VertexColor(ox + p, oy - l, 0, r, g, b, a));
            idx.push(vert.length);
            vert.push(new VertexColor(ox + p, oy + l, 0, r, g, b, a));

            idx.push(vert.length);
            vert.push(new VertexColor(ox - p, oy - l, 0, r, g, b, a));
            idx.push(vert.length);
            vert.push(new VertexColor(ox - p, oy, 0, r, g, b, a));

            idx.push(vert.length);
            vert.push(new VertexColor(ox - l, oy + p, 0, r, g, b, a));
            idx.push(vert.length);
            vert.push(new VertexColor(ox, oy + p, 0, r, g, b, a));

            idx.push(vert.length);
            vert.push(new VertexColor(ox - l, oy - p, 0, r, g, b, a));
            idx.push(vert.length);
            vert.push(new VertexColor(ox, oy - p, 0, r, g, b, a));
        }

        idx.push(vert.length);
        vert.push(new VertexColor(ox - this._fov, oy, 0, r, g, b, a));
        idx.push(vert.length);
        vert.push(new VertexColor(ox + this._fov, oy, 0, r, g, b, a));
        idx.push(vert.length);
        vert.push(new VertexColor(ox, oy - this._fov, 0, r, g, b, a));
        idx.push(vert.length);
        vert.push(new VertexColor(ox, oy + this._fov, 0, r, g, b, a));

        this.vertAxis.createBuffer(vert, idx, this.gl.LINES);
    }

    /** Appends one line segment (two vertices) to overlay geometry. */
    private addLine(vert: VertexColor[], idx: number[],
        x0: number, y0: number, x1: number, y1: number,
        r: number, g: number, b: number, a: number): void {
        idx.push(vert.length);
        vert.push(new VertexColor(x0, y0, 0, r, g, b, a));
        idx.push(vert.length);
        vert.push(new VertexColor(x1, y1, 0, r, g, b, a));
    }

    /** Red cross at COM plus the square ROI box of side `_roi`. */
    private updateRoi(cm: Vec3): void {
        let vert: VertexColor[] = [];
        let idx: number[] = [];

        let l = this._fov / 20;
        this.addLine(vert, idx, cm.x - l, cm.y, cm.x + l, cm.y, 1, 0, 0, 1);
        this.addLine(vert, idx, cm.x, cm.y - l, cm.x, cm.y + l, 1, 0, 0, 1);

        l = this.model.getROI() / 2.0;
        this.addLine(vert, idx, cm.x - l, cm.y + l, cm.x + l, cm.y + l, 1, 0, 0, 1);
        this.addLine(vert, idx, cm.x + l, cm.y + l, cm.x + l, cm.y - l, 1, 0, 0, 1);
        this.addLine(vert, idx, cm.x + l, cm.y - l, cm.x - l, cm.y - l, 1, 0, 0, 1);
        this.addLine(vert, idx, cm.x - l, cm.y - l, cm.x - l, cm.y + l, 1, 0, 0, 1);

        this.vertRoi.createBuffer(vert, idx, this.gl.LINES);
    }

    /** Walks the current Barnes-Hut tree into line geometry. */
    private updateTree(): void {
        let vert: VertexColor[] = [];
        let idx: number[] = [];
        const complete = this.hasFlag(DisplayState.TREE_COMPLETE);
        this.drawNode(this.model.getRootNode(), 0, complete, vert, idx);
        this.vertTree.createBuffer(vert, idx, this.gl.LINES);
    }

    /**
     * Recursively emits cell rectangles. `complete` draws every node;
     * otherwise only nodes that were not opened (`!wasTooClose`) are drawn —
     * i.e. the cells actually used as monopoles for particle 0.
     */
    private drawNode(
        pNode: BHTreeNode,
        level: number,
        complete: boolean,
        vert: VertexColor[],
        idx: number[]): void {
        const col = Math.max(1 - level * 0.2, 0);
        let r: number;
        let g: number;
        let b: number;
        if (complete) {
            r = col;
            g = 1;
            b = col;
        }
        else {
            r = 0;
            g = 1;
            b = 0;
        }

        if (complete || !pNode.wasTooClose()) {
            const min = pNode.getMin();
            const max = pNode.getMax();
            this.addLine(vert, idx, min.x, min.y, max.x, min.y, r, g, b, 1);
            this.addLine(vert, idx, max.x, min.y, max.x, max.y, r, g, b, 1);
            this.addLine(vert, idx, max.x, max.y, min.x, max.y, r, g, b, 1);
            this.addLine(vert, idx, min.x, max.y, min.x, min.y, r, g, b, 1);

            if (this.hasFlag(DisplayState.CENTER_OF_MASS) && !pNode.isExternal()) {
                const len = this._fov / 50 * Math.max(1 - level * 0.2, 0.1);
                const cm = pNode.getCenterOfMass();
                this.addLine(vert, idx, cm.x - len, cm.y, cm.x + len, cm.y, col, 1, col, 1);
                this.addLine(vert, idx, cm.x, cm.y - len, cm.x, cm.y + len, col, 1, col, 1);
            }
        }

        if (!complete && !pNode.wasTooClose()) {
            return;
        }

        for (let i = 0; i < 4; ++i) {
            const child = pNode.quadNode[i];
            if (child) {
                this.drawNode(child, level + 1, complete, vert, idx);
            }
        }
    }

    /** Shows or hides the HTML stats and help panels. */
    private updateOverlays(): void {
        if (this.helpEl) {
            this.helpEl.style.display = this.showHelp ? "block" : "none";
        }
        if (this.statsEl) {
            this.statsEl.style.display = this.showStat ? "block" : "none";
        }
    }

    /** Fills the stats overlay with N, theta, FPS, time, camera, FOV, calc count. */
    private updateStats(): void {
        if (!this.showStat || !this.statsEl) {
            return;
        }

        const pRoot = this.model.getRootNode();
        const fmt = (n: number, digits: number) => n.toFixed(digits);
        this.statsEl.textContent =
            "Number of bodies (outside tree): " + pRoot.getNum() + " (" + pRoot.getNumRenegades() + ")\n" +
            "Theta: " + fmt(pRoot.getTheta(), 1) + "\n" +
            "FPS: " + this.fps + "\n" +
            "Time: " + fmt(this.solver.getTime(), 1) + " y\n" +
            "Camera: " + fmt(this.camPos[0], 2) + ", " + fmt(this.camPos[1], 2) + ", " + fmt(this.camPos[2], 2) + "\n" +
            "LookAt: " + fmt(this.camLookAt[0], 2) + ", " + fmt(this.camLookAt[1], 2) + ", " + fmt(this.camLookAt[2], 2) + "\n" +
            "Field of view: " + fmt(this._fov, 2) + " pc\n" +
            "Calculations: " + pRoot.statGetNumCalc() + "\n" +
            "Solver: " + this.solver.getID();
    }

    /** Advances physics (unless paused) and rebuilds GPU overlay/particle data. */
    private update(): void {
        if (!this.hasFlag(DisplayState.PAUSE)) {
            this.solver.singleStep();
        }

        const cm = this.model.getCenterOfMass();

        if (this.showAxis) {
            this.updateAxis(cm);
        }
        if (this.showRoi) {
            this.updateRoi(cm);
        }
        if (this.hasFlag(DisplayState.TREE)) {
            this.updateTree();
        }
        if (this.showBodies) {
            if (this._realisticLook) {
                this.appearance.pack(this.solver.getState(), this.model.getN());
                this.vertGalaxy.setShaderVariables(this.visualTime, 62, 52, 1);
                this.vertGalaxy.updatePacked(this.appearance.getStarPacked(), this.appearance.starCount);
                this.vertGalaxyDust.setShaderVariables(
                    this.visualTime, 62, 52, 1,
                    this._fov / Math.max(this.canvas.height, 1));
                this.vertGalaxyDust.updatePacked(this.appearance.getGlowPacked(), this.appearance.glowVertexCount);
            }
            else {
                this.vertBodies.updateFromState(this.solver.getState(), this.model.getN());
            }
        }

        this.updateStats();
        this.updateOverlays();
    }

    /** Clears to dark blue and draws axis, tree, particles, then ROI. */
    private render(): void {
        if (this._realisticLook) {
            this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        }
        else {
            this.gl.clearColor(0.0, 0.0, 0.1, 1.0);
        }
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        this.adjustCamera();

        if (this.showAxis && !this._realisticLook) {
            this.vertAxis.draw(this.matView, this.matProjection);
        }
        if (this.hasFlag(DisplayState.TREE)) {
            this.vertTree.draw(this.matView, this.matProjection);
        }
        if (this.showBodies) {
            if (this._realisticLook) {
                this.vertGalaxy.draw(this.matView, this.matProjection);
                this.vertGalaxyDust.draw(this.matView, this.matProjection);
            }
            else {
                this.vertBodies.draw(this.matView, this.matProjection);
            }
        }
        if (this.showRoi) {
            this.vertRoi.draw(this.matView, this.matProjection);
        }
    }

    /** Animation-frame callback: FPS sample, update, render, then request the next frame. */
    public mainLoop(timestamp: number): void {
        let error = false;
        try {
            this.frameCount++;
            if (timestamp - this.fpsLastTime >= 1000) {
                this.fps = Math.round(this.frameCount * 1000 / (timestamp - this.fpsLastTime));
                this.frameCount = 0;
                this.fpsLastTime = timestamp;
            }
            this.visualTime = timestamp * 0.001;

            this.update();
            this.render();
        }
        catch (e: unknown) {
            if (e instanceof Error) {
                console.log(e.message);
            }
            error = true;
        }
        finally {
            if (!error) {
                window.requestAnimationFrame((ts) => this.mainLoop(ts));
            }
        }
    }
}
