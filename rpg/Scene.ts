import * as Cozy from "Cozy";
import { getPlayer, getMap, getUiPlane, cameraFollow, getCameraSpeed, setCameraSpeed, getCameraFocus, centerCameraOn } from './Core';
import { ControlStack, ControlMode } from './ControlStack';
import { Entity } from '../shared/Entity';
import { Textbox } from '../shared/Textbox';

enum WaitType { Time, Button, FadeOut, FadeIn };
class Wait {
    type:WaitType;
    promise:Promise<any>;
    args:any;
    resolve:any;

    constructor(type:WaitType, args:any) {
        this.type = type;
        this.args = args;

        this.promise = new Promise(function(resolver, rejecter) {
            this.resolve = resolver;
        }.bind(this));
    }
}

export class Scene {
    static scenes:Array<any> = [];

    private static promise:Promise<any> = null;
    private static restoreControls:ControlMode;
    private static waits:Wait[] = [];
    private static fadeLayer:HTMLElement;

    static get currentScene():any {
        return Scene.scenes[Scene.scenes.length - 1];
    }

    static cleanup():void {
        this.scenes = [];
        this.fadeLayer = null;
    }

    static do(sceneFunc) {
        // TODO remove fadeLayer when it's opacity 0, re-append it as necessary
        // TODO why isn't fadeLayer just a uicomponent?
        if (!this.fadeLayer) {
            this.fadeLayer = document.createElement('div');
            this.fadeLayer.style.height = "100%";
            this.fadeLayer.style.position = "absolute"
            this.fadeLayer.style.top = "0px";
            this.fadeLayer.style.left = "0px";
            this.fadeLayer.style.width = "100%";
            this.fadeLayer.style.height = "100%";
            this.fadeLayer.style.zIndex = "100";
            this.fadeLayer.style.opacity = '0';
            getUiPlane().container.appendChild(this.fadeLayer);
        }

        var wrapper = function*() {
            if (getPlayer() && getPlayer().sprite) {
                getPlayer().sprite.animation = "stand_" + getPlayer().dir;
            }

            ControlStack.push(ControlMode.Scene);

            yield* sceneFunc();
            cameraFollow(getPlayer());
        }

        console.log("PUSHSCENE>", wrapper);
        this.scenes.push([wrapper.call(this)]);
        this.currentScene[1] = this.currentScene[0].next(0);
    }

    static update(dt:number) {
        // console.log("Scene.update");
        if (this.currentScene) {
            // console.log("yes, scene");
            this.currentScene[1] = this.currentScene[0].next(dt);
            while (this.currentScene && this.currentScene[1].done) {
                if (this.scenes.length === 1) {
                    this.fadeLayer.style.opacity = '0';
                }
                // console.log("POPSCENE<", this.currentScene);
                ControlStack.pop();
                this.scenes.pop();
            }
        }
    }

    static *waitButton(b:string) {
        while (true) {
            if (Cozy.Input.pressed(b)) {
                return;
            }
            yield;
        }
    }

    static *waitEntityMove(entity:Entity, steps:Array<number>) {
        const steplen = steps.length;
        let step;
        let dt;
        let dx, dy;
        let tx, ty;

        for (let i = 0; i < steplen; i++) {
            step = steps[i];

            dx = Math.cos(PIXI.DEG_TO_RAD * step);
            dy = Math.sin(PIXI.DEG_TO_RAD * step);
            // correct for floating point Cozy drift
            if (Math.abs(dx) < 1) dx = 0;
            if (Math.abs(dy) < 1) dy = 0;

            tx = entity.position.x + dx * getMap().tileSize.x;
            ty = entity.position.y + dy * getMap().tileSize.y;

            while (entity.position.x !== tx || entity.position.y !== ty) {
                let dt = yield;

                let px = entity.position.x, py = entity.position.y;
                entity.move(entity.speed * dx * dt, entity.speed * dy * dt);
                if (entity.position.x === px && entity.position.y === py) {
                    // got stuck, skip the rest of this movement
                    // TODO make this configurable somehow? in some cases maybe we want to wait for a while instead
                    break;
                }

                if (dx > 0 && entity.position.x > tx) entity.position.x = tx;
                if (dx < 0 && entity.position.x < tx) entity.position.x = tx;
                if (dy > 0 && entity.position.y > ty) entity.position.y = ty;
                if (dy < 0 && entity.position.y < ty) entity.position.y = ty;
            }
        }
    }

    static *waitCameraMove(targetX:number, targetY:number, t:number) {
        cameraFollow(null);
        let speed = getCameraSpeed();
        let targetPt = new PIXI.Point(targetX, targetY);
        let d = Cozy.dist(targetPt, getCameraFocus());
        setCameraSpeed(d / t);
        centerCameraOn(targetPt);

        yield *this.waitTime(t);

        setCameraSpeed(speed);
    }

    static *waitFadeTo(color:string, duration:number) {
        this.fadeLayer.style.opacity = '0';
        this.fadeLayer.style.backgroundColor = color;

        var len = duration;
        var elapsed = 0;
        while(elapsed < duration) {
            elapsed += yield;
            this.fadeLayer.style.opacity = Math.min(1, elapsed / duration).toString();
        }
    }

    static *waitFadeFrom(color:string, duration:number) {
        // console.log("waitFadeFrom", color, duration);
        this.fadeLayer.style.opacity = '1';
        this.fadeLayer.style.backgroundColor = color;

        var elapsed = 0;
        while(elapsed < duration) {
            // console.log("TICK", elapsed, '/', duration);
            elapsed += yield;
            this.fadeLayer.style.opacity = Math.max(0, 1 - (elapsed / duration)).toString();
        }
    }

    static *waitFadeOut(duration:number) {
        yield *this.waitFadeTo(window.getComputedStyle(document.body).backgroundColor, duration);
    }

    static *waitFadeIn(duration:number) {
        yield *this.waitFadeFrom(window.getComputedStyle(document.body).backgroundColor, duration);
    }

    static *waitTime(duration:number) {
        var elapsed = 0;
        while (elapsed < duration) {
            elapsed += yield;
        }
    }

    static *waitFrame(duration:number) {
        var elapsed = 0;
        while (elapsed < duration) {
            elapsed++;
            yield;
        }
    }

    static *waitTextbox(speaker, lines:string[]) {
        for(var i = 0; i < lines.length; i++) {
            if (i === 0) {
                if (speaker) {
                    Textbox.show(getUiPlane(), `<span class="speaker">${speaker}:</span> ${lines[i]}`);
                } else {
                    Textbox.show(getUiPlane(), lines[i]);
                }
            } else {
                Textbox.box.appendText("\n" + lines[i]);
            }

            yield* Scene.waitButton("confirm");
            Cozy.Input.debounce("confirm");
        }

        Textbox.hide();
    }
}
