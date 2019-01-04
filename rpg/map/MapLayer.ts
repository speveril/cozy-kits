import { Layer, getTexture, distA2, lineIntersection } from 'Cozy';
import { Entity } from '../Entity';
import { GameMap, MapEvent, MapTrigger, MapPatch, MapZone } from './Map';
import { MapObstruction } from './MapObstruction';
import { MapTile } from './Tileset';

export class MapLayer {
    // TODO break this out into child classes, TileLayer and EntityLayer?
    map:GameMap                             = null;
    patchLayer:Layer                        = null;
    spriteLayer:Layer                       = null;
    dirty:boolean                           = false;
    // TODO default these to null, and make add* functions
    tiles:Array<number>                     = [];
    tileLookup:Array<MapTile>               = [];
    events:Array<MapEvent>                  = [];
    triggers:Array<MapTrigger>              = [];
    entities:Array<Entity>                  = [];
    patches:Array<MapPatch>                 = [];
    zones:Array<MapZone>                    = [];
    explicitObstructions:MapObstruction[]   = [];
    obstructions:Array<MapObstruction>      = [];
    obstructionsFrozen:boolean              = false;
    _name:string                            = '';
    walkable:boolean                        = true;

    get name():string { return this._name; }

    constructor(name:string) {
        this._name = name;
    }

    freezeObstructions() {
        this.obstructionsFrozen = true;
    }

    unfreezeObstructions() {
        this.obstructionsFrozen = false;
    }

    getTile(x:number, y:number):number {
        return this.tiles[x + (this.map.size.x * y)];
    }

    setTile(x:number, y:number, t:number):void {
        var i = x + (this.map.size.x * y);
        var tileInfo = this.map.lookupTileInfo(t);

        if (tileInfo && getTexture(tileInfo.texture)) {
            if (!this.tileLookup[i]) {
                var spr = new MapTile({
                    texture: tileInfo['texture'],
                    position: { x: x * this.map.tileSize.x, y: y * this.map.tileSize.y },
                    frameSize: this.map.tileSize,
                    animations: tileInfo.animations
                });
                spr.frame = tileInfo.frame;
                if (tileInfo.animations[tileInfo.frame]) {
                    spr.animation = tileInfo.frame;
                }
                this.patchLayer.add(spr);
                this.tileLookup[i] = spr;
            } else {
                this.tileLookup[i].frame = tileInfo.frame;
                if (tileInfo.animations[tileInfo.frame]) {
                    this.tileLookup[i].animation = tileInfo.frame;
                } else {
                    this.tileLookup[i].animation = null;
                }
            }
            this.dirty = true;
        } else {
            if (this.tileLookup[i]) {
                this.patchLayer.remove(this.tileLookup[i]);
                this.tileLookup[i] = null;
            }
        }

        this.tiles[i] = t;
    }

    rebuildObstructions():void {
        // TODO this assumes that all of our walkable zones are polygons; it
        // should support circles as well (obstructions need to support arcs
        // for this to work)
        this.obstructions = this.explicitObstructions ? this.explicitObstructions.slice(0) : [];

        if (!this.zones) return;

        // TODO cache these between runs of the function?
        let points = [];
        let lines = [];
        let shapes = [];

        let ID = 0;

        // build a list of points, with refs to the lines and shapes they make
        // up
        for (let zone of this.zones) {
            if (!zone.flags.hasOwnProperty('walkable')) {
                continue;
            }
            let shape = { id: ID++, poly: zone.shape, lines: [] };
            if (zone.flags.walkable) {
                let length = zone.shape.points.length;
                let ln = { id: ID++, a:zone.shape.points[length-1], b:zone.shape.points[0], shape:shape, points:[] };
                let p1 = { id: ID++, pt:zone.shape.points[length-1], line:ln };
                let p2 = { id: ID++, pt:zone.shape.points[0], line:ln };

                ln.points.push(p1);
                ln.points.push(p2);
                shape.lines.push(ln);

                lines.push(ln);
                points.push(p1);
                points.push(p2);

                for (let i = 1; i < zone.shape.points.length; i++) {
                    ln = { id: ID++, a:zone.shape.points[i-1], b:zone.shape.points[i], shape:shape, points:[] };
                    p1 = { id: ID++, pt:zone.shape.points[i-1], line:ln };
                    p2 = { id: ID++, pt:zone.shape.points[i], line:ln };

                    ln.points.push(p1);
                    ln.points.push(p2);
                    shape.lines.push(ln);

                    lines.push(ln);
                    points.push(p1);
                    points.push(p2);
                }
            } else {
                // TODO handle zones with walkable = false; they should become
                // obstructions
            }
            shapes.push(shape);
        }

        // sort the points, left to right and top to bottom
        points.sort((a,b) => {
            if (a.pt[0] === b.pt[0]) {
                return a.pt[1] - b.pt[1];
            }
            return a.pt[0] - b.pt[0];
        });

        let splitVertices = [];
        let activelines = [];
        let edgeCandidates = [];

        for (let i = 0; i < points.length; i++) {
            let pt = points[i];

            let lineindex = activelines.indexOf(pt.line);

            if (lineindex === -1) {
                activelines.push(pt.line);
            } else {
                activelines.splice(lineindex, 1);
                console.log(">>>PROC LINE>>>", JSON.stringify(pt.line.a), JSON.stringify(pt.line.b));

                if (!splitVertices[pt.line.id]) splitVertices[pt.line.id] = [];
                let vertices = splitVertices[pt.line.id];

                for (let ln = 0; ln < activelines.length; ln++) {
                    let line = activelines[ln];
                    // if (line.shape === pt.line.shape) continue; // TODO? assume that we aren't going to self-intersect ourself?
                    let intersection = lineIntersection(pt.line.a, pt.line.b, line.a, line.b);
                    // TODO we still get some "intersections" at line vertices; should skip those
                    // because they're just a waste of time
                    console.log("  INTERSECT?", JSON.stringify([pt.line.a,pt.line.b]), JSON.stringify([line.a,line.b]), ":", JSON.stringify(intersection));
                    if (intersection.length > 0) {
                        for (let intersectionPoint of intersection) {
                            vertices.push(intersectionPoint);
                            if (!splitVertices[line.id]) splitVertices[line.id] = [];
                            splitVertices[line.id].push(intersectionPoint);
                        }
                    }
                }
                console.log("vertices>>", vertices);

                if (vertices.length === 0) {
                    this.obstructions.push(new MapObstruction({
                        x1: pt.line.a[0],
                        y1: pt.line.a[1],
                        x2: pt.line.b[0],
                        y2: pt.line.b[1]
                    }));
                    console.log("added obstruction", JSON.stringify(pt.line.a), JSON.stringify(pt.line.b));
                } else {
                    vertices.push(pt.line.a);
                    vertices.push(pt.line.b);
                    // this sort maintains winding order of vertices
                    vertices.sort((a,b) => {
                       return distA2(a, pt.line.a) - distA2(b, pt.line.a);
                    });
                    // console.log(">>>", JSON.stringify(pt.line.a), '-', JSON.stringify(pt.line.b), '->', vertices);
                    for (let v = 0; v < vertices.length - 1; v++) {
                        if (vertices[v][0] === vertices[v+1][0] && vertices[v][1] === vertices[v+1][1]) {
                            continue;
                        }

                        let edge = [vertices[v][0], vertices[v][1], vertices[v+1][0], vertices[v+1][1]];
                        let touches = false;
                        let midpoint = [(edge[0] + edge[2]) / 2, (edge[1] + edge[3]) / 2];

                        console.log(" VERTEX:", JSON.stringify(vertices[v]), JSON.stringify(vertices[v+1]), '->', JSON.stringify(midpoint));
                        for (let sh = 0; sh < shapes.length; sh++) {
                            let shape = shapes[sh];
                            if (shape.id === pt.line.shape.id) continue;
                            console.log("  TESTING", shape);

                            let onedge = shape.poly.isOnEdge(midpoint[0], midpoint[1]);
                            if (onedge) {
                                console.log("   ONEDGE");
                                // If a segment midpoint lies on another poly's line, it means they have coincident lines;
                                // any crossing points would have been turned into a separate vertex. If they are two polygons
                                // that are touching externally, it should count as a touch, but if it's internal (i.e. one
                                // of the polygons is inside the other) it should not.
                                // Thankfully we've used clockwisePoints() to make sure all our polygons are wound the same,
                                // so we can just check to see if the lines are wound in the same way.

                                // console.log("midpoint on edge");
                                // let slopeA = (edge[3] - edge[1]) / (edge[2] - edge[0]);
                                // let slopeB = (onedge[3] - onedge[1]) / (onedge[2] - onedge[0]);
                                // console.log(" > pt-line:", edge[0], edge[1], ',', edge[2], edge[3], '=', slopeA);
                                // console.log(" > sh-line:", onedge[0], onedge[1], ',', onedge[2], onedge[3], '=', slopeB, '(', shape, ')');

                                if (edge[1] === edge[3] && (edge[2] < edge[0] !== onedge[1].x < onedge[0].x)) {
                                    // console.log(" > horizontal touch!");
                                    touches = true;
                                    break;
                                } else if (edge[0] > edge[2] !== onedge[0].x > onedge[1].x || edge[1] > edge[3] !== onedge[0].y > onedge[1].y) {
                                    // console.log(" > touch!");
                                    touches = true;
                                    break;
                                }
                                console.log("   ... but same winding");
                                // console.log(" > it's fine, everything's fine");
                            } else if (shape.poly.contains(midpoint[0], midpoint[1])) {
                                console.log("   NOT ONEDGE, CONTAINS");
                                touches = true;
                                break;
                            } else {
                                console.log("   NOPE")
                            }
                        }

                        if (!touches) {
                            this.obstructions.push(new MapObstruction({
                                x1: edge[0],
                                y1: edge[1],
                                x2: edge[2],
                                y2: edge[3]
                            }));
                            console.log("   > added obstruction", JSON.stringify(edge));
                        } else {
                            console.log("   > NO obstruction", JSON.stringify(edge));
                        }
                    }
                }
            }
        }

        console.log("OBSTRUCTIONS>>", this.obstructions);
    }

    getObstructions():MapObstruction[] {
        return this.obstructions;
    }

    getTriggerByPoint(x:number, y:number):MapTrigger {
        return <MapTrigger>(this.triggers.find(function(trigger) {
            return trigger.active && trigger.rect.contains(x, y) && this.map[trigger.name];
        }.bind(this)));
    }

    getEventZonesByPoint(pt:PIXI.Point|PIXI.ObservablePoint):MapZone[] {
        return this.zones.filter(z => z.events && z.shape.contains(pt));
    }

    getTriggersByName(name:string):MapTrigger[] {
        // return _.where(this.triggers, { name: name });
        return this.triggers.filter((x) => x.name === name);
    }

    getEventsByName(name:string):MapEvent[] {
        // return _.where(this.events, { name: name });
        return this.events.filter((x) => x.name === name);
    }

    getObstructionsByName(name:string):MapObstruction[] {
        // return _.where(this.obstructions, { name: name });
        return this.obstructions.filter((x) => x.name === name);
    }

    getEntitiesByName(name:string):Array<Entity> {
        // return _.where(this.entities, { name: name });
        return this.entities.filter((x) => x.name === name);
    }

    addPatch(def:any):MapPatch {
        if (!this.patches) this.patches = [];

        let patch = def;
        if (!(def instanceof MapPatch)) {
            patch = new MapPatch(def);
        }
        this.patches.push(patch);

        return patch;
    }

    addZone(def:any):MapZone {
        if (!this.zones) this.zones = [];

        let zone = def;
        if (!(def instanceof MapZone)) {
            zone = new MapZone(def);
        }

        this.zones.push(zone);

        // TODO set a dirty flag, and just update on the next update()?
        if (!this.obstructionsFrozen) {
            this.rebuildObstructions();
        }
        return zone;
    }

    addObstruction(def:any):MapObstruction {
        if (!this.explicitObstructions) this.explicitObstructions = [];

        let obs = def;
        if (!(def instanceof MapObstruction)) {
            obs = new MapObstruction(obs);
        }
        this.explicitObstructions.push(obs);

        // TODO set a dirty flag, and just update on the next update()?
        if (!this.obstructionsFrozen) {
            this.rebuildObstructions();
        }
        return obs;
    }

    addEntity(def:any):Entity {
        if (!this.entities) this.entities = [];

        let ent = def;
        if (!(def instanceof Entity)) {
            ent = new Entity(def);
        }
        this.entities.push(ent);

        return ent;
    }
 }
