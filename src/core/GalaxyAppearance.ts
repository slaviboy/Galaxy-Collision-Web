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
        // 2.) Dust — Galaxy.cpp: numDust == numStars, mag 0.02+0.15*rand,
        // temp = baseTemp + rad/4.5. Extra copies so ~40k overlapping 70 px
        // sprites match the C++ preset (40000 dust) on a small n-body disk.
        const numDust = Math.min(40000, Math.max(disk.length * 8, disk.length))
        for (let i = 0; i < numDust; ++i) {
            const parent = disk[i % disk.length]
            const g1 = parent < bh2
            const rad = g1 ? radiusOf(parent, cx1, cy1) : radiusOf(parent, cx2, cy2)
            const rMax = g1 ? rDisk1 : rDisk2
            const scale = g1 ? 1 : 0.45
            const ang = rnd() * 6.2832
            // Keep dust on the stellar disk. Far scatter against empty space
            // reads as isolated brown "globes" (see Galaxy-Renderer: dust sits
            // on the same populated orbits as the stars).
            const d = (0.01 + 0.08 * rnd()) * scale
            push(
                parent,
                Math.cos(ang) * d,
                Math.sin(ang) * d,
                tempFromRad(rad, rMax, 0),
                0.02 + 0.15 * rnd(),
                VISUAL_DUST,
                0,
                0)
        }

        // 3.) Filaments — Galaxy.cpp places a clump on nearby orbits
        // (theta ±10°, small radius jitter), not a long straight line.
        const filamentGroups = Math.max(1, Math.floor(numDust / 100))
        for (let g = 0; g < filamentGroups; ++g) {
            const parent = disk[Math.floor(rnd() * disk.length)]
            const g1 = parent < bh2
            const rad = g1 ? radiusOf(parent, cx1, cy1) : radiusOf(parent, cx2, cy2)
            const rMax = g1 ? rDisk1 : rDisk2
            const scale = g1 ? 1 : 0.45
            const mag = 0.1 + 0.05 * rnd()
            const count = 12 + Math.floor(rnd() * 28)
            const baseAng = rnd() * 6.2832
            for (let k = 0; k < count; ++k) {
                const a = baseAng + (rnd() - 0.5) * 0.35
                const d = (0.03 + 0.16 * rnd()) * scale
                push(
                    parent,
                    Math.cos(a) * d,
                    Math.sin(a) * d,
                    tempFromRad(rad, rMax, -1000),
                    mag + 0.025 * rnd(),
                    VISUAL_FILAMENT,
                    0,
                    0)
            }
        }

        // 4.) H2 — Galaxy.cpp uses 400 regions for ~40k stars; most stay dark
        // because ignition is density-wave based. Scale the count and pulse.
        const numH2 = Math.max(6, Math.round(400 * (disk.length / 40000)))
        for (let h = 0; h < numH2; ++h) {
            const parent = disk[Math.floor(rnd() * disk.length)]
            const phase = rnd() * 6.2832
            const mag = 0.1 + 0.05 * rnd()
            const temp = 6000 + (6000 * rnd()) - 3000
            const g1 = parent < bh2
            const scale = g1 ? 1 : 0.45
            const ang = rnd() * 6.2832
            const d = (0.04 + 0.12 * rnd()) * scale
            const ox = Math.cos(ang) * d
            const oy = Math.sin(ang) * d
            push(parent, ox, oy, temp, mag, VISUAL_H2_HALO, phase, 0.25)
            push(parent, ox, oy, temp, mag, VISUAL_H2_CORE, phase, 0.25)
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
