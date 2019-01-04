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
@param file              A loaded Cozy.File
**/
export function loadMap(file:Cozy.File, existingMap?:GameMap):GameMap {
    let loaderFunc = mapLoadFuncs[file.extension];
    if (!loaderFunc) {
        throw new Error("Could not figure out how to load map " + file.name + ".");
    }
    return loaderFunc(file, existingMap);
}
