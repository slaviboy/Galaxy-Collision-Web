import { IIntegrator } from './IIntegrator'
import { IModel } from './IModel'

/**
 * Sixth-order Adams-Bashforth integrator (ADB6).
 *
 * ADB6 is a linear multistep method: it needs six past derivatives. The
 * constructor therefore runs five classical RK4 steps to fill `_f[0..4]`,
 * then one extra `eval` into `_f[5]`. After that, each `singleStep` costs
 * a single model evaluation — important because n-body `eval` rebuilds
 * the Barnes-Hut tree.
 *
 * Coefficients `_c` are the standard ADB6 weights (divided by 1440).
 */
export class IntegratorADB6 extends IIntegrator {
    /** Current packed state (length = model.dim). */
    private _state: Float64Array;
    /** Ring of six derivative histories; `_f[5]` is the newest. */
    private _f: Float64Array[];
    /** ADB6 weights applied to `_f[5] ... _f[0]`. */
    private _c: number[] = new Array(6);

    /**
     * @param pModel N-body model providing derivatives.
     * @param h Step size in years (100 for the collision IC).
     */
    constructor(pModel: IModel, h: number) {
        super(pModel, h);

        this._c[0] = 4277.0 / 1440.0;
        this._c[1] = -7923.0 / 1440.0;
        this._c[2] = 9982.0 / 1440.0;
        this._c[3] = -7298.0 / 1440.0;
        this._c[4] = 2877.0 / 1440.0;
        this._c[5] = -475.0 / 1440.0;

        const dim = pModel.getDim();
        this._state = new Float64Array(dim);
        this._f = [];
        for (let i = 0; i < 6; ++i) {
            this._f.push(new Float64Array(dim));
        }

        this.setID("ADB6 (dt=" + this.m_h + ")");
    }

    /** Integrates backward by negating h and rebuilding the derivative history. */
    public reverse(): void {
        this.m_h *= -1;
        this.setInitialState(this.getState());
    }

    /**
     * One ADB6 step:
     *   y_{n+1} = y_n + h * (c0 f_n + c1 f_{n-1} + ... + c5 f_{n-5})
     * then rotate the history buffers and evaluate f at the new state.
     */
    public singleStep(): void {
        const dim = this.m_pModel.getDim();
        for (let i = 0; i < dim; ++i) {
            this._state[i] += this.m_h * (
                this._c[0] * this._f[5][i] +
                this._c[1] * this._f[4][i] +
                this._c[2] * this._f[3][i] +
                this._c[3] * this._f[2][i] +
                this._c[4] * this._f[1][i] +
                this._c[5] * this._f[0][i]);
        }

        // Rotate so `_f[5]` becomes the slot for the new derivative.
        const oldest = this._f[0];
        this._f[0] = this._f[1];
        this._f[1] = this._f[2];
        this._f[2] = this._f[3];
        this._f[3] = this._f[4];
        this._f[4] = this._f[5];
        this._f[5] = oldest;

        this.m_time += this.m_h;
        this.m_pModel.eval(this._state, this.m_time, this._f[5]);
    }

    /**
     * Copies the initial condition, then performs five RK4 steps to seed
     * `_f[0..4]`. Each RK4 step calls `eval` four times (tree rebuilds).
     * A final `eval` fills `_f[5]` so the first `singleStep` is valid.
     */
    public setInitialState(state: Float64Array): void {
        const dim = this.m_pModel.getDim();
        for (let i = 0; i < dim; ++i) {
            this._state[i] = state[i];
        }

        this.m_time = 0;
        const k1 = new Float64Array(dim);
        const k2 = new Float64Array(dim);
        const k3 = new Float64Array(dim);
        const k4 = new Float64Array(dim);
        const tmp = new Float64Array(dim);

        for (let n = 0; n < 5; ++n) {
            this.m_pModel.eval(this._state, this.m_time, k1);
            for (let i = 0; i < dim; ++i) {
                tmp[i] = this._state[i] + this.m_h * 0.5 * k1[i];
            }

            this.m_pModel.eval(tmp, this.m_time + this.m_h * 0.5, k2);
            for (let i = 0; i < dim; ++i) {
                tmp[i] = this._state[i] + this.m_h * 0.5 * k2[i];
            }

            this.m_pModel.eval(tmp, this.m_time + this.m_h * 0.5, k3);
            for (let i = 0; i < dim; ++i) {
                tmp[i] = this._state[i] + this.m_h * k3[i];
            }

            this.m_pModel.eval(tmp, this.m_time + this.m_h, k4);

            for (let i = 0; i < dim; ++i) {
                this._state[i] += this.m_h / 6 * (k1[i] + 2 * (k2[i] + k3[i]) + k4[i]);
                this._f[n][i] = k1[i];
            }

            this.m_time += this.m_h;
        }

        this.m_pModel.eval(this._state, this.m_time, this._f[5]);
    }

    public getState(): Float64Array {
        return this._state;
    }
}
