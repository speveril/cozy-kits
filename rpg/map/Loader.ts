import * as Cozy from 'Cozy';
import { GameMap } from './Map';

// Map formats
import { loadTMX } from './LoaderTMX';
export * from './LoaderTMX';

import { loadLotusMap } from './LoaderLotus';
export * from './LoaderLotus';


// export this so it can be updated/overwritten by plugins?
export var mapLoadFuncs = {
    '.data': loadLotusMap,
    '.tmx': loadTMX
}

/**
Magic loader. Tries to figure out what kind of map it is an load appropriately.
@param path              Path to the file.
**/
export function loadMap(path:string, existingMap?:GameMap):GameMap {
    let loaderFunc = mapLoadFuncs[Cozy.gameDir().file(path).extension];
    if (!loaderFunc) {
        throw new Error("Could not figure out how to load map " + path + ".");
    }
    return loaderFunc(path, existingMap);
}
