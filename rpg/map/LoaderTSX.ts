import * as Cozy from 'Cozy';
import { MapTileset } from './Tileset';

let TSXcache:{ [name:string]: MapTileset } = {};

export function loadTSX(path:string, file:string):MapTileset {
    let fullpath = path + file;
    if (!TSXcache[path]) {
        let ts = new MapTileset();
        let data = Cozy.gameDir().file(fullpath).getData('xml');
        ts.texture = path + data.getElementsByTagName('image')[0].getAttribute('source');

        // _.each(data.getElementsByTagName('tile'), function(tile:HTMLElement) {
        let tiles = data.getElementsByTagName('tile');
        for (let i in tiles) {
            let tile = tiles[i];

            // _.each(tile.getElementsByTagName('animation'), function(animData:HTMLElement) {
            let animations = tile.getElementsByTagName('animation');
            for (let i in animations) {
                let animData = animations[i];
                let animation = [];

                // _.each(animData.getElementsByTagName('frame'), function(frameData:HTMLElement) {
                let frames = animData.getElementsByTagName('frame');
                for (let i in frames) {
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

        TSXcache[fullpath] = ts;
    }
    return TSXcache[fullpath];
}
