/**
 * RGBA color stored as floats in [0, 1]. Used by line and particle vertices
 * when packing data into a WebGL vertex buffer.
 */
export class Color {
    /** Red channel, 0–1. */
    public r: number = 0;
    /** Green channel, 0–1. */
    public g: number = 0;
    /** Blue channel, 0–1. */
    public b: number = 0;
    /** Alpha channel, 0–1. */
    public a: number = 0;

    /**
     * @param r Red.
     * @param g Green.
     * @param b Blue.
     * @param a Alpha (opacity).
     */
    constructor(r: number = 1, g: number = 1, b: number = 1, a: number = 0) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}
