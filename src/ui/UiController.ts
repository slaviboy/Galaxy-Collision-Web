import { CollisionRenderer, TreeMode } from "../core/CollisionRenderer"

/**
 * Binds the HTML control panel to CollisionRenderer.
 *
 * Checkboxes and sliders write into the renderer; keyboard shortcuts on the
 * renderer call `syncFromRenderer` via `setFlagsChangedCallback` so the
 * panel stays consistent.
 */
export class UiController {
    private renderer: CollisionRenderer

    constructor(renderer: CollisionRenderer) {
        this.renderer = renderer
        this.bindControls()
        this.syncFromRenderer()
        this.renderer.setFlagsChangedCallback(() => this.syncFromRenderer())
    }

    /**
     * Looks up a DOM element by id and throws if it is missing
     * (the overlay HTML must match these ids).
     */
    private el<T extends HTMLElement>(id: string): T {
        const node = document.getElementById(id) as T
        if (node == null) {
            throw new Error("UiController: missing element #" + id)
        }
        return node
    }

    /** Wires change/input/click handlers on the left-hand form. */
    private bindControls(): void {
        this.el<HTMLInputElement>("cbPause").onchange = () => {
            this.renderer.paused = this.el<HTMLInputElement>("cbPause").checked
        }
        this.el<HTMLInputElement>("cbShowBodies").onchange = () => {
            this.renderer.showBodies = this.el<HTMLInputElement>("cbShowBodies").checked
        }
        this.el<HTMLInputElement>("cbShowAxis").onchange = () => {
            this.renderer.showAxis = this.el<HTMLInputElement>("cbShowAxis").checked
        }
        this.el<HTMLInputElement>("cbShowStat").onchange = () => {
            this.renderer.showStat = this.el<HTMLInputElement>("cbShowStat").checked
        }
        this.el<HTMLInputElement>("cbShowCom").onchange = () => {
            this.renderer.showCom = this.el<HTMLInputElement>("cbShowCom").checked
        }
        this.el<HTMLInputElement>("cbShowRoi").onchange = () => {
            this.renderer.showRoi = this.el<HTMLInputElement>("cbShowRoi").checked
        }
        this.el<HTMLInputElement>("cbShowHelp").onchange = () => {
            this.renderer.showHelp = this.el<HTMLInputElement>("cbShowHelp").checked
        }
        this.el<HTMLSelectElement>("cbTreeMode").onchange = () => {
            this.renderer.treeMode = this.el<HTMLSelectElement>("cbTreeMode").value as TreeMode
        }

        const slTheta = this.el<HTMLInputElement>("slTheta")
        slTheta.oninput = () => {
            this.renderer.theta = parseFloat(slTheta.value)
            this.el("labelTheta").innerHTML = slTheta.value
        }

        const slFov = this.el<HTMLInputElement>("slFov")
        slFov.oninput = () => {
            this.renderer.fov = parseFloat(slFov.value)
            this.el("labelFov").innerHTML = slFov.value
        }

        const slG1 = this.el<HTMLInputElement>("slGalaxy1Stars")
        slG1.oninput = () => {
            this.el("labelGalaxy1Stars").innerHTML = slG1.value
        }
        slG1.onchange = () => {
            this.renderer.galaxy1Stars = parseInt(slG1.value, 10)
            this.el("labelGalaxy1Stars").innerHTML = String(this.renderer.galaxy1Stars)
        }

        const slG2 = this.el<HTMLInputElement>("slGalaxy2Stars")
        slG2.oninput = () => {
            this.el("labelGalaxy2Stars").innerHTML = slG2.value
        }
        slG2.onchange = () => {
            this.renderer.galaxy2Stars = parseInt(slG2.value, 10)
            this.el("labelGalaxy2Stars").innerHTML = String(this.renderer.galaxy2Stars)
        }

        this.bindCoordSlider("slGalaxy1X", "labelGalaxy1X", (v) => { this.renderer.galaxy1X = v })
        this.bindCoordSlider("slGalaxy1Y", "labelGalaxy1Y", (v) => { this.renderer.galaxy1Y = v })
        this.bindCoordSlider("slGalaxy2X", "labelGalaxy2X", (v) => { this.renderer.galaxy2X = v })
        this.bindCoordSlider("slGalaxy2Y", "labelGalaxy2Y", (v) => { this.renderer.galaxy2Y = v })

        this.el<HTMLButtonElement>("btnReset").onclick = () => {
            this.renderer.reset()
        }
    }

    /**
     * Coordinate sliders update the label while dragging and rebuild
     * the collision IC when the pointer is released.
     */
    private bindCoordSlider(id: string, labelId: string, apply: (value: number) => void): void {
        const sl = this.el<HTMLInputElement>(id)
        sl.oninput = () => {
            this.el(labelId).innerHTML = sl.value
        }
        sl.onchange = () => {
            apply(parseFloat(sl.value))
            this.el(labelId).innerHTML = sl.value
        }
    }

    /** Copies renderer flags and slider values into the form controls. */
    public syncFromRenderer(): void {
        this.el<HTMLInputElement>("cbPause").checked = this.renderer.paused
        this.el<HTMLInputElement>("cbShowBodies").checked = this.renderer.showBodies
        this.el<HTMLInputElement>("cbShowAxis").checked = this.renderer.showAxis
        this.el<HTMLInputElement>("cbShowStat").checked = this.renderer.showStat
        this.el<HTMLInputElement>("cbShowCom").checked = this.renderer.showCom
        this.el<HTMLInputElement>("cbShowRoi").checked = this.renderer.showRoi
        this.el<HTMLInputElement>("cbShowHelp").checked = this.renderer.showHelp
        this.el<HTMLSelectElement>("cbTreeMode").value = this.renderer.treeMode

        const slTheta = this.el<HTMLInputElement>("slTheta")
        slTheta.value = String(this.renderer.theta)
        this.el("labelTheta").innerHTML = slTheta.value

        const slFov = this.el<HTMLInputElement>("slFov")
        slFov.value = String(this.renderer.fov)
        this.el("labelFov").innerHTML = slFov.value

        const slG1 = this.el<HTMLInputElement>("slGalaxy1Stars")
        slG1.value = String(this.renderer.galaxy1Stars)
        this.el("labelGalaxy1Stars").innerHTML = slG1.value

        const slG2 = this.el<HTMLInputElement>("slGalaxy2Stars")
        slG2.value = String(this.renderer.galaxy2Stars)
        this.el("labelGalaxy2Stars").innerHTML = slG2.value

        const slG1X = this.el<HTMLInputElement>("slGalaxy1X")
        slG1X.value = String(this.renderer.galaxy1X)
        this.el("labelGalaxy1X").innerHTML = slG1X.value

        const slG1Y = this.el<HTMLInputElement>("slGalaxy1Y")
        slG1Y.value = String(this.renderer.galaxy1Y)
        this.el("labelGalaxy1Y").innerHTML = slG1Y.value

        const slG2X = this.el<HTMLInputElement>("slGalaxy2X")
        slG2X.value = String(this.renderer.galaxy2X)
        this.el("labelGalaxy2X").innerHTML = slG2X.value

        const slG2Y = this.el<HTMLInputElement>("slGalaxy2Y")
        slG2Y.value = String(this.renderer.galaxy2Y)
        this.el("labelGalaxy2Y").innerHTML = slG2Y.value
    }
}
