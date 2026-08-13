export abstract class VertexBase {
    constructor() { }

    public abstract writeTo(array: Float32Array, offset: number): void
    public abstract numberOfFloats(): number;
}
