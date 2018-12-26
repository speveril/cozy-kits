import * as Cozy from 'Cozy';
import { getMap, getPlayer, getSFX } from './Core';
import { ControlStack, ControlMode } from './ControlStack';
import { Entity } from './Entity';
import { Scene } from './Scene';

export module Behavior {
    let guardMutex = null;

    export function _cleanup() {
        guardMutex = null;
    }

    export function *stun(entity:Entity, time:number, returnBehavior:any = null) {
        let behavior = returnBehavior || entity.behavior;
        let counter = 0;
        entity.sprite.flash(3);

        while (counter < time) {
            let dt = yield;
            counter += dt;
        }

        entity.sprite.flash(0);
        return behavior;
    }

    export function *wander(entity:Entity) {
        var direction, dist = 0;

        while (true) {
            while (dist > 0) {
                var dt = yield;
                while (ControlStack.top() !== ControlMode.Map) {
                    dt = yield;
                }
                var x = entity.position.x, y = entity.position.y;
                switch(direction) {
                    case 0: // N
                        entity.move(0, -entity.speed * dt);
                        break;
                    case 1: // E
                        entity.move(entity.speed * dt, 0)
                        break;
                    case 2: // S
                        entity.move(0, entity.speed * dt);
                        break;
                    case 3: // W
                        entity.move(-entity.speed * dt, 0);
                        break;
                    case 4: // wait
                        entity.move(0, 0);
                        break;
                }

                if (x - entity.position.x === 0 && y - entity.position.y === 0 && direction !== 4) {
                    if (Math.random() < 0.5) {
                        direction = 4;
                    } else {
                        dist = 0;
                    }
                } else {
                    dist -= (entity.speed * dt);
                }
            }

            direction = Math.floor(Math.random() * 5);
            dist = (Math.random() * 3 + 1) * getMap().tileSize.x;
        }
    }

    export function *path(entity:Entity, path:Array<any>) {
        console.log("PATH>", entity, path);
        let dt:number;
        let dx:number, dy:number;
        let tx:number, ty:number;
        let px:number, py:number;
        let step:any;
        let framedist:number, dist:number;

        dist = 0;

        for (let i = 0; i < path.length; i++) {
            step = path[i];

            if (step[1] === undefined || step[1] === 0) {
                entity.dir = step[0];
                continue;
            }

            dx = Math.cos(PIXI.DEG_TO_RAD * step[0]);
            dy = Math.sin(PIXI.DEG_TO_RAD * step[0]);

            while (dist < step[1]) {
                dt = yield;
                framedist = entity.speed * dt;

                if (dist + framedist > step[1]) {
                    framedist = step[1] - dist;
                }

                dist += framedist;

                entity.move(framedist * dx, framedist * dy);

                if (dx > 0 && entity.position.x > tx) entity.position.x = tx;
                if (dx < 0 && entity.position.x < tx) entity.position.x = tx;
                if (dy > 0 && entity.position.y > ty) entity.position.y = ty;
                if (dy < 0 && entity.position.y < ty) entity.position.y = ty;
            }
        }
    }

    export function *guard(entity:Entity, direction:number) {
        entity.dir = direction;
        entity.sprite.animation = 'stand';

        let origin = {x:entity.position.x, y:entity.position.y, d:entity.dir};
        let dist = 0, dx, dy;

        var visionDistance:number = entity.params.vision || 3;
        var visionEnd:PIXI.Point = new PIXI.Point(
            entity.position.x + Math.cos(entity.dir * PIXI.DEG_TO_RAD) * visionDistance * getMap().tileSize.x,
            entity.position.y + Math.sin(entity.dir * PIXI.DEG_TO_RAD) * visionDistance * getMap().tileSize.y
        );
        let movement = [];
        // _.times(visionDistance, () => movement.push(direction));
        for (let i = 0; i < visionDistance; i++) {
            movement.push(direction);
        }

        while (true) {
            let dt = yield;
            if (Cozy.distToSegment(getPlayer().position, entity.position, visionEnd) < getPlayer().radius) {
                ControlStack.push(ControlMode.None);

                if (entity.params.notice && entity.params.notice in getMap()) {
                    getMap()[entity.params.notice]();
                } else {
                    getPlayer().sprite.animation = 'stand';

                    let exclamation = entity.params.exclamation || '';

                    entity.emote("!");
                    getSFX('alert').play();

                    while (guardMutex) {
                        dt = yield;
                    }
                    guardMutex = true;

                    entity.respectsObstructions = false;
                    entity.speed = 100;
                    while (Cozy.dist(getPlayer().position, entity.position) - getPlayer().radius - entity.radius > 0) {
                        dt = yield;

                        entity.dir = PIXI.RAD_TO_DEG * Math.atan2(getPlayer().position.y - entity.position.y, getPlayer().position.x - entity.position.x);
                        dx = Math.cos(PIXI.DEG_TO_RAD * entity.dir) * entity.speed * dt;
                        dy = Math.sin(PIXI.DEG_TO_RAD * entity.dir) * entity.speed * dt;
                        entity.move(dx, dy);
                    }

                    if (exclamation !== '') {
                        yield *Scene.waitTextbox(null, [exclamation]);
                    }
                    entity.clearEmote();

                    // TODO this is gross; starting a battle should probably be in
                    // core, but the setup for a battle is system specific? it's a
                    // bit weird.
                    let m = getMap();
                    if (m['waitFight']) {
                        yield *getMap()['waitFight'](entity);
                    }

                    guardMutex = null;
                    ControlStack.pop();

                    if (!entity.destroyed) {
                        let dist = Cozy.dist(origin, entity.position);
                        let dir = Math.atan2(origin.y - entity.position.y, origin.x - entity.position.x) * PIXI.RAD_TO_DEG;
                        yield *Behavior.path(entity, [ [dir,dist] ]);
                        entity.sprite.animation = 'stand';
                        entity.dir = origin.d;
                    }

                }
            }
        }
    }

    export function *guard_right(entity:Entity) {
        yield *guard(entity, 0);
    }

    export function *guard_down(entity:Entity) {
        yield *guard(entity, 90);
    }

    export function *guard_left(entity:Entity) {
        yield *guard(entity, 180);
    }

    export function *guard_up(entity:Entity) {
        yield *guard(entity, 270);
    }

    export function *fight_wander(entity:Entity) {
        let direction = 4, dist = 0, dx, dy;
        let visionDistance:number = (entity.params.vision || 2) * getMap().tileSize.x,
            visionDistance2 = visionDistance * visionDistance;

        while (true) {
            let dt = yield;
            while (ControlStack.top() !== ControlMode.Map) {
                dt = yield;
            }

            if (Cozy.dist2(getPlayer().position, entity.position) <= visionDistance2) {
                let movement = [];
                ControlStack.push(ControlMode.None);

                if (entity.params.notice && entity.params.notice in getMap()) {
                    getMap()[entity.params.notice]();
                } else {
                    getPlayer().sprite.animation = 'stand';

                    let exclamation = entity.params.exclamation || '';

                    entity.emote("!");
                    getSFX('alert').play();

                    while (guardMutex) {
                        dt = yield;
                    }
                    guardMutex = true;

                    entity.respectsObstructions = false;
                    entity.speed = 100;
                    while (Cozy.dist(getPlayer().position, entity.position) - getPlayer().radius - entity.radius > 0) {
                        dt = yield;

                        entity.dir = PIXI.RAD_TO_DEG * Math.atan2(getPlayer().position.y - entity.position.y, getPlayer().position.x - entity.position.x);
                        dx = Math.cos(PIXI.DEG_TO_RAD * entity.dir) * entity.speed * dt;
                        dy = Math.sin(PIXI.DEG_TO_RAD * entity.dir) * entity.speed * dt;
                        entity.move(dx, dy);
                    }

                    if (exclamation !== '') {
                        yield *Scene.waitTextbox(null, [exclamation]);
                    }
                    entity.clearEmote();

                    let m = getMap();
                    if (m['waitFight']) {
                        yield *getMap()['waitFight'](entity);
                    }

                    guardMutex = null;
                    ControlStack.pop();
                }
            } else {
                let x = entity.position.x, y = entity.position.y;
                switch(direction) {
                    case 0: // N
                        entity.move(0, -entity.speed * dt);
                        break;
                    case 1: // E
                        entity.move(entity.speed * dt, 0)
                        break;
                    case 2: // S
                        entity.move(0, entity.speed * dt);
                        break;
                    case 3: // W
                        entity.move(-entity.speed * dt, 0);
                        break;
                    case 4: // wait
                        entity.move(0, 0);
                        break;
                }

                if (x - entity.position.x === 0 && y - entity.position.y === 0 && direction !== 4) {
                    if (Math.random() < 0.5) {
                        direction = 4;
                    } else {
                        dist = 0;
                    }
                } else {
                    dist -= (entity.speed * dt);
                }

                if (dist <= 0) {
                    direction = Math.floor(Math.random() * 5);
                    dist = (Math.random() * 3 + 1) * getMap().tileSize.x;
                }
            }
        }
    }

    export function *guard_wander(entity:Entity) {
        let direction = 4, dist = 0;
        var visionDistance:number = entity.params.vision || 3;

        while (true) {
            let dt = yield;
            var visionEnd:PIXI.Point = new PIXI.Point(
                entity.position.x + Math.cos(entity.dir * PIXI.DEG_TO_RAD) * visionDistance * getMap().tileSize.x,
                entity.position.y + Math.sin(entity.dir * PIXI.DEG_TO_RAD) * visionDistance * getMap().tileSize.y
            );
            if (Cozy.distToSegment(getPlayer().position, entity.position, visionEnd) < getPlayer().radius) {
                let movement = [];
                // _.times(visionDistance, () => movement.push(entity.dir));
                for (let i = 0; i < visionDistance; i++) {
                    movement.push(entity.dir);
                }

                ControlStack.push(ControlMode.None);

                // if (entity.params.notice && _.has(getMap(), entity.params.notice)) {
                if (entity.params.notice && entity.params.notice in getMap()) {
                    getMap()[entity.params.notice]();
                } else {
                    getPlayer().sprite.animation = 'stand';

                    let exclamation = entity.params.exclamation || '';

                    entity.emote("!");
                    getSFX('alert').play();

                    while (guardMutex) {
                        dt = yield;
                    }
                    guardMutex = true;

                    entity.respectsObstructions = false;
                    entity.speed = 100;
                    yield *Scene.waitEntityMove(entity, movement);
                    if (exclamation !== '') {
                        yield *Scene.waitTextbox(null, [exclamation]);
                    }
                    entity.clearEmote();

                    let m = getMap();
                    if (m['waitFight']) {
                        yield *getMap()['waitFight'](entity);
                    }

                    guardMutex = null;
                    ControlStack.pop();
                }
            } else {
                let x = entity.position.x, y = entity.position.y;
                switch(direction) {
                    case 0: // N
                        entity.move(0, -entity.speed * dt);
                        break;
                    case 1: // E
                        entity.move(entity.speed * dt, 0)
                        break;
                    case 2: // S
                        entity.move(0, entity.speed * dt);
                        break;
                    case 3: // W
                        entity.move(-entity.speed * dt, 0);
                        break;
                    case 4: // wait
                        entity.move(0, 0);
                        break;
                }

                if (x - entity.position.x === 0 && y - entity.position.y === 0 && direction !== 4) {
                    if (Math.random() < 0.5) {
                        direction = 4;
                    } else {
                        dist = 0;
                    }
                } else {
                    dist -= (entity.speed * dt);
                }

                if (dist <= 0) {
                    direction = Math.floor(Math.random() * 5);
                    dist = (Math.random() * 3 + 1) * getMap().tileSize.x;
                }
            }
        }
    }
}
