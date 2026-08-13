import { VertexBase } from '../entities/VertexBase'
import { Vec3 } from '../entities/Vec3'
import { Color } from '../entities/Color'

/**
 * Vertex with a 3D position and an RGBA color.
 * Packed layout (7 floats): x, y, z, r, g, b, a.
 */
export class VertexColor extends VertexBase {
    /** World-space position. */
    public pos: Vec3 = new Vec3();
    /** Per-vertex color. */
    public col: Color = new Color(0, 0, 0, 0);

    /**
     * @param x Position x.
     * @param y Position y.
     * @param z Position z.
     * @param r Red.
     * @param g Green.
     * @param b Blue.
     * @param a Alpha.
     */
    constructor(x: number, y: number, z: number, r: number, g: number, b: number, a: number) {
        super()

        this.pos.x = x
        this.pos.y = y
        this.pos.z = z

        this.col.r = r
        this.col.g = g
        this.col.b = b
        this.col.a = a
    }

    /** Position (3) + color (4). */
    public numberOfFloats(): number {
        return 7
    }

    /**
     * Packs position then color into the destination array.
     * @param array Destination VBO staging buffer.
     * @param offset Float index where this vertex starts.
     */
    public writeTo(array: Float32Array, offset: number) {
        array[offset + 0] = this.pos.x;
        array[offset + 1] = this.pos.y;
        array[offset + 2] = this.pos.z;

        array[offset + 3] = this.col.r;
        array[offset + 4] = this.col.g;
        array[offset + 5] = this.col.b;
        array[offset + 6] = this.col.a;
    }
}
