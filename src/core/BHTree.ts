import { Vec2 } from '../entities/Vec2'
import { ParticleData } from './Types'

export enum EQuadrant {
    NE = 0,
    NW,
    SW,
    SE,
    NONE
}

export class BHTreeNode {
    public quadNode: (BHTreeNode | null)[] = [null, null, null, null];

    private _particle: ParticleData = new ParticleData();
    private _mass: number = 0;
    private _cm: Vec2 = new Vec2();
    private _min: Vec2 = new Vec2();
    private _max: Vec2 = new Vec2();
    private _center: Vec2 = new Vec2();
    private _parent: BHTreeNode | null = null;
    private _num: number = 0;
    private _bSubdivided: boolean = false;

    private static s_theta: number = 0.9;
    private static s_renegades: ParticleData[] = [];
    public static s_gamma: number = 0;
    private static s_soft: number = 0.1 * 0.1;
    private static s_nNumCalc: number = 0;

    private static pool: BHTreeNode[] = [];
    private static poolUsed: number = 0;

    constructor(min: Vec2, max: Vec2, parent: BHTreeNode | null = null) {
        this.init(min, max, parent);
    }

    private init(min: Vec2, max: Vec2, parent: BHTreeNode | null): void {
        this._particle.reset();
        this._mass = 0;
        this._cm.x = 0;
        this._cm.y = 0;
        this._min.x = min.x;
        this._min.y = min.y;
        this._max.x = max.x;
        this._max.y = max.y;
        this._center.x = min.x + (max.x - min.x) / 2.0;
        this._center.y = min.y + (max.y - min.y) / 2.0;
        this._parent = parent;
        this._num = 0;
        this._bSubdivided = false;
        this.quadNode[0] = this.quadNode[1] = this.quadNode[2] = this.quadNode[3] = null;
    }

    private static acquire(min: Vec2, max: Vec2, parent: BHTreeNode): BHTreeNode {
        if (BHTreeNode.poolUsed < BHTreeNode.pool.length) {
            const node = BHTreeNode.pool[BHTreeNode.poolUsed++];
            node.init(min, max, parent);
            return node;
        }
        const node = new BHTreeNode(min, max, parent);
        BHTreeNode.pool.push(node);
        BHTreeNode.poolUsed++;
        return node;
    }

    public isRoot(): boolean {
        return this._parent == null;
    }

    public isExternal(): boolean {
        return this.quadNode[0] == null &&
            this.quadNode[1] == null &&
            this.quadNode[2] == null &&
            this.quadNode[3] == null;
    }

    public wasTooClose(): boolean {
        return this._bSubdivided;
    }

    public getMin(): Vec2 {
        return this._min;
    }

    public getMax(): Vec2 {
        return this._max;
    }

    public getCenterOfMass(): Vec2 {
        return this._cm;
    }

    public getTheta(): number {
        return BHTreeNode.s_theta;
    }

    public setTheta(theta: number): void {
        BHTreeNode.s_theta = theta;
    }

    public statGetNumCalc(): number {
        return BHTreeNode.s_nNumCalc;
    }

    public getNumRenegades(): number {
        return BHTreeNode.s_renegades.length;
    }

    public getNum(): number {
        return this._num;
    }

    public statReset(): void {
        if (!this.isRoot()) {
            throw new Error("Only the root node may reset statistics data.");
        }

        BHTreeNode.s_nNumCalc = 0;

        const resetFlag = (pNode: BHTreeNode): void => {
            pNode._bSubdivided = false;
            for (let i = 0; i < 4; ++i) {
                const child = pNode.quadNode[i];
                if (child) {
                    resetFlag(child);
                }
            }
        };
        resetFlag(this);
    }

    public reset(min: Vec2, max: Vec2): void {
        if (!this.isRoot()) {
            throw new Error("Only the root node may reset the tree.");
        }

        this.quadNode[0] = this.quadNode[1] = this.quadNode[2] = this.quadNode[3] = null;
        BHTreeNode.poolUsed = 0;

        this._min.x = min.x;
        this._min.y = min.y;
        this._max.x = max.x;
        this._max.y = max.y;
        this._center.x = min.x + (max.x - min.x) / 2.0;
        this._center.y = min.y + (max.y - min.y) / 2.0;
        this._num = 0;
        this._mass = 0;
        this._cm.x = 0;
        this._cm.y = 0;
        this._particle.reset();
        this._bSubdivided = false;

        BHTreeNode.s_renegades = [];
    }

    public getQuadrant(x: number, y: number): EQuadrant {
        if (x <= this._center.x && y <= this._center.y) {
            return EQuadrant.SW;
        }
        else if (x <= this._center.x && y >= this._center.y) {
            return EQuadrant.NW;
        }
        else if (x >= this._center.x && y >= this._center.y) {
            return EQuadrant.NE;
        }
        else if (x >= this._center.x && y <= this._center.y) {
            return EQuadrant.SE;
        }
        else if (x > this._max.x || y > this._max.y || x < this._min.x || y < this._min.y) {
            throw new Error(
                "Can't determine quadrant!\n" +
                "particle  : (" + x + ", " + y + ")\n" +
                "quadMin   : (" + this._min.x + ", " + this._min.y + ")\n" +
                "quadMax   : (" + this._max.x + ", " + this._max.y + ")\n" +
                "quadCenter: (" + this._center.x + ", " + this._center.y + ")");
        }
        else {
            throw new Error("Can't determine quadrant!");
        }
    }

    public createQuadNode(eQuad: EQuadrant): BHTreeNode {
        switch (eQuad) {
            case EQuadrant.SW:
                return BHTreeNode.acquire(this._min, this._center, this);
            case EQuadrant.NW:
                return BHTreeNode.acquire(
                    new Vec2(this._min.x, this._center.y),
                    new Vec2(this._center.x, this._max.y),
                    this);
            case EQuadrant.NE:
                return BHTreeNode.acquire(this._center, this._max, this);
            case EQuadrant.SE:
                return BHTreeNode.acquire(
                    new Vec2(this._center.x, this._min.y),
                    new Vec2(this._max.x, this._center.y),
                    this);
            default:
                throw new Error("Can't determine quadrant!\n");
        }
    }

    public computeMassDistribution(): void {
        if (this._num == 1) {
            this._mass = this._particle.mass;
            this._cm.x = this._particle.x;
            this._cm.y = this._particle.y;
        }
        else {
            this._mass = 0;
            this._cm.x = 0;
            this._cm.y = 0;

            for (let i = 0; i < 4; ++i) {
                const child = this.quadNode[i];
                if (child) {
                    child.computeMassDistribution();
                    this._mass += child._mass;
                    this._cm.x += child._cm.x * child._mass;
                    this._cm.y += child._cm.y * child._mass;
                }
            }

            this._cm.x /= this._mass;
            this._cm.y /= this._mass;
        }
    }

    private calcAcc(p1: ParticleData, p2: ParticleData, acc: Vec2): void {
        acc.x = 0;
        acc.y = 0;

        if (p1 === p2) {
            return;
        }

        const x1 = p1.x;
        const y1 = p1.y;
        const x2 = p2.x;
        const y2 = p2.y;
        const m2 = p2.mass;

        const r = Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2) + BHTreeNode.s_soft);
        if (r > 0) {
            const k = BHTreeNode.s_gamma * m2 / (r * r * r);
            acc.x += k * (x2 - x1);
            acc.y += k * (y2 - y1);
        }
        else {
            acc.x = 0;
            acc.y = 0;
        }
    }

    public calcForce(p1: ParticleData, acc: Vec2): void {
        this.calcTreeForce(p1, acc);

        if (BHTreeNode.s_renegades.length) {
            let ax = acc.x;
            let ay = acc.y;
            for (let i = 0; i < BHTreeNode.s_renegades.length; ++i) {
                this.calcAcc(p1, BHTreeNode.s_renegades[i], acc);
                ax += acc.x;
                ay += acc.y;
            }
            acc.x = ax;
            acc.y = ay;
        }
    }

    private calcTreeForce(p1: ParticleData, acc: Vec2): void {
        if (this._num == 1) {
            this.calcAcc(p1, this._particle, acc);
            BHTreeNode.s_nNumCalc++;
        }
        else {
            const r = Math.sqrt(
                (p1.x - this._cm.x) * (p1.x - this._cm.x) +
                (p1.y - this._cm.y) * (p1.y - this._cm.y));
            const d = this._max.x - this._min.x;
            if (d / r <= BHTreeNode.s_theta) {
                this._bSubdivided = false;
                const k = BHTreeNode.s_gamma * this._mass / (r * r * r);
                acc.x = k * (this._cm.x - p1.x);
                acc.y = k * (this._cm.y - p1.y);
                BHTreeNode.s_nNumCalc++;
            }
            else {
                this._bSubdivided = true;
                let ax = 0;
                let ay = 0;
                for (let q = 0; q < 4; ++q) {
                    const child = this.quadNode[q];
                    if (child) {
                        child.calcTreeForce(p1, acc);
                        ax += acc.x;
                        ay += acc.y;
                    }
                }
                acc.x = ax;
                acc.y = ay;
            }
        }
    }

    public dumpNode(quad: number, level: number): void {
        let space = "";
        for (let i = 0; i < level; ++i) {
            space += "  ";
        }

        console.log(space + "Quadrant " + quad + ": " +
            space + "(num=" + this._num + "; " +
            space + "mass=" + this._mass + ";" +
            space + "cx=" + this._cm.x + ";" +
            space + "cy=" + this._cm.y + ")");

        for (let i = 0; i < 4; ++i) {
            const child = this.quadNode[i];
            if (child) {
                child.dumpNode(i, level + 1);
            }
        }
    }

    public insert(newParticle: ParticleData, level: number): void {
        const px = newParticle.x;
        const py = newParticle.y;
        if ((px < this._min.x || px > this._max.x) || (py < this._min.y || py > this._max.y)) {
            throw new Error(
                "Particle position (" + px + ", " + py + ") " +
                "is outside tree node (" +
                "min.x=" + this._min.x + ", " +
                "max.x=" + this._max.x + ", " +
                "min.y=" + this._min.y + ", " +
                "max.y=" + this._max.y + ")");
        }

        if (this._num > 1) {
            const eQuad = this.getQuadrant(px, py);
            if (!this.quadNode[eQuad]) {
                this.quadNode[eQuad] = this.createQuadNode(eQuad);
            }
            (this.quadNode[eQuad] as BHTreeNode).insert(newParticle, level + 1);
        }
        else if (this._num == 1) {
            const p2x = this._particle.x;
            const p2y = this._particle.y;

            if ((px == p2x) && (py == p2y)) {
                BHTreeNode.s_renegades.push(newParticle.clone());
            }
            else {
                let eQuad = this.getQuadrant(p2x, p2y);
                if (this.quadNode[eQuad] == null) {
                    this.quadNode[eQuad] = this.createQuadNode(eQuad);
                }
                (this.quadNode[eQuad] as BHTreeNode).insert(this._particle, level + 1);
                this._particle.reset();

                eQuad = this.getQuadrant(px, py);
                if (!this.quadNode[eQuad]) {
                    this.quadNode[eQuad] = this.createQuadNode(eQuad);
                }
                (this.quadNode[eQuad] as BHTreeNode).insert(newParticle, level + 1);
            }
        }
        else if (this._num == 0) {
            this._particle.copyFrom(newParticle);
        }

        this._num++;
    }
}
