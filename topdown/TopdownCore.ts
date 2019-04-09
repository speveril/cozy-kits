import * as Cozy from 'Cozy';

const audio = {};

export function load(config) {
    const ignore        = config.ignore || [];
    const datafiles     = config.dataFiles || Cozy.gameDir().find('**/*.json');
    const texturefiles  = config.textureFiles || Cozy.gameDir().glob("**/*.{png,jpg,gif}");
    const audiofiles    = config.audioFiles || Cozy.gameDir().glob("**/*.{ogg,mp3,mo3,it,s3m,mod,xm,wav");

    const isIgnored = (f) => {
        if (f.name.indexOf('.') === 0) return true;
        if (ignore.reduce((memo, ig:string) => memo || f.path.indexOf(ig) === 0, false)) {
            return true;
        }
        return false;
    }

    const promises = [];

    for (let f of datafiles) {
        if (!(f instanceof Cozy.File) || isIgnored(f)) continue;
        promises.push(f.load());
    }

    let textures = {};
    for (let f of texturefiles) {
        if (!(f instanceof Cozy.File) || isIgnored(f)) continue;
        textures[f.relativePath(Cozy.gameDir())] = f;
    }
    promises.push(Cozy.loadTextures(textures));

    for (let f of audiofiles) {
        if (!(f instanceof Cozy.File) || isIgnored(f)) continue;
        audio[f.relativePath(Cozy.gameDir())] = f;
        promises.push(f.load());
    }

    return Promise.all(promises);
}

/*

// TODO bring back when I figure out JSON data...

export function data(key) {
    const parts = key.split(".");
    let cur = gameData;
    for (let p of parts) {
        if (!cur[p]) throw new Error(`Couldn't get data for "${key}"; part "${p}" not found.`);
        cur = cur[p];
    }
    return cur();
} 
*/
