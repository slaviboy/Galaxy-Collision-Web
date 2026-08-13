/**
 * Three-dimensional vector used for camera position, look-at, orientation,
 * and the 2D center of mass lifted into 3D (z is typically 0).
 */
export class Vec3 {
    public x: number = 0;
    public y: number = 0;
    public z: number = 0;

    /**
     * @param x X component.
     * @param y Y component.
     * @param z Z component.
     */
    constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}
