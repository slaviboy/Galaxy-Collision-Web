import { IModel } from './IModel'
import { Constants } from './Constants'
import { Vec2 } from '../entities/Vec2'
import { Vec3 } from '../entities/Vec3'
import { BHTreeNode } from './BHTree'
import { ParticleData, STATE_STRIDE, setDeriv } from './Types'

/**
 * Two-dimensional n-body model for a galaxy collision.
 *
 * Owns the initial state, per-particle masses, and the Barnes-Hut root.
 * `eval` rebuilds the tree from the current integrator state and writes
 * accelerations into the derivative vector the ADB6 solver consumes.
 *
 * Units: parsec, solar mass, year. Gravity is `gamma_1`, Newton's G
 * converted into those units.
 */
export class ModelNBody extends IModel {
    /** Packed initial conditions [x, y, vx, vy] * N. */
    private _pInitial: Float64Array | null = null;
    /** Packed masses [mass] * N (constant during the run). */
    private _pAux: Float64Array | null = null;
    /** Barnes-Hut root; rebuilt every `eval`. */
    private _root: BHTreeNode = new BHTreeNode(new Vec2(), new Vec2());
    /** Bounding box of the initial distribution (square after padding). */
    private _min: Vec2 = new Vec2();
    private _max: Vec2 = new Vec2();
    /** Tree is recentered on this point (starts at origin, then follows COM). */
    private _center: Vec2 = new Vec2();
    private _camDir: Vec3 = new Vec3();
    /** Last center of mass, copied during `eval` for the renderer. */
    private _camPos: Vec3 = new Vec3();
    /** Half-size of the square region of interest around `_center`. */
    private _roi: number = 1;
    /** Suggested integrator step (100 years for the collision IC). */
    private _timeStep: number = 1;
    /**
     * G in (pc^3 / Msun / year^2):
     * Gamma / pc^3 * Msun * (seconds per year)^2
     */
    private static readonly gamma_1 =
        Constants.Gamma / (Constants.ParsecInMeter * Constants.ParsecInMeter * Constants.ParsecInMeter)
        * Constants.MassOfSun * (365.25 * 86400) * (365.25 * 86400);
    /** Particle count (5000 for InitCollision). */
    private _num: number = 0;
    /** When true, `builtTree` dumps the quadtree to the console. */
    private _bVerbose: boolean = false;

    constructor() {
        super("N-Body simulation (2D)");
        BHTreeNode.s_gamma = ModelNBody.gamma_1;
        this.initCollision();
    }

    public setROI(roi: number): void {
        this._roi = roi;
    }

    public getSuggestedTimeStep(): number {
        return this._timeStep;
    }

    public getROI(): number {
        return this._roi;
    }

    /** Center of mass of the current tree (after the last `eval`). */
    public getCenterOfMass(): Vec3 {
        const cm2d = this._root.getCenterOfMass();
        return new Vec3(cm2d.x, cm2d.y, 0);
    }

    public getCamDir(): Vec3 {
        return this._camDir;
    }

    public getCamPos(): Vec3 {
        return this._camPos;
    }

    public getInitialState(): Float64Array {
        return this._pInitial as Float64Array;
    }

    /**
     * Sets p2's velocity for a circular orbit around p1:
     * v = sqrt(G m1 / dist), perpendicular to the separation vector.
     *
     * Note: `y1` is taken from `p1.x` to match the C++ source (harmless
     * for the collision IC because both black holes have x == y).
     */
    private getOrbitalVelocity(p1: ParticleData, p2: ParticleData): void {
        const x1 = p1.x;
        const y1 = p1.x;
        const m1 = p1.mass;
        const x2 = p2.x;
        const y2 = p2.y;

        const r0 = x1 - x2;
        const r1 = y1 - y2;

        const dist = Math.sqrt(r0 * r0 + r1 * r1);
        const v = Math.sqrt(ModelNBody.gamma_1 * m1 / dist);

        p2.vx = (r1 / dist) * v;
        p2.vy = (-r0 / dist) * v;
    }

    /**
     * Allocates state/aux arrays for `num` particles and sets the step size.
     * Integrator dimension is `num * 4`.
     */
    private resetDim(num: number, stepsize: number): void {
        this._num = num;
        this.setDim(this._num * STATE_STRIDE);

        this._pInitial = new Float64Array(num * STATE_STRIDE);
        this._pAux = new Float64Array(num);

        this._timeStep = stepsize;

        this._max.x = Number.MIN_VALUE;
        this._max.y = Number.MIN_VALUE;
        this._min.x = Number.MAX_VALUE;
        this._min.y = Number.MAX_VALUE;
        this._center.x = 0;
        this._center.y = 0;
    }

    /**
     * Collision initial condition (matches C++ `InitCollision`):
     * - i = 0: primary black hole at origin, mass 1e6
     * - i = 1..3999: disk around BH1 (radius scale 10)
     * - i = 4000: secondary black hole at (10, 10), mass 1e5, v *= 0.9
     * - i = 4001..4999: disk around BH2 (radius scale 3), velocities added to BH2
     */
    public initCollision(): void {
        this.resetDim(5000, 100);

        const blackHole = new ParticleData();
        const blackHole2 = new ParticleData();
        const initial = this._pInitial as Float64Array;
        const aux = this._pAux as Float64Array;

        for (let i = 0; i < this._num; ++i) {
            const st = new ParticleData(initial, aux, i);

            if (i == 0) {
                blackHole.copyFrom(st);
                st.x = 0;
                st.y = 0;
                st.vx = 0;
                st.vy = 0;
                st.mass = 1000000;
            }
            else if (i < 4000) {
                const rad = 10;
                const r = 0.1 + .8 * (rad * Math.random());
                const a = 2.0 * Math.PI * Math.random();
                st.mass = 0.03 + 20 * Math.random();
                st.x = r * Math.sin(a);
                st.y = r * Math.cos(a);
                this.getOrbitalVelocity(blackHole, st);
            }
            else if (i == 4000) {
                blackHole2.copyFrom(st);
                st.x = 10;
                st.y = 10;
                st.mass = 100000;
                this.getOrbitalVelocity(blackHole, blackHole2);
                blackHole2.vx *= 0.9;
                blackHole2.vy *= 0.9;
            }
            else {
                const rad = 3;
                const r = 0.1 + .8 * (rad * Math.random());
                const a = 2.0 * Math.PI * Math.random();
                st.mass = 0.03 + 20 * Math.random();
                st.x = blackHole2.x + r * Math.sin(a);
                st.y = blackHole2.y + r * Math.cos(a);
                this.getOrbitalVelocity(blackHole2, st);
                st.vx += blackHole2.vx;
                st.vy += blackHole2.vy;
            }

            this._max.x = Math.max(this._max.x, st.x);
            this._max.y = Math.max(this._max.y, st.y);
            this._min.x = Math.min(this._min.x, st.x);
            this._min.y = Math.min(this._min.y, st.y);
        }

        const l = 1.05 * Math.max(this._max.x - this._min.x, this._max.y - this._min.y);
        this._roi = l * 1.5;

        const c = new Vec2(
            this._min.x + (this._max.x - this._min.x) / 2.0,
            this._min.y + (this._max.y - this._min.y) / 2.0);
        this._min.x = c.x - l / 2.0;
        this._max.x = c.x + l / 2.0;
        this._min.y = c.y - l / 2.0;
        this._max.y = c.y + l / 2.0;

        console.log("Initial particle distribution area");
        console.log("----------------------------------");
        console.log("Particle spread:");
        console.log("  xmin=" + this._min.x + ", ymin=" + this._min.y);
        console.log("  xmax=" + this._max.y + ", ymax=" + this._max.y);
        console.log("Bounding box:");
        console.log("  cx =" + c.x + ", cy  =" + c.y);
        console.log("  l  =" + l);
    }

    /**
     * Rebuilds the quadtree over the square ROI centered on `_center`.
     * Particles outside the ROI throw and are omitted. After insert,
     * mass distribution is computed and `_center` is set to the COM.
     */
    private builtTree(state: Float64Array, aux: Float64Array): void {
        this._root.reset(
            new Vec2(this._center.x - this._roi, this._center.y - this._roi),
            new Vec2(this._center.x + this._roi, this._center.y + this._roi));

        const p = new ParticleData(state, aux, 0);
        for (let i = 0; i < this._num; ++i) {
            try {
                p.index = i;
                this._root.insert(p, 0);
            }
            catch (_exc) {
            }
        }

        this._root.computeMassDistribution();
        if (this._bVerbose) {
            console.log("Tree Dump");
            console.log("---------");
            this._root.dumpNode(-1, 0);
            console.log("\n\n");
        }

        const cm = this._root.getCenterOfMass();
        this._center.x = cm.x;
        this._center.y = cm.y;
    }

    public getAuxState(): Float64Array {
        return this._pAux as Float64Array;
    }

    public getRootNode(): BHTreeNode {
        return this._root;
    }

    public getN(): number {
        return this._num;
    }

    public getTheta(): number {
        return this._root.getTheta();
    }

    public setVerbose(bVerbose: boolean): void {
        this._bVerbose = bVerbose;
    }

    public setTheta(theta: number): void {
        this._root.setTheta(theta);
    }

    /**
     * ODE right-hand side: rebuild tree, then for each particle write
     * (vx, vy, ax, ay) into `a_deriv`. Particle 0 is evaluated last so
     * tree statistics / `wasTooClose` flags describe that body.
     */
    public eval(a_state: Float64Array, _a_time: number, a_deriv: Float64Array): void {
        const aux = this._pAux as Float64Array;
        this.builtTree(a_state, aux);

        const acc = new Vec2();
        const p = new ParticleData(a_state, aux, 0);
        for (let i = 1; i < this._num; ++i) {
            p.index = i;
            this._root.calcForce(p, acc);
            setDeriv(a_deriv, i, a_state[i * STATE_STRIDE + 2], a_state[i * STATE_STRIDE + 3], acc.x, acc.y);
        }

        this._root.statReset();
        p.index = 0;
        this._root.calcForce(p, acc);
        setDeriv(a_deriv, 0, a_state[2], a_state[3], acc.x, acc.y);

        this._camPos.x = this._root.getCenterOfMass().x;
        this._camPos.y = this._root.getCenterOfMass().y;
    }

    /** Collision runs indefinitely. */
    public isFinished(_state: Float64Array): boolean {
        return false;
    }
}
