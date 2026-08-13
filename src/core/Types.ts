export const STATE_STRIDE = 4;
export const DERIV_STRIDE = 4;
export const AUX_STRIDE = 1;

export class ParticleData {
    constructor(
        public state: Float64Array | null = null,
        public aux: Float64Array | null = null,
        public index: number = 0) {
    }

    public clone(): ParticleData {
        return new ParticleData(this.state, this.aux, this.index);
    }

    public copyFrom(ref: ParticleData): void {
        this.state = ref.state;
        this.aux = ref.aux;
        this.index = ref.index;
    }

    public reset(): void {
        this.state = null;
        this.aux = null;
        this.index = 0;
    }

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

export function setDeriv(deriv: Float64Array, index: number, vx: number, vy: number, ax: number, ay: number): void {
    const o = index * DERIV_STRIDE;
    deriv[o] = vx;
    deriv[o + 1] = vy;
    deriv[o + 2] = ax;
    deriv[o + 3] = ay;
}
