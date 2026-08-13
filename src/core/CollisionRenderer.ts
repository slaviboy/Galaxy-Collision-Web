import { mat4, vec3 } from 'gl-matrix'

import { VertexColor } from '../entities/VertexColor'
import { VertexBufferLines } from '../vertices/VertexBufferLines'
import { VertexBufferParticles } from '../vertices/VertexBufferParticles'
import { ModelNBody } from './ModelNBody'
import { IntegratorADB6 } from './IntegratorADB6'
import { BHTreeNode } from './BHTree'
import { Vec3 } from '../entities/Vec3'

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

export type TreeMode = 'off' | 'approx' | 'complete'

export class CollisionRenderer {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;

    private vertAxis: VertexBufferLines;
    private vertTree: VertexBufferLines;
    private vertRoi: VertexBufferLines;
    private vertBodies: VertexBufferParticles;

    private _fov: number = 30;

    private matProjection: mat4 = mat4.create();
    private matView: mat4 = mat4.create();

    private camPos: vec3 = vec3.fromValues(0, 0, 2);
    private camLookAt: vec3 = vec3.fromValues(0, 0, 0);
    private camOrient: vec3 = vec3.fromValues(0, 1, 0);

    private flags: DisplayState = DisplayState.BODIES | DisplayState.AXIS | DisplayState.STAT | DisplayState.VERBOSE;

    private model: ModelNBody;
    private solver: IntegratorADB6;

    private fps: number = 0;
    private frameCount: number = 0;
    private fpsLastTime: number = 0;

    private statsEl: HTMLElement | null;
    private helpEl: HTMLElement | null;
    private onFlagsChanged: (() => void) | null = null;

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

        this.statsEl = document.getElementById("statsOverlay");
        this.helpEl = document.getElementById("helpOverlay");

        this.model = new ModelNBody();
        this.solver = new IntegratorADB6(this.model, this.model.getSuggestedTimeStep());
        this.solver.setInitialState(this.model.getInitialState());

        this.initGL();
        this.bindInput();
        window.addEventListener("resize", () => this.onResize());

        this.fpsLastTime = performance.now();
        window.requestAnimationFrame((timeStamp) => this.mainLoop(timeStamp));
    }

    public setFlagsChangedCallback(cb: () => void): void {
        this.onFlagsChanged = cb;
    }

    private notifyFlagsChanged(): void {
        if (this.onFlagsChanged) {
            this.onFlagsChanged();
        }
    }

    private hasFlag(flag: DisplayState): boolean {
        return (this.flags & flag) != 0;
    }

    private setFlag(flag: DisplayState, stat: boolean): void {
        if (stat)
            this.flags |= flag;
        else
            this.flags &= ~flag;
    }

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

    public get theta(): number {
        return this.model.getTheta();
    }

    public set theta(value: number) {
        this.model.setTheta(Math.max(0.1, value));
    }

    public get fov(): number {
        return this._fov;
    }

    public set fov(value: number) {
        this._fov = Math.max(0.5, value);
        this.adjustCamera();
    }

    public scaleFov(scale: number): void {
        this.fov = this._fov * scale;
        this.notifyFlagsChanged();
    }

    public reset(): void {
        this.model = new ModelNBody();
        this.solver = new IntegratorADB6(this.model, this.model.getSuggestedTimeStep());
        this.solver.setInitialState(this.model.getInitialState());
    }

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

    private initGL(): void {
        this.vertAxis.initialize();
        this.vertTree.initialize();
        this.vertRoi.initialize();
        this.vertBodies.initialize();

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.disable(this.gl.DEPTH_TEST);
        this.adjustCamera();
    }

    private onResize(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.width = window.innerWidth + "px";
        this.canvas.style.height = window.innerHeight + "px";
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.adjustCamera();
    }

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

    private bindInput(): void {
        window.addEventListener("keydown", (ev: KeyboardEvent) => this.onKeyDown(ev));
    }

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
                this.theta = Math.max(this.theta - 0.1, 0.1);
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

    private addLine(vert: VertexColor[], idx: number[],
        x0: number, y0: number, x1: number, y1: number,
        r: number, g: number, b: number, a: number): void {
        idx.push(vert.length);
        vert.push(new VertexColor(x0, y0, 0, r, g, b, a));
        idx.push(vert.length);
        vert.push(new VertexColor(x1, y1, 0, r, g, b, a));
    }

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

    private updateTree(): void {
        let vert: VertexColor[] = [];
        let idx: number[] = [];
        const complete = this.hasFlag(DisplayState.TREE_COMPLETE);
        this.drawNode(this.model.getRootNode(), 0, complete, vert, idx);
        this.vertTree.createBuffer(vert, idx, this.gl.LINES);
    }

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

    private updateOverlays(): void {
        if (this.helpEl) {
            this.helpEl.style.display = this.showHelp ? "block" : "none";
        }
        if (this.statsEl) {
            this.statsEl.style.display = this.showStat ? "block" : "none";
        }
    }

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
            this.vertBodies.updateFromState(this.solver.getState(), this.model.getN());
        }

        this.updateStats();
        this.updateOverlays();
    }

    private render(): void {
        this.gl.clearColor(0.0, 0.0, 0.1, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        this.adjustCamera();

        if (this.showAxis) {
            this.vertAxis.draw(this.matView, this.matProjection);
        }
        if (this.hasFlag(DisplayState.TREE)) {
            this.vertTree.draw(this.matView, this.matProjection);
        }
        if (this.showBodies) {
            this.vertBodies.draw(this.matView, this.matProjection);
        }
        if (this.showRoi) {
            this.vertRoi.draw(this.matView, this.matProjection);
        }
    }

    public mainLoop(timestamp: number): void {
        let error = false;
        try {
            this.frameCount++;
            if (timestamp - this.fpsLastTime >= 1000) {
                this.fps = Math.round(this.frameCount * 1000 / (timestamp - this.fpsLastTime));
                this.frameCount = 0;
                this.fpsLastTime = timestamp;
            }

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
