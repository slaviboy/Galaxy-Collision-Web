import { CollisionRenderer } from './core/CollisionRenderer'
import { UiController } from './ui/UiController'

/**
 * Webpack library export (`library: 'GalaxyCollision'`).
 * After the bundle loads, `window.GalaxyCollision.collision` is the renderer.
 */
export var collision: CollisionRenderer | null = null
/** HTML panel controller bound to `collision`. */
export var uiController: UiController | null = null

try {
    var canvas = document.getElementById('cvCollision') as HTMLCanvasElement;
    if (canvas == null) {
        throw Error('The galaxy collision renderer needs a canvas object with id "cvCollision"');
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    collision = new CollisionRenderer(canvas);
    uiController = new UiController(collision);

} catch (e) {
    if (e instanceof Error) {
        alert(e.message);
    }
}
