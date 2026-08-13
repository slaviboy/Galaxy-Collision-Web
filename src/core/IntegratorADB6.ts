import { IIntegrator } from './IIntegrator'
import { IModel } from './IModel'

export class IntegratorADB6 extends IIntegrator {
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

    public reverse(): void {
        this.m_h *= -1;
        this.setInitialState(this.getState());
    }

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

    private _state: Float64Array;
    private _f: Float64Array[];
    private _c: number[] = new Array(6);
}
