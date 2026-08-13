import { CollisionRenderer, TreeMode } from "../core/CollisionRenderer"

export class UiController {
    private renderer: CollisionRenderer

    constructor(renderer: CollisionRenderer) {
        this.renderer = renderer
        this.bindControls()
        this.syncFromRenderer()
        this.renderer.setFlagsChangedCallback(() => this.syncFromRenderer())
    }

    private el<T extends HTMLElement>(id: string): T {
        const node = document.getElementById(id) as T
        if (node == null) {
            throw new Error("UiController: missing element #" + id)
        }
        return node
    }

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

        this.el<HTMLButtonElement>("btnReset").onclick = () => {
            this.renderer.reset()
        }
    }

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
    }
}
