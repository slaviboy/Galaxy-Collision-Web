import { IModel } from './IModel'

export abstract class IIntegrator {
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

    public setStepSize(h: number): void {
        this.m_h = h;
    }

    public getStepSize(): number {
        return this.m_h;
    }

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

    public reverse(): void {
        this.m_h *= -1;
    }

    public abstract setInitialState(state: Float64Array): void;
    public abstract singleStep(): void;
    public abstract getState(): Float64Array;

    public getID(): string {
        return this.m_sID;
    }

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

    protected m_pModel: IModel;
    protected m_h: number;
    protected m_time: number;
    protected m_err: number;
    protected m_sID: string;
}
