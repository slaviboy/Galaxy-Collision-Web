/**
 * Two-dimensional vector used for particle positions, tree bounds,
 * and center-of-mass calculations in the Barnes-Hut quadtree.
 */
export class Vec2 {
    /** Horizontal component (parsecs in simulation units). */
    public x: number = 0;
    /** Vertical component (parsecs in simulation units). */
    public y: number = 0;

    /**
     * @param x Horizontal component.
     * @param y Vertical component.
     */
    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }
}
