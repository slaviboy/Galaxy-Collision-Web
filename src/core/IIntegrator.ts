import { IModel } from './IModel'

/**
 * Base class for time integrators. Holds the step size, absolute time,
 * and a reference to the ODE model that supplies derivatives.
 */
export abstract class IIntegrator {
    /** Model whose `eval` computes dy/dt. */
    protected m_pModel: IModel;
    /** Integration step size h (years in this simulation). */
    protected m_h: number;
    /** Simulated time after the last completed step. */
    protected m_time: number;
    /** Optional local error estimate (unused by ADB6). */
    protected m_err: number;
    /** Short id string, e.g. "ADB6 (dt=100)". */
    protected m_sID: string;

    /**
     * @param pModel Model to integrate; must not be null.
     * @param h Positive step size.
     */
    constructor(pModel: IModel, h: number) {
        if (pModel == null) {
            throw new Error("Model pointer may not be NULL");
        }
        if (h <= 0) {
            throw new Error("Step size may not be negative or NULL.");
        }

        this.m_pModel = pModel;
        this.m_h = h;
        this.m_time = 0;
        this.m_err = 0;
        this.m_sID = "";
    }

    /** Sets the step size used by subsequent `singleStep` calls. */
    public setStepSize(h: number): void {
        this.m_h = h;
    }

    public getStepSize(): number {
        return this.m_h;
    }

    /** Absolute simulated time (years). */
    public getTime(): number {
        return this.m_time;
    }

    public getError(): number {
        return this.m_err;
    }

    public getModel(): IModel {
        return this.m_pModel;
    }

    public setModel(pModel: IModel): void {
        this.m_pModel = pModel;
    }

    /** Flips the sign of h so integration runs backward in time. */
    public reverse(): void {
        this.m_h *= -1;
    }

    /** Copies `state` into the integrator and prepares history (scheme-specific). */
    public abstract setInitialState(state: Float64Array): void;

    /** Advances the solution by one step of size h. */
    public abstract singleStep(): void;

    /** Current packed state vector (x, y, vx, vy per particle). */
    public abstract getState(): Float64Array;

    public getID(): string {
        return this.m_sID;
    }

    /**
     * Evaluates the model at `initial + h * derivIn` and writes the derivative
     * into `derivOut`. Helper used by multi-stage Runge–Kutta schemes.
     */
    protected evaluate(
        initial: Float64Array,
        derivIn: Float64Array,
        h: number,
        time: number,
        derivOut: Float64Array): void {
        const dim = this.m_pModel.getDim();
        const state = new Float64Array(dim);
        for (let i = 0; i < dim; ++i) {
            state[i] = initial[i] + h * derivIn[i];
        }
        this.m_pModel.eval(state, time + h, derivOut);
    }

    protected setID(sID: string): void {
        this.m_sID = sID;
    }
}
