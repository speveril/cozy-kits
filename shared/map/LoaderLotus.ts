import * as Cozy from 'Cozy';
import { Entity } from '../Entity';
import { GameMap, MapTrigger, MapEvent, MapPatch } from './Map';
import { MapLayer } from './MapLayer';
import { MapObstruction } from './MapObstruction';

let objectLibraryCache = {};

// TODO support this style AND a style where 'file' is a directory, and load
// each .json file as an entry (this is going to play a lot better with
// source control and multiple mappers)
function getObjectLibrary(file:Cozy.File) {
    if (!objectLibraryCache[file.path]) {
        let data = file.getData('json');

        // rewrite textures so that they're relative to the gamedir, not the def file
        let dir = file.dir;
        for (let k in data) {
            let o = data[k];
            o.texture = dir.file(o.texture).relativePath(Cozy.gameDir());
        }

        objectLibraryCache[file.path] = data;

    }
    return objectLibraryCache[file.path];
}

/** NOTES

- Tile size hard-coded to 80x80; I'm not sure how widely we'll use "tiles" anyway.

**/

export function loadLotusMap(mapFile:Cozy.File, existingMap?:GameMap) {
    let map = existingMap || new GameMap({});
    let mapDir = mapFile.dir;

    let data = mapFile.getData('json');

    map.filename = mapFile.path;
    map.tileSize = new PIXI.Point(80, 80);
    map.size = new PIXI.Point(data.dimensions.mapWidth / map.tileSize.x, data.dimensions.mapHeight / map.tileSize.y);

    // TODO this should go all the way to the map for spawning things at run
    // time
    let objectLibrary = {};
    map.objectSources = {};
    if (data.objects) {
        for (let f of data.objects) {
            let lib = getObjectLibrary(mapDir.file(f))
            Object.assign(objectLibrary, lib);
            for (let k in lib) {
                map.objectSources[k] = f;
            }
        }
    } else {
        console.warn("Map has no object libraries to load.");
    }

    for (let layerData of data.layers) {
        let layer = new MapLayer(layerData.name);
        layer.freezeObstructions();

        if (layerData.hasOwnProperty('walkable')) {
            layer.walkable = layerData.walkable;
        }

        layer.entities = [];

        if (layerData.zones) {
            for (let o of layerData.zones) {
                let args:any = {
                    name: o.name || '',
                    points: o.points || [],
                    flags: o.flags || {}
                };
                if (o.events) args.events = o.events;
                console.log("  args>", args)
                let z = layer.addZone(args);
                console.log("  ZONE>", z)
                if (o.events) console.log("      >>>", o.events);
            }
        }

        if (layerData.obstructions) {
            for (let o of layerData.obstructions) {
                layer.addObstruction(o);
            }
        }

        if (layerData.patches) {
            for (let o of layerData.patches) {
                if (!objectLibrary[o.def]) {
                    console.warn('Skipping unrecognized patch', o.def);
                    continue;
                }

                let args = {
                    name: o.name || '',
                    sprite: objectLibrary[o.def],
                    sourceSpriteDef: o.def,
                    position: new PIXI.Point(o.x, o.y),
                    sortWithEntities: o.sortWithEntities || false
                };

                let p = layer.addPatch(args);
                console.log(" PATCH>", p);
            }
        }

        if (layerData.entities) {
            for (let o of layerData.entities) {
                if (!objectLibrary[o.def]) {
                    console.warn('Skipping unrecognized entity', o.def);
                    continue;
                }

                let args = {
                    name: o.name || '',
                    sprite: objectLibrary[o.def],
                    sourceSpriteDef: o.def,
                    spawn: new PIXI.Point(o.x, o.y)
                };

                let e = new Entity(args);
                layer.entities.push(e);
                console.log("ENTITY>", e);
            }
        }

        layer.unfreezeObstructions();
        layer.rebuildObstructions();

        map.addLayer(layer);
    }

    // TODO cameraBoxes should actually be attached to an entity layer
    map.cameraBoxes.push(new PIXI.Rectangle(0, 0, map.size.x * map.tileSize.x, map.size.y * map.tileSize.y));

    return map;
}
