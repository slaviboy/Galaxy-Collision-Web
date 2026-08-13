/**
 * Number of doubles per particle in the integrator state vector:
 * x, y, vx, vy.
 */
export const STATE_STRIDE = 4;

/**
 * Number of doubles per particle in the derivative vector:
 * dx/dt, dy/dt, dvx/dt, dvy/dt (stored as vx, vy, ax, ay).
 */
export const DERIV_STRIDE = 4;

/** Number of doubles per particle in the auxiliary array: mass only. */
export const AUX_STRIDE = 1;

/**
 * Lightweight view onto one particle inside the packed state/aux arrays.
 * Does not own memory; it stores array references plus an index, matching
 * C++ `ParticleData` which holds pointers into `PODState` / `PODAuxState`.
 */
export class ParticleData {
    /** Packed state: [x, y, vx, vy] per particle. */
    public state: Float64Array | null;
    /** Packed auxiliary data: [mass] per particle. */
    public aux: Float64Array | null;
    /** Particle index into `state` and `aux`. */
    public index: number;

    /**
     * @param state Shared state buffer, or null if this view is empty.
     * @param aux Shared mass buffer, or null if this view is empty.
     * @param index Particle index.
     */
    constructor(
        state: Float64Array | null = null,
        aux: Float64Array | null = null,
        index: number = 0) {
        this.state = state;
        this.aux = aux;
        this.index = index;
    }

    /** Returns a new view that points at the same particle. */
    public clone(): ParticleData {
        return new ParticleData(this.state, this.aux, this.index);
    }

    /** Copies array references and index from another view (not the particle values). */
    public copyFrom(ref: ParticleData): void {
        this.state = ref.state;
        this.aux = ref.aux;
        this.index = ref.index;
    }

    /** Clears this view so it no longer refers to a particle. */
    public reset(): void {
        this.state = null;
        this.aux = null;
        this.index = 0;
    }

    /**
     * Matches the C++ `IsNull` name, which actually returns true when both
     * pointers are set (i.e. the view is valid).
     */
    public isNull(): boolean {
        return this.state !== null && this.aux !== null;
    }

    public get x(): number {
        return (this.state as Float64Array)[this.index * STATE_STRIDE];
    }

    public set x(value: number) {
        (this.state as Float64Array)[this.index * STATE_STRIDE] = value;
    }

    public get y(): number {
        return (this.state as Float64Array)[this.index * STATE_STRIDE + 1];
    }

    public set y(value: number) {
        (this.state as Float64Array)[this.index * STATE_STRIDE + 1] = value;
    }

    public get vx(): number {
        return (this.state as Float64Array)[this.index * STATE_STRIDE + 2];
    }

    public set vx(value: number) {
        (this.state as Float64Array)[this.index * STATE_STRIDE + 2] = value;
    }

    public get vy(): number {
        return (this.state as Float64Array)[this.index * STATE_STRIDE + 3];
    }

    public set vy(value: number) {
        (this.state as Float64Array)[this.index * STATE_STRIDE + 3] = value;
    }

    public get mass(): number {
        return (this.aux as Float64Array)[this.index * AUX_STRIDE];
    }

    public set mass(value: number) {
        (this.aux as Float64Array)[this.index * AUX_STRIDE] = value;
    }
}

/**
 * Writes one particle's derivative into the packed deriv buffer.
 * Layout matches C++ `PODDeriv`: vx, vy, ax, ay.
 *
 * @param deriv Destination derivative vector (`dim = N * 4`).
 * @param index Particle index.
 * @param vx dx/dt.
 * @param vy dy/dt.
 * @param ax dvx/dt (acceleration x).
 * @param ay dvy/dt (acceleration y).
 */
export function setDeriv(deriv: Float64Array, index: number, vx: number, vy: number, ax: number, ay: number): void {
    const o = index * DERIV_STRIDE;
    deriv[o] = vx;
    deriv[o + 1] = vy;
    deriv[o + 2] = ax;
    deriv[o + 3] = ay;
}
