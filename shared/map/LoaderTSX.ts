import * as Cozy from 'Cozy';
import { MapTileset } from './Tileset';

let TSXcache:{ [name:string]: MapTileset } = {};

export function loadTSX(dir:Cozy.Directory, file:string):MapTileset {
    let f = dir.file(file);

    if (!TSXcache[f.path]) {
        let ts = new MapTileset();

        let data = f.getData('xml');

        // this tortured path junk is to find the image texture...
        //  - get the file name from the tileset data's <image> tag's source attr
        //  - find that file within the same data directory that the tsx file is in
        //  - convert that into a path relative to the game directory, since that's how all the textures are loaded
        ts.texture = f.dir.file(data.getElementsByTagName('image')[0].getAttribute('source')).relativePath(Cozy.gameDir());

        // _.each(data.getElementsByTagName('tile'), function(tile:HTMLElement) {
        let tiles = data.getElementsByTagName('tile');
        for (let i in Object.getOwnPropertyNames(tiles)) {
            let tile = tiles[i];
            if (!tile)
                continue; // for some reason, getElementsByTagName returns an array with a bunch of undefineds in it :|

            // _.each(tile.getElementsByTagName('animation'), function(animData:HTMLElement) {
            let animations = tile.getElementsByTagName('animation');
            for (let i in Object.getOwnPropertyNames(animations)) {
                let animData = animations[i];
                let animation = [];

                // _.each(animData.getElementsByTagName('frame'), function(frameData:HTMLElement) {
                let frames = animData.getElementsByTagName('frame');
                for (let i in Object.getOwnPropertyNames(frames)) {
                    let frameData = frames[i];
                    animation.push([
                        parseInt(frameData.getAttribute('tileid'),10),
                        parseInt(frameData.getAttribute('duration'),10)/1000
                    ]);
                }
                ts.animations[tile.getAttribute("id")] = [{
                    loop: true,
                    frames: animation
                }];
            }
        }
        TSXcache[f.path] = ts;
    }
    return TSXcache[f.path];
}
