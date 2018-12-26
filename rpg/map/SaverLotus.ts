import * as Cozy from 'Cozy';
import { GameMap, MapZone, MapPatch } from './Map';
import { MapObstruction } from './MapObstruction';
import { Entity } from '../Entity';

function prepareZone(zone:MapZone) {
    return {
        name: zone.name,
        points: zone.shape.points,
        flags: zone.flags,
        events: zone.events
    };
}

function prepareObstruction(obs:MapObstruction) {
    // TODO; not currently using these
}

function preparePatch(patch:MapPatch) {
    let d:any = {
        def: patch.sourceSpriteDef,
        x: patch.position.x,
        y: patch.position.y
    };

    if (patch.sortWithEntities) {
        d.sortWithEntities = true;
    }

    return d;
}

function prepareEntity(entity:Entity) {
    return {
        def: entity.sourceSpriteDef,
        x: entity.spawn.x,
        y: entity.spawn.y
    }
}

export function saveLotusMap(map:GameMap, filename?:string) {

    if (filename === undefined) {
        filename = map.filename
    }

    console.log("saving map>>", filename);

    let m:any = {
        lotusVersion: "1.0",
        dimensions: {
            mapWidth: map.size.x * map.tileSize.x,
            mapHeight: map.size.y * map.tileSize.y,
        },
        objects: [...new Set(Object['values'](map.objectSources))], // TODO typescript seems to think we're not targetting ES6 here?
        layers: [],
    };
    for (let layer of map.layers) {
        let l:any = {
            name: layer.name,
            walkable: layer.walkable,
        };

        if (layer.zones) {
            l.zones = [];
            for (let zone of layer.zones) {
                l.zones.push(prepareZone(zone));
            }
        }

        if (layer.explicitObstructions) {
            l.obstructions = [];
            for (let obs of layer.explicitObstructions) {
                l.obstructions.push(prepareObstruction(obs));
            }
        }

        if (layer.patches) {
            l.patches = [];
            for (let patch of layer.patches) {
                l.patches.push(preparePatch(patch));
            }
        }

        if (layer.entities) {
            l.entities = [];
            for (let entity of layer.entities) {
                l.entities.push(prepareEntity(entity));
            }
        }

        m.layers.push(l);
    }

    console.log("GENERATED MAP:", JSON.stringify(m, null, '    '));
}
