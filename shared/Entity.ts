import * as Cozy from 'Cozy';
import { MapLayer } from './map/MapLayer';

const BOUNCE_GRAVITY = 850;
const BOUNCE_ENTROPY = 0.5;
const BOUNCE_THRESHOLD = 30;

export class Entity {
    public static behaviors = {};

    private spriteDef:any; // can be an object or a string
    private paused:boolean;
    private bouncing:any;
    private path:any;

    public sourceSpriteDef:any;

    public triggersEvents:boolean;
    public respectsObstructions:boolean;
    public name:string;
    public behavior:any;
    public params:any;

    public sprite:Cozy.Sprite;
    public emoteSprite:Cozy.Sprite;
    public layer:MapLayer;
    public speed:number;
    public radius:number;
    public solid:boolean;
    public pushWeight:number;
    public pushStrength:number;

    public shape:Cozy.Shape;

    public pushCallback:any = null; // () => boolean

    public spawn:PIXI.Point;
    private _mapID:string;
    private _destroyed:boolean;
    private _stationary:boolean;
    private movedLastFrame:boolean;

    get stationary():boolean {
        return this._stationary;
    }

    get mapID():string {
        return this._mapID;
    }

    get destroyed():boolean {
        return this._destroyed;
    }

    get dir():number {
        return this.sprite.direction;
    }

    set dir(x:number) {
        this.sprite.direction = x;
    }

    get position():PIXI.ObservablePoint {
        return this.sprite.position;
    }

    constructor(args) {
        if (typeof args.sprite === 'string') {
            this.spriteDef = Cozy.gameDir().file(args.sprite).getData('json');
        } else {
            this.spriteDef = Object.assign({}, args.sprite);
        }

        this.spriteDef.moveCallback = () => this.onSpriteMove();
        this.sourceSpriteDef = args.sourceSpriteDef;

        this.speed = args.speed || 100;
        this.triggersEvents = (args.triggersEvents !== undefined ? args.triggersEvents : false);
        this.respectsObstructions = (args.respectsObstructions !== undefined ? args.respectsObstructions === 'true' : true);
        this.radius = args.radius || this.spriteDef.radius || 8;
        this.name = args.name;
        this.behavior = typeof args.behavior === 'string' && Entity.behaviors[args.behavior]
            ? Entity.behaviors[args.behavior](this) 
            : args.behavior;
        this.paused = false;
        this.bouncing = false;
        this.solid = !(args.solid === 'false' || args.solid === false);
        this._mapID = args.id;
        this._stationary = true;
        this.movedLastFrame = false;
        this.pushStrength = args.pushStrength ||  this.spriteDef.pushStrength || 0;
        this.pushWeight = args.pushWeight || this.spriteDef.pushWeight || Infinity;
        this.params = Object.assign({}, args);

        // TODO extra offset; let spawn define an additional offset to the hotspot to allow for entities "hovering above the ground"
        //      (or, sitting on top of some other thing)

        if (args.hasOwnProperty('spawn')) {
            this.spawn = args.spawn;
        }
    }

    changeSprite(newDef) {
        this.spriteDef = newDef;
        if (this.sprite) {
            let x = this.sprite.position.x;
            let y = this.sprite.position.y;
            let lyr = this.layer;
            this.layer.spriteLayer.remove(this.sprite);
            this.sprite = null;

            this.place(x, y, lyr);
        }
    }

    emote(key:string) {
        if (!this.emoteSprite) {
            this.emoteSprite = new Cozy.Sprite(Cozy.gameDir().file("sprites/emotes.sprite").getData('json')); // TODO ??
            this.layer.spriteLayer.add(this.emoteSprite);
            this.emoteSprite.setPosition(this.sprite.position.x, this.sprite.position.y + 0.01);
            // TODO this would be handled much better with multilayer sprites
        }
        this.emoteSprite.animation = key;
    }

    clearEmote() {
        if (this.emoteSprite) {
            this.layer.spriteLayer.remove(this.emoteSprite);
            this.emoteSprite = null;
        }
    }

    bounce(height:number) {
        this.bouncing = {
            y: 0,
            vy: Math.sqrt(2 * BOUNCE_GRAVITY * height)
        };
    }

    hop(height:number) {
        // TODO
        this.bounce(height);
    }

    place(x:number, y:number, lyr:MapLayer):void {
        if (this.sprite) {
            this.layer.spriteLayer.remove(this.sprite);
            delete this.layer.map.entityLookup[this._mapID];
        } else {
            this.sprite = new Cozy.Sprite(this.spriteDef);
        }
        if (this.emoteSprite) this.layer.spriteLayer.remove(this.emoteSprite);

        this.sprite.setPosition(x, y);
        this.layer = lyr;
        this.layer.spriteLayer.add(this.sprite);

        if (this.emoteSprite) {
            this.layer.spriteLayer.add(this.emoteSprite);
            this.emoteSprite.setPosition(this.sprite.position.x, this.sprite.position.y + 0.1);
        }

        // if (!_.contains(this.layer.entities, this)) {
        if (!this.layer.entities.includes(this)) {
            this.layer.entities.push(this);
        }

        this.layer.map.entityLookup[this._mapID] = this;
    }

    adjust(dx:number, dy:number):void {
        this.sprite.setPosition(this.sprite.position.x + dx, this.sprite.position.y + dy);

        if (this.emoteSprite) {
            this.emoteSprite.setPosition(this.sprite.position.x, this.sprite.position.y + 0.1);
        }
    }

    destroy() {
        this._destroyed = true;
        let index = this.layer.entities.indexOf(this);
        this.layer.entities.splice(index, 1);
        delete this.layer.map.entityLookup[this._mapID];
        this.sprite.layer.remove(this.sprite);
    }

    update(dt:number) {
        if (this._destroyed) return;

        if (this.movedLastFrame) {
            this._stationary = false;
        } else {
            this._stationary = true;
        }

        if (!this.paused) {
            if (this.bouncing) {
                this.bouncing.y += this.bouncing.vy * dt - (BOUNCE_GRAVITY * dt * dt) / 2;
                this.bouncing.vy -= BOUNCE_GRAVITY * dt;

                if (this.bouncing.y <= 0) {
                    this.bouncing.y *= -1;
                    this.bouncing.vy *= -BOUNCE_ENTROPY;
                    if (this.bouncing.vy < BOUNCE_THRESHOLD) {
                        this.bouncing = null;
                    }
                }

                if (this.bouncing) {
                    this.sprite.setOffset(0, -this.bouncing.y);
                    if (this.emoteSprite) {
                        this.emoteSprite.setPosition(this.sprite.position.x, this.sprite.position.y - this.bouncing.y + 0.1);
                    }
                } else {
                    this.sprite.setOffset(0, 0);
                }
            }
            if (this.behavior) {
                let result = this.behavior.next(dt);
                if (result.done) {
                    this.behavior = result.value;
                }
            }
        }

        this.movedLastFrame = false;
    }

    // TODO findPath()

    pause() {
        this.paused = true;
    }

    unpause() {
        this.paused = false;
    }

    move(dx:number, dy:number):void {
        if (dy !== 0 || dx !== 0) {
            this.movedLastFrame = true;
            let newDirection = (Math.atan2(dy, dx) * (180 / Math.PI));
            this.sprite.direction = newDirection;
            this.sprite.animation = 'walk';
        } else {
            this.sprite.animation = 'stand';
        }

        this.slide(dx,dy);
    }

    getObstruction(from:Entity, projectedPosition:any) {
        // treat stationary entities as squares, and moving ones as circles
        // TODO this shouldn't ALWAYS be true; somethings should always be square

        if (this.stationary) {
            let entityX = this.position.x;
            let entityY = this.position.y;
            let entityR = this.radius;
            let diffx = from.sprite.position.x - entityX;
            let diffy = from.sprite.position.y - entityY;

            let edges;
            if (Math.abs(diffx) > Math.abs(diffy)) {
                if (diffx < 0) {
                    edges = [[ { x: entityX - entityR, y: entityY - entityR }, { x: entityX - entityR, y: entityY + entityR } ]];
                } else {
                    edges = [[ { x: entityX + entityR, y: entityY - entityR }, { x: entityX + entityR, y: entityY + entityR } ]];
                }
            } else {
                if (diffy < 0) {
                    edges = [[ { x: entityX - entityR, y: entityY - entityR }, { x: entityX + entityR, y: entityY - entityR } ]];
                } else {
                    edges = [[ { x: entityX - entityR, y: entityY + entityR }, { x: entityX + entityR, y: entityY + entityR } ]];
                }
            }
            for (let j = 0; j < edges.length; j++) {
                let closest = Cozy.closestPointOnLine(projectedPosition, edges[j][0], edges[j][1]); 
                let d = Cozy.dist(projectedPosition, closest);

                // TODO *also* account for angle between entity travel vector and the obstruction line, if distances are equal
                if (d < from.radius) {
                    return {
                        dsort: Cozy.dist({ x: from.sprite.position.x, y: from.sprite.position.y }, closest),
                        d: d,
                        type: 'line',
                        a: edges[j][0],
                        b: edges[j][1],
                        entity: this
                    };
                    // o.splice(_.sortedIndex(o, e, (x) => x.d), 0, e);
                    // Cozy.sortedInsert(o, e, (x) => x.dsort);
                }
            }
        } else {
            let d = Math.sqrt(Cozy.dist2(projectedPosition, this.position));
            if (d < from.radius + this.radius) {
                return {
                    dsort: d - this.radius,
                    d: d - this.radius,
                    type: 'circ',
                    x: this.sprite.position.x,
                    y: this.sprite.position.y,
                    r: this.radius,
                    entity: this
                };
                // o.splice(_.sortedIndex(o, e, (x) => x.d), 0, e);
                // Cozy.sortedInsert(o, e, (x) => x.dsort);
            }
        }

        // Shouldn't ever be hit...
        return null;
    }

    slide(dx:number, dy:number):void {
        let tx = Math.floor(this.position.x / this.layer.map.tileSize.x),
            ty = Math.floor(this.position.y / this.layer.map.tileSize.y),
            zones = this.layer.getEventZonesByPoint(this.position);
        if (!this.respectsObstructions) {
            this.sprite.adjustPosition(dx, dy);
        } else {
            let ang;
            let dist = Math.sqrt(dx * dx + dy * dy);
            let travelled = 0;
            let iter = 0;
            let d;
            let obstructions = this.layer.getObstructions(), o = [];
            let entities = this.layer.entities;
            let closest;
            let i:number, j:number, e:any;
            let travelMultiplier:number;

            while (travelled < 0.999 && iter < 20) {
                iter++;
                travelMultiplier = 1.0;

                let projectedPosition = { x: this.sprite.position.x + dx * (1 - travelled), y: this.sprite.position.y + dy * (1 - travelled) };

                o = [];
                for (i = 0; i < obstructions.length; i++) {
                    // TODO also check whether this obstruction applies to this entity
                    if (!obstructions[i].active) {
                        continue;
                    }
                    closest = Cozy.closestPointOnLine(projectedPosition, obstructions[i].a, obstructions[i].b);
                    d = Cozy.dist(projectedPosition, closest);
                    if (d < this.radius) {
                        e = {
                            dsort: Cozy.dist({ x: this.sprite.position.x, y: this.sprite.position.y }, closest),
                            d: d,
                            type: 'line',
                            a: obstructions[i].a,
                            b: obstructions[i].b
                        };
                        // o.splice(_.sortedIndex(o, e, (x) => x.d), 0, e);
                        Cozy.sortedInsert(o, e, (x) => x.dsort);
                    }
                }

                if (this.solid) { // TODO this means non-solid entities can walk through other entities, but not walls, etc, is this what I want?
                    for (i = 0; i < entities.length; i++) {
                        // don't collide with yourself
                        if (entities[i] === this) continue;

                        d = Math.sqrt(Cozy.dist2(projectedPosition, entities[i].position));
                        // short circuit if we're at more than 1.5 x the radius of the entity -- theoretically this
                        // "should" be 1 if in motion, and 1.414(etc.) if not, but this is good enough for a first pass
                        if (d > (entities[i].radius + this.radius) * 1.5) continue;

                        let obs = entities[i].getObstruction(this, projectedPosition);
                        if (obs && obs.d < this.radius) {
                            Cozy.sortedInsert(o, obs, (x) => x.dsort);
                        }
                    }
                }

                for (i = 0; i < o.length; i++) {
                    let currentObs = o[i];
                    let d, ang;

                    function calcAngleAndDistance() {
                        if (o[i].type === 'line') {
                            closest = Cozy.closestPointOnLine(projectedPosition, o[i].a, o[i].b);
                            d = Math.sqrt(Cozy.dist2(projectedPosition, closest));
                            ang = Math.atan2(projectedPosition.y - closest.y, projectedPosition.x - closest.x);
                        } else if (o[i].type === 'circ') {
                            d = Math.sqrt(Cozy.dist2(projectedPosition, { x: o[i].x, y: o[i].y })) - o[i].r;
                            ang = Math.atan2(projectedPosition.y -  o[i].y, projectedPosition.x -  o[i].x);
                        }
                    }

                    if (o[i].entity) {
                        calcAngleAndDistance();
                        let pushfactor = 1.0 - Math.max(0, Math.min(1, o[i].entity.pushWeight / this.pushStrength));
                        // TODO don't just use pushfactor; modify it by how much the thing ACTUALLY moved
                        travelMultiplier = Math.max(1.0 / pushfactor, travelMultiplier);
                        o[i].entity.push(-Math.cos(ang) * (this.radius - d) * pushfactor, -Math.sin(ang) * (this.radius - d) * pushfactor);
                        o[i] = o[i].entity.getObstruction(this, projectedPosition);
                        if (o[i] === null) continue;
                    }

                    calcAngleAndDistance();

                    if (this.radius - d > 0) {
                        projectedPosition.x += Math.cos(ang) * (this.radius - d);
                        projectedPosition.y += Math.sin(ang) * (this.radius - d);
                    }
                }

                d = Math.sqrt(Cozy.dist2(this.sprite.position, projectedPosition));
                if (d === 0) break;

                travelled += (d / dist) * travelMultiplier;

                this.sprite.setPosition(projectedPosition.x, projectedPosition.y);
            }
        }

        if (this.emoteSprite) {
            this.emoteSprite.setPosition(this.sprite.position.x, this.sprite.position.y + 0.1);
        }

        if (this.triggersEvents) {
            let newZones = this.layer.getEventZonesByPoint(this.position);
            for (let z of newZones) {
                if (z.events.onEnter && zones.indexOf(z) === -1) {
                    console.log("$", z.events.onEnter, ">", this.layer.map[z.events.onEnter]);
                    this.layer.map[z.events.onEnter]({entity:this});
                }
            }
            for (let z of zones) {
                if (z.events.onExit && newZones.indexOf(z) === -1) this.layer.map[z.events.onExit]({entity:this});
            }

            let tx_ = Math.floor(this.position.x / this.layer.map.tileSize.x),
                ty_ = Math.floor(this.position.y / this.layer.map.tileSize.y);
            
            if (tx !== tx_ || ty !== ty_) {
                this.layer.events.forEach((e) => {
                    if (e.active && e.rect.contains(this.sprite.position.x, this.sprite.position.y) && this.layer.map[e.name]) {
                        this.layer.map[e.name]({
                            entity: this,
                            event: e,
                            x: this.sprite.position.x, y: this.sprite.position.y,
                            tx: Math.floor(this.sprite.position.x / this.layer.map.tileSize.x), ty: Math.floor(this.sprite.position.y / this.layer.map.tileSize.y)
                        });
                    }
                });
            }
        }
    }

    push(dx:number, dy:number):void {
        if (this.pushCallback) {
            let letSlide = this.pushCallback();
            if (!letSlide) return;
        }

        if (this.pushWeight === Infinity) return;
        this.slide(dx, dy);
    }

    private onSpriteMove() {
        if (this.shape) {
            let r = this.radius;
            let x = this.position.x;
            let y = this.position.y;
            this.shape.points = [ [x-r,y-r], [x+r,y-r], [x+r,y+r], [x-r,y+r] ];
            this.shape.onChange();
        }
    }

    getShape():Cozy.Shape {
        let r = this.radius;
        let x = this.position.x;
        let y = this.position.y;

        if (!this._stationary) {
            return new Cozy.Shape(
                Cozy.ShapeType.Circle,
                {
                    center: { x:x, y:y },
                    radius: r,
                    linecolor: 0x33aaaa,
                    fillcolor: 0x33aaaa
                }
            )
        } else {
            return new Cozy.Shape(
                Cozy.ShapeType.Polygon, // TODO should be a line
                {
                    closed: true,
                    points: [ [x-r,y-r], [x+r,y-r], [x+r,y+r], [x-r,y+r] ],
                    linecolor: 0xaa33aa,
                    fillcolor: 0xaa33aa
                }
            );
        }
    }
}
