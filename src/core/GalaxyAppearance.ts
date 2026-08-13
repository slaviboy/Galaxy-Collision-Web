import { colorFromTemperature } from './ColorFromTemperature'
import { STATE_STRIDE } from './Types'

/** Matches Galaxy-Renderer-master `Star.type`. */
export const VISUAL_STAR = 0
export const VISUAL_DUST = 1
export const VISUAL_FILAMENT = 2
export const VISUAL_H2_HALO = 3
export const VISUAL_H2_CORE = 4

/** Interleaved floats: x y z r g b a mag type flickerPhase flickerAmp. */
export const FLOATS_PER_VISUAL = 11
/** Glow quad vertex: center xyz, color rgba, mag, type, phase, amp, corner xy. */
export const FLOATS_PER_GLOW_VERT = 13
const QUAD_CORNERS: number[][] = [
    [-1, -1], [1, -1], [1, 1],
    [-1, -1], [1, 1], [-1, 1]
]

/**
 * Visual-only sprites (stars, dust, filaments, H2) that ride on n-body
 * particles. Physics is unchanged: extras never enter the Barnes-Hut tree.
 *
 * Placement and colour follow Galaxy-Renderer-master `Galaxy::InitStarsAndDust`
 * and `Helper::ColorFromTemperature`. Dust / H2 offsets are in each parent's
 * velocity frame so they stay with tidal tails during the collision.
 */
export class GalaxyAppearance {
    private parent: Uint32Array = new Uint32Array(0)
    private ox: Float32Array = new Float32Array(0)
    private oy: Float32Array = new Float32Array(0)
    private r: Float32Array = new Float32Array(0)
    private g: Float32Array = new Float32Array(0)
    private b: Float32Array = new Float32Array(0)
    private mag: Float32Array = new Float32Array(0)
    private type: Float32Array = new Float32Array(0)
    private flickerPhase: Float32Array = new Float32Array(0)
    private flickerAmp: Float32Array = new Float32Array(0)
    private _count: number = 0
    private _starCount: number = 0
    private _glowSprites: number = 0
    private packedStars: Float32Array = new Float32Array(0)
    private packedGlow: Float32Array = new Float32Array(0)

    public get count(): number {
        return this._count
    }

    public get starCount(): number {
        return this._starCount
    }

    public get glowVertexCount(): number {
        return this._glowSprites * 6
    }

    /**
     * Rebuilds the visual catalog from the current n-body layout.
     * @param state Packed [x,y,vx,vy] * N (used for radius / colour).
     * @param numStars1 Disk count of galaxy 1 (BH2 index is `1 + numStars1`).
     * @param n Total n-body particles.
     */
    public rebuild(state: Float64Array, numStars1: number, n: number): void {
        const bh2 = 1 + numStars1
        const items: {
            parent: number
            ox: number
            oy: number
            r: number
            g: number
            b: number
            mag: number
            type: number
            flickerPhase: number
            flickerAmp: number
        }[] = []

        const push = (
            parent: number,
            ox: number,
            oy: number,
            temp: number,
            mag: number,
            type: number,
            flickerPhase: number,
            flickerAmp: number): void => {
            const col = colorFromTemperature(temp)
            items.push({
                parent: parent,
                ox: ox,
                oy: oy,
                r: col.r,
                g: col.g,
                b: col.b,
                mag: mag,
                type: type,
                flickerPhase: flickerPhase,
                flickerAmp: flickerAmp
            })
        }

        const rnd = (): number => Math.random()
        const radiusOf = (i: number, cx: number, cy: number): number => {
            const dx = state[i * STATE_STRIDE] - cx
            const dy = state[i * STATE_STRIDE + 1] - cy
            return Math.sqrt(dx * dx + dy * dy)
        }

        const cx1 = state[0]
        const cy1 = state[1]
        const cx2 = state[bh2 * STATE_STRIDE]
        const cy2 = state[bh2 * STATE_STRIDE + 1]
        const rDisk1 = 10
        const rDisk2 = 3
        const baseTemp = 4000
        // Galaxy.cpp: temp = baseTemp + rad/4.5 with rad up to ~13000 pc.
        const tempFromRad = (rad: number, rMax: number, extra: number): number =>
            baseTemp + (rad / Math.max(rMax, 1e-6)) * (13000 / 4.5) + extra

        const disk: number[] = []
        for (let i = 0; i < n; ++i) {
            if (i !== 0 && i !== bh2) {
                disk.push(i)
            }
        }

        // 1.) Stars — Galaxy.cpp InitStarsAndDust (type 0)
        for (let i = 0; i < n; ++i) {
            const isBh = i === 0 || i === bh2
            if (isBh) {
                push(i, 0, 0, 4800, 1.0, VISUAL_STAR, rnd() * 6.2832, 0.03)
                continue
            }

            let mag = 0.1 + 0.4 * rnd()
            if (i % 60 === 0) {
                mag = Math.min(1, mag + 0.1 + rnd() * 0.4)
            }
            const roll = rnd()
            let temp = 6000 + (4000 * rnd() - 2000)
            let flickerAmp = 0.04 + 0.06 * rnd()
            if (roll < 0.08) {
                temp = 2800 + 1000 * rnd()
                flickerAmp = 0.12 + 0.2 * rnd()
            }
            else if (rnd() < 0.04) {
                flickerAmp = 0.2 + 0.3 * rnd()
            }
            push(i, 0, 0, temp, mag, VISUAL_STAR, rnd() * 6.2832, flickerAmp)
        }

        if (disk.length > 0) {
        /**
         * Visual-only two-arm spiral + bulge. Physics stays a round n-body
         * disk; dust/H2 are painted on like Galaxy-Renderer density waves.
         */
        const armWeight = (x: number, y: number, cx: number, cy: number, rMax: number): number => {
            const dx = x - cx
            const dy = y - cy
            const r = Math.sqrt(dx * dx + dy * dy)
            const u = r / Math.max(rMax, 1e-6)
            const theta = Math.atan2(dy, dx)
            const phase = 2.0 * (theta - 3.4 * u)
            let arm = 0.5 + 0.5 * Math.cos(phase)
            arm = arm * arm * arm
            const bulge = Math.exp(-u * 3.6)
            return Math.min(1, bulge * 0.9 + arm * (0.35 + 0.65 * (1 - bulge)))
        }

        const galaxyOf = (parent: number): { cx: number, cy: number, rMax: number, scale: number } => {
            const g1 = parent < bh2
            return {
                cx: g1 ? cx1 : cx2,
                cy: g1 ? cy1 : cy2,
                rMax: g1 ? rDisk1 : rDisk2,
                scale: g1 ? 1 : 0.45
            }
        }

        // 2.) Dust — a faint haze on every disk star (the ISM) plus extra
        // copies in the spiral arms. Sprites stay tight to stars so they
        // merge into lanes instead of floating as isolated globes.
        let dustBudget = 0
        const dustCap = 40000
        for (let s = 0; s < disk.length && dustBudget < dustCap; ++s) {
            const parent = disk[s]
            const g = galaxyOf(parent)
            const px = state[parent * STATE_STRIDE]
            const py = state[parent * STATE_STRIDE + 1]
            const w = armWeight(px, py, g.cx, g.cy, g.rMax)
            const rad = radiusOf(parent, g.cx, g.cy)
            const copies = 2 + Math.floor(w * 6)
            for (let k = 0; k < copies && dustBudget < dustCap; ++k) {
                const ang = rnd() * 6.2832
                const d = (0.01 + 0.06 * rnd()) * g.scale
                push(
                    parent,
                    Math.cos(ang) * d,
                    Math.sin(ang) * d,
                    tempFromRad(rad, g.rMax, 0),
                    0.04 + 0.12 * rnd(),
                    VISUAL_DUST,
                    0,
                    0)
                dustBudget++
            }
        }

        // 3.) Filaments along arm crests (Galaxy.cpp type-2 clumps)
        const filamentParents: number[] = []
        for (let s = 0; s < disk.length; ++s) {
            const parent = disk[s]
            const g = galaxyOf(parent)
            const w = armWeight(
                state[parent * STATE_STRIDE],
                state[parent * STATE_STRIDE + 1],
                g.cx, g.cy, g.rMax)
            if (w > 0.55) {
                filamentParents.push(parent)
            }
        }
        const filamentGroups = Math.min(
            Math.max(4, Math.floor(filamentParents.length / 40)),
            80)
        if (filamentParents.length > 0) {
        for (let g = 0; g < filamentGroups; ++g) {
            const parent = filamentParents[Math.floor(rnd() * filamentParents.length)]
            const gal = galaxyOf(parent)
            const rad = radiusOf(parent, gal.cx, gal.cy)
            const mag = 0.08 + 0.05 * rnd()
            const count = 8 + Math.floor(rnd() * 14)
            const baseAng = rnd() * 6.2832
            for (let k = 0; k < count; ++k) {
                const a = baseAng + (rnd() - 0.5) * 0.28
                const d = (0.02 + 0.1 * rnd()) * gal.scale
                push(
                    parent,
                    Math.cos(a) * d,
                    Math.sin(a) * d,
                    tempFromRad(rad, gal.rMax, -1000),
                    mag + 0.02 * rnd(),
                    VISUAL_FILAMENT,
                    0,
                    0)
            }
        }
        }

        // 4.) H2 in arm crests (star-forming regions)
        const h2Parents = filamentParents.length > 0 ? filamentParents : disk
        const numH2 = Math.min(48, Math.max(8, Math.floor(h2Parents.length / 80)))
        for (let h = 0; h < numH2; ++h) {
            const parent = h2Parents[Math.floor(rnd() * h2Parents.length)]
            const gal = galaxyOf(parent)
            const phase = rnd() * 6.2832
            const mag = 0.08 + 0.05 * rnd()
            const temp = 5500 + 2500 * rnd()
            const ang = rnd() * 6.2832
            const d = (0.02 + 0.08 * rnd()) * gal.scale
            const ox = Math.cos(ang) * d
            const oy = Math.sin(ang) * d
            push(parent, ox, oy, temp, mag, VISUAL_H2_HALO, phase, 0.22)
            push(parent, ox, oy, temp, mag, VISUAL_H2_CORE, phase, 0.22)
        }
        }

        this._count = items.length
        this.parent = new Uint32Array(this._count)
        this.ox = new Float32Array(this._count)
        this.oy = new Float32Array(this._count)
        this.r = new Float32Array(this._count)
        this.g = new Float32Array(this._count)
        this.b = new Float32Array(this._count)
        this.mag = new Float32Array(this._count)
        this.type = new Float32Array(this._count)
        this.flickerPhase = new Float32Array(this._count)
        this.flickerAmp = new Float32Array(this._count)

        this._starCount = 0
        this._glowSprites = 0
        for (let i = 0; i < this._count; ++i) {
            const p = items[i]
            this.parent[i] = p.parent
            this.ox[i] = p.ox
            this.oy[i] = p.oy
            this.r[i] = p.r
            this.g[i] = p.g
            this.b[i] = p.b
            this.mag[i] = p.mag
            this.type[i] = p.type
            this.flickerPhase[i] = p.flickerPhase
            this.flickerAmp[i] = p.flickerAmp
            if (p.type === VISUAL_STAR) {
                this._starCount++
            }
            else {
                this._glowSprites++
            }
        }

        this.packedStars = new Float32Array(this._starCount * FLOATS_PER_VISUAL)
        this.packedGlow = new Float32Array(this._glowSprites * 6 * FLOATS_PER_GLOW_VERT)
    }

    public getStarPacked(): Float32Array {
        return this.packedStars
    }

    public getGlowPacked(): Float32Array {
        return this.packedGlow
    }

    /**
     * Writes current world positions. Stars stay as points; dust / filaments /
     * H2 are expanded to screen-aligned quads so they cannot rasterize as
     * axis-aligned lines (a common WebGL `gl.POINTS` artifact).
     */
    public pack(state: Float64Array, n: number): void {
        const starDest = this.packedStars
        const glowDest = this.packedGlow
        let si = 0
        let gi = 0
        for (let i = 0; i < this._count; ++i) {
            const p = this.parent[i]
            if (p >= n) {
                continue
            }
            const o = p * STATE_STRIDE
            const px = state[o]
            const py = state[o + 1]
            const vx = state[o + 2]
            const vy = state[o + 3]
            const speed = Math.sqrt(vx * vx + vy * vy)
            let c = 1
            let s = 0
            if (speed > 1e-8) {
                c = vx / speed
                s = vy / speed
            }
            const lx = this.ox[i]
            const ly = this.oy[i]
            const x = px + lx * c - ly * s
            const y = py + lx * s + ly * c
            const t = this.type[i]
            if (t === VISUAL_STAR) {
                const vo = si * FLOATS_PER_VISUAL
                starDest[vo] = x
                starDest[vo + 1] = y
                starDest[vo + 2] = 0
                starDest[vo + 3] = this.r[i]
                starDest[vo + 4] = this.g[i]
                starDest[vo + 5] = this.b[i]
                starDest[vo + 6] = 1
                starDest[vo + 7] = this.mag[i]
                starDest[vo + 8] = t
                starDest[vo + 9] = this.flickerPhase[i]
                starDest[vo + 10] = this.flickerAmp[i]
                si++
            }
            else {
                for (let k = 0; k < 6; ++k) {
                    const corner = QUAD_CORNERS[k]
                    const vo = gi * FLOATS_PER_GLOW_VERT
                    glowDest[vo] = x
                    glowDest[vo + 1] = y
                    glowDest[vo + 2] = 0
                    glowDest[vo + 3] = this.r[i]
                    glowDest[vo + 4] = this.g[i]
                    glowDest[vo + 5] = this.b[i]
                    glowDest[vo + 6] = 1
                    glowDest[vo + 7] = this.mag[i]
                    glowDest[vo + 8] = t
                    glowDest[vo + 9] = this.flickerPhase[i]
                    glowDest[vo + 10] = this.flickerAmp[i]
                    glowDest[vo + 11] = corner[0]
                    glowDest[vo + 12] = corner[1]
                    gi++
                }
            }
        }
        this._starCount = si
        this._glowSprites = gi / 6
    }
}
