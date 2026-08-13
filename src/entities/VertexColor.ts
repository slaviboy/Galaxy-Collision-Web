import { VertexBase } from '../entities/VertexBase'
import { Vec3 } from '../entities/Vec3'
import { Color } from '../entities/Color'

export class VertexColor extends VertexBase {
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

    public pos: Vec3 = new Vec3();
    public col: Color = new Color(0, 0, 0, 0);

    public numberOfFloats(): number {
        return 7
    }

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
