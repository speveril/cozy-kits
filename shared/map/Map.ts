import * as Cozy from 'Cozy';
import { Entity } from '../Entity';
import { loadMap } from './Loader';
import { MapLayer } from './MapLayer';
import { MapObstruction } from './MapObstruction';
import { MapTileset } from './Tileset'

class MapRect {
    name:string;
    rect:PIXI.Rectangle;
    properties:any;
    active:boolean = true;
    tileSize:any;

    constructor(tileSize) {
        this.tileSize = tileSize;
    }

    get tx():number {
        return Math.floor(this.rect.x / this.tileSize.x);
    }

    get ty():number {
        return Math.floor(this.rect.y / this.tileSize.y);
    }

    get tw():number {
        return Math.floor(this.rect.width / this.tileSize.x);
    }

    get th():number {
        return Math.floor(this.rect.height / this.tileSize.y);
    }
}

export class MapEvent extends MapRect {
    obstructions:Array<MapObstruction>;
    private _solid:boolean = true;

    get solid():boolean {
        return this._solid;
    }

    set solid(v:boolean) {
        this._solid = v;

        if (!this.obstructions) return;

        // _.each(this.obstructions, function(o) {
        this.obstructions.forEach((o) => {
            o.active = v;
        });
    }
}

export class MapTrigger extends MapRect {
    obstructions:Array<MapObstruction>;
    private _solid:boolean = true;

    get solid():boolean {
        return this._solid;
    }

    set solid(v:boolean) {
        this._solid = v;
        
        if (!this.obstructions) return;
        // _.each(this.obstructions, function(o) {
        this.obstructions.forEach((o) => {
            o.active = v;
        });
    }
}

export class MapPatch {
    name:string;
    spriteDef:any;
    sourceSpriteDef:any;
    position:PIXI.Point;
    sprite:Cozy.Sprite;
    layer:MapLayer;
    sortWithEntities:boolean;
    private uid:any;

    constructor(def:any) {
        this.name = def.name || '';
        this.spriteDef = def.sprite || {};
        this.sourceSpriteDef = def.sourceSpriteDef || '';
        this.position = def.position || new PIXI.Point(0,0);
        this.sortWithEntities = def.sortWithEntities || false;
        this.uid = Cozy.uniqueID();
    }

    place(layer:MapLayer) {
        // console.log('spritedef', this.spriteDef);
        if (this.sprite) {
            if (this.sortWithEntities) {
                this.layer.spriteLayer.remove(this.sprite);
            } else {
                this.layer.patchLayer.remove(this.sprite);
            }
            delete this.layer.map.patchLookup[this.uid];
        } else {
            this.sprite = new Cozy.Sprite(this.spriteDef);
        }

        this.sprite.setPosition(this.position.x, this.position.y);
        this.layer = layer;
        if (this.sortWithEntities) {
            this.layer.spriteLayer.add(this.sprite);
        } else {
            this.layer.patchLayer.add(this.sprite);
        }

        if (!this.layer.patches['includes'](this)) { // TODO old TS workaround
            this.layer.patches.push(this);
        }

        this.layer.map.patchLookup[this.uid] = this;
    }
}

export class MapZone {
    name:string;
    shape:Cozy.Shape;
    flags:any;
    events:any;

    constructor(def:any) {
        this.name = def.name;
        this.shape = new Cozy.Shape(Cozy.ShapeType.Polygon, {
            closed: true,
            points: def.points,
            linecolor: 0xffffff,
            linealpha: 0.8,
            fillcolor: 0xffffff,
            fillalpha: 0.0
        });

        if (def.events) {
            let events = def.events;
            this.events = {};
            if (events.onEnter) {
                this.shape.fillalpha = 0.2;
                this.events.onEnter = events.onEnter;
            }
        }

        this.flags = {};
        Object.assign(this.flags, def.flags);
    }
}

export class GameMap {
    public static mapFile:string;
    public static musicName:string;
    public static persistent = { global: {} };
    public static debugRender = true;

    public static preload():Promise<any> {
        if (this.mapFile) {
            return Cozy.gameDir().file(this.mapFile).load();
        } else {
            return Promise.resolve();
        }
    }

    size:PIXI.Point                         = null;
    tileSize:PIXI.Point                     = null;
    filename:string                         = null;
    layers:Array<MapLayer>                  = [];
    debugLayer:Cozy.Layer                   = null;
    tilesets:Array<MapTileset>              = [];
    cameraBoxes:Array<PIXI.Rectangle>       = [];
    layerLookup:{[key:string]:MapLayer}     = {};
    entityLookup:{[key:string]:Entity}      = {};
    patchLookup:{[key:string]:MapPatch}     = {};
    displayName:string                      = '';
    objectSources:{[key:string]:string}     = null;

    constructor(args) {
        if (args instanceof Cozy.File) {
            loadMap(args, this);
        } else if (this.constructor['mapFile']) {
            loadMap(Cozy.gameDir().file(this.constructor['mapFile']), this);
        } else {
            this.size = new PIXI.Point(args.width || 0, args.height || 0);
            this.tileSize = new PIXI.Point(args.tileWidth || 16, args.tileHeight || 16);
        }
    }

    open(renderPlane:Cozy.RenderPlane, debugPlane:Cozy.RenderPlane):void {
        if (debugPlane) {
            debugPlane.clear();
            this.debugLayer = debugPlane.addRenderLayer();
        }

        renderPlane.clear();
        
        console.log("Layers>", this.layers);
        for (let mapLayer of this.layers) {
            console.log("  [setting up]", mapLayer);
            let x = 0, y = 0;

            mapLayer.patchLayer = renderPlane.addRenderLayer();
            mapLayer.spriteLayer = renderPlane.addRenderLayer();

            // TODO reconcile tiles + patches on the same layer if I ever care
            // _.each(mapLayer.tiles, (tileIndex) => {
            for (let tileIndex of mapLayer.tiles) {
                mapLayer.setTile(x, y, tileIndex);

                x++;
                if (x >= this.size.x) {
                    x = 0;
                    y++;
                }
            }

            if (mapLayer.patches) {
                for (let patch of mapLayer.patches) {
                    patch.place(mapLayer);
                }
            }

            if (mapLayer.entities) {
                console.log("######## placing entities");
                // _.each(mapLayer.entities, (entity:Entity) => entity.place(entity.spawn.x, entity.spawn.y, mapLayer));
                for (let entity of mapLayer.entities) {
                    console.log(" ENTITY>", entity.name);
                    entity.place(entity.spawn.x, entity.spawn.y, mapLayer);
                }
            }
            
            this.sortSprites(mapLayer);
        }
    }

    frame(dt:number) {
        if (GameMap.debugRender && this.debugLayer) {
            this.debugLayer.clear();
            for (let mapLayer of this.layers) {
                if (this.debugLayer) {
                    if (mapLayer.zones) {
                        for (let z of mapLayer.zones) {
                            this.debugLayer.add(z.shape);
                        }
                    }
                }

                if (mapLayer.obstructions) {
                    for (let o of mapLayer.obstructions) {
                        this.debugLayer.add(o.getShape());
                    }
                }

                for (let e of mapLayer.entities) {
                    this.debugLayer.add(e.getShape());
                }
            }
        }
    }

    close() {
        this.debugLayer = null;
    }

    /**
    Override for setup stuff on this map.
    **/
    start() {}

    /**
    Override for clean up stuff on this map.
    **/
    finish() {}

    update(dt):void {
        this.layers.forEach((layer) => {
            if (layer.entities) {
                if (layer.dirty || layer.entities.length > 0) {
                    layer.dirty = false;
                    this.sortSprites(layer);
                }
                layer.entities.forEach((e) => e.update(dt));
            }
        });
    }

    setSize(x:number, y:number):void {
        this.size.x = x;
        this.size.y = y;
    }

    addLayer(lyr:MapLayer, index?:number):void {
        if (index === undefined) {
            this.layers.push(lyr);
        } else {
            this.layers.splice(index, 0, lyr);
        }
        this.layerLookup[lyr.name] = lyr;
        lyr.map = this;
    }

    addTileSet(firstIndex:number, ts:MapTileset):void {
        ts.index = firstIndex;
        this.tilesets.push(ts);
    }

    lookupTileInfo(index:number):any {
        if (index === 0) return null;
        for (var i:number = this.tilesets.length - 1; i >= 0; i--) {
            if (index >= this.tilesets[i].index) return {
                texture: this.tilesets[i].texture,
                frame: index - this.tilesets[i].index,
                animations: this.tilesets[i].animations
            };
        }
        return null;
    }

    getLayerByName(name:string):MapLayer {
        return this.layerLookup[name];
    }

    getAllTriggersByName(name:string):MapTrigger[] {
        // return _.flatten(_.map(this.layers, (lyr) => lyr.getTriggersByName(name)));
        return this.layers.map((lyr) => lyr.getTriggersByName(name)).reduce((a,b) => a.concat(b), []);
    }

    getAllEventsByName(name:string):MapEvent[] {
        // return _.flatten(_.map(this.layers, (lyr) => lyr.getEventsByName(name)));
        return this.layers.map((lyr) => lyr.getEventsByName(name)).reduce((a,b) => a.concat(b), []);
    }

    getAllObstructionsByName(name:string):MapObstruction[] {
        // return _.flatten(_.map(this.layers, (lyr) => lyr.getObstructionsByName(name)));
        return this.layers.map((lyr) => lyr.getObstructionsByName(name)).reduce((a,b) => a.concat(b), []);
    }

    getAllEntitiesByName(name:string):Array<Entity> {
        // return _.flatten(_.map(this.layers, (lyr) => lyr.getEntitiesByName(name)));
        return this.layers.map((lyr) => lyr.getEntitiesByName(name)).reduce((a,b) => a.concat(b), []);
    }

    private sortSprites(layer?:MapLayer) {
        if (!layer) {
            this.layers.forEach((lyr) => this.sortSprites(lyr));
        } else {
            layer.spriteLayer.sortSprites((a, b) => {
                if (a.position.y === b.position.y) {
                    return 0;
                } else {
                    return a.position.y < b.position.y ? -1 : 1;
                }
            });
        }
    }

    // default event handlers

    layerUp(evt) {
        let e = evt.entity;
        let found = false;

        for (let i = 0; i < this.layers.length; i++) {
            if (!found) {
                if (this.layers[i] === e.layer) found = true;
            } else {
                if (this.layers[i].walkable) {
                    e.place(e.position.x, e.position.y, this.layers[i]);
                    return;
                }
            }
        }
    }

    layerDown(evt) {
        let e = evt.entity;
        let found = false;

        for (let i = this.layers.length - 1; i >= 0; i--) {
            if (!found) {
                if (this.layers[i] === e.layer) found = true;
            } else {
                if (this.layers[i].walkable) {
                    e.place(e.position.x, e.position.y, this.layers[i]);
                    return;
                }
            }
        }
    }

}
