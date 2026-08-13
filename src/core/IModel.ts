export abstract class IModel {
    constructor(name: string, dim: number = 1) {
        this._dim = dim;
        this._name = name;
    }

    public getDim(): number {
        return this._dim;
    }

    public setDim(dim: number): void {
        this._dim = dim;
    }

    public getName(): string {
        return this._name;
    }

    public abstract eval(state: Float64Array, time: number, deriv: Float64Array): void;
    public abstract isFinished(state: Float64Array): boolean;
    public abstract getInitialState(): Float64Array;

    private _dim: number;
    private _name: string;
}
