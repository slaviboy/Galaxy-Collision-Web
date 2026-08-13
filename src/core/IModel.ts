/**
 * Abstract ODE model: the integrator calls `eval` to obtain dy/dt
 * for a packed state vector of length `dim`.
 */
export abstract class IModel {
    /** Length of the state / derivative vectors. For n-body this is N * 4. */
    private _dim: number;
    /** Human-readable model name shown in the solver id / logs. */
    private _name: string;

    /**
     * @param name Display name.
     * @param dim State-vector length.
     */
    constructor(name: string, dim: number = 1) {
        this._dim = dim;
        this._name = name;
    }

    /** State-vector dimension used by the integrator. */
    public getDim(): number {
        return this._dim;
    }

    /** Updates dimension after the particle count is known. */
    public setDim(dim: number): void {
        this._dim = dim;
    }

    public getName(): string {
        return this._name;
    }

    /**
     * Evaluates the right-hand side of the ODE: `deriv = f(state, time)`.
     * For n-body, this rebuilds the Barnes-Hut tree and fills accelerations.
     */
    public abstract eval(state: Float64Array, time: number, deriv: Float64Array): void;

    /** Whether the simulation should stop. The collision model never finishes. */
    public abstract isFinished(state: Float64Array): boolean;

    /** Packed initial conditions for `IntegratorADB6.setInitialState`. */
    public abstract getInitialState(): Float64Array;
}
