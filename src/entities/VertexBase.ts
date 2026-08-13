/**
 * Abstract vertex type that can serialize itself into a tightly packed
 * Float32Array for upload to a WebGL ARRAY_BUFFER.
 */
export abstract class VertexBase {
    constructor() { }

    /**
     * Writes this vertex's floats into `array` starting at `offset`.
     * Layout must match the attribute pointers of the owning vertex buffer.
     */
    public abstract writeTo(array: Float32Array, offset: number): void

    /** Number of 32-bit floats this vertex occupies in the VBO. */
    public abstract numberOfFloats(): number;
}
