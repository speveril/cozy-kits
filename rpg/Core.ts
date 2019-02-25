import * as Cozy from 'Cozy';

import { Behavior } from './Behavior';
import { Character } from './Character';
import { ControlStack, ControlMode } from './ControlStack';
import { Entity } from './Entity';
import { Item } from './Item';
import { frameMapMode } from './MapMode';
import { Menu } from './Menu';
import { Scene } from './Scene';

import { GameMap } from './map/Map';
import { MapLayer } from './map/MapLayer';

let characters:{[key:string]:Character} = {};
let loadSkip:Array<string>              = [];
let player:Entity                       = null;
let map:GameMap                         = null;
let mapkey:string                       = '';
let mapLookup:{ [name:string]: any[] } = {};
let spriteLookup: { [name:string]: Cozy.File } = {};

let cameraSpeed:number                  = 750;
let cameraHalf:PIXI.Point;
let cameraFocus:PIXI.Point;
let cameraTarget:Entity                 = null;

let renderPlane:Cozy.RenderPlane;
let debugPlane:Cozy.RenderPlane;
let uiPlane:Cozy.UiPlane;
let battleSystem:any;
let mainMenuClass:any;

let equipSlots:Array<string>            = ["weapon", "shield", "armor", "accessory"];
let sfx:{ [name:string]: Cozy.SFX }     = {};
let music:{ [name:string]: Cozy.Music } = {};
let moneyName:string                    = "G";

export function load(config:any):Array<Promise<any>> {
    console.log(`Loading RPGKit core`);

    renderPlane = <Cozy.RenderPlane>Cozy.addPlane(Cozy.RenderPlane, { className: 'render-plane', renderBackground: 'rgba(0,0,0,0)' });
    if (Cozy.getDebug()) debugPlane = <Cozy.RenderPlane>Cozy.addPlane(Cozy.RenderPlane, { className: 'render-plane', renderBackground: 'rgba(0,0,0,0)' });
    uiPlane = <Cozy.UiPlane>Cozy.addPlane(Cozy.UiPlane, { className: 'overlay' });

    if (config.sfx) {
        // _.each(config.sfx, (args:string, name:string) => sfx[name] = new Cozy.SFX(args));
        sfx = Cozy.mapO(config.sfx, (args:string) => new Cozy.SFX(args));
    }
    if (config.music) {
        // _.each(config.music, (args:any, name:string) => music[name] = new Cozy.Music(args));
        music = Cozy.mapO(config.music, (args:string) => new Cozy.Music(args));
    }
    if (config.battleSystem) {
        battleSystem = new config.battleSystem(config.battleSystemConfig || {});
    }
    if (config.menuConfig) {
        if (config.menuConfig.sfx) {
            Menu.blip = sfx[config.menuConfig.sfx.blip];
            Menu.choose = sfx[config.menuConfig.sfx.choose];
            Menu.sfxBad = sfx[config.menuConfig.sfx.sfxBad];
        }
    }
    if (config.hasOwnProperty('cameraSpeed')) {
        setCameraSpeed(config.cameraSpeed);
    }

    loadSkip             = config.loadSkip || [];
    mainMenuClass        = config.mainMenuClass || null;
    mapLookup            = config.maps || {};

    Item.load(config.items || {});

    cameraHalf = new PIXI.Point(Cozy.config('width') / 2, Cozy.config('height') / 2);
    cameraFocus = new PIXI.Point(0, 0);
    console.log(JSON.stringify(cameraHalf));

    let promises = [];

    for (let k of Object.keys(mapLookup)) {
        mapLookup[k][0].preload();
    }

    spriteLookup = {};
    if (config.sprites) {
        for (let k of Object.keys(config.sprites)) {
            spriteLookup[k] = config.sprites[k];
            promises.push(spriteLookup[k].load());
        }        
    }

    // scrape all images under the project
    let textures = {};
    for(let f of Cozy.gameDir().glob("**/*.{png,jpg,gif}")) {
        if (f instanceof Cozy.File) {
            // if (_.reduce(loadSkip, (memo, ignore:string) => memo || f.path.indexOf(ignore) === 0, false)) return;
            if (loadSkip.reduce((memo, ignore:string) => memo || f.path.indexOf(ignore) === 0, false)) return;
            textures[(<Cozy.File>f).relativePath(Cozy.gameDir())] = f;
        }
    }
    promises.push(Cozy.loadTextures(textures));

    Menu.init();

    // _.each(sfx, function(s) { promises.push(s.loaded()); });
    // _.each(music, function(m) { promises.push(m.loaded()); });
    for (let s in sfx) {
        promises.push(sfx[s].loaded());
    }
    for (let m in music) {
        promises.push(music[m].loaded());
    }
    return promises;
}

export function cleanup() {
    if (Cozy.Audio.currentMusic) {
        Cozy.Audio.currentMusic.stop();
    }

    map = null;
    player = null;
    Scene.cleanup();
    Behavior._cleanup();
    ControlStack.cleanup();

    ControlStack.push(ControlMode.Map);

    Menu.menuStack = [];

    renderPlane.clear();
    uiPlane.clear();
}

export function frame(dt) {
    if (map) {
        map.update(dt);
    }

    if (ControlStack.len < 1) {
        throw new Error("Control stack got emptied");
    }

    let controls = ControlStack.top();
    if (controls === ControlMode.Map && map && player) {
        frameMapMode(dt);
    } else if (controls === ControlMode.Scene && Scene.currentScene) {
        Scene.update(dt);
    } else if (controls === ControlMode.Menu && Menu.currentMenu) {
        Menu.update(dt);
    // } else if (controls === ControlMode.Battle && Battle.currentBattle) {
    //     Battle.update(dt);
    } else {
        switch(controls) {
            case ControlMode.Map:
                // console.warn("bad controls [map]: >>",map,player, ControlStack); break;
                console.log("bad controls [map]: >>",map,player, ControlStack); break;
            case ControlMode.Scene:
                // console.warn("bad controls [scene]: >>",Scene.currentScene, ControlStack); break;
                console.log("bad controls [scene]: >>",Scene.currentScene, ControlStack); break;
            case ControlMode.Menu:
                // console.warn("bad controls [menu]: >>",Menu.currentMenu, ControlStack); break;
                console.log("bad controls [menu]: >>",Menu.currentMenu, ControlStack); break;
            }
    }

    if (cameraTarget && cameraTarget.sprite) {
        centerCameraOn(cameraTarget.sprite.position);
    }

    if (map && map.layers.length > 0) {
        let offs = player && player.layer ? player.layer.spriteLayer.getOffset()
                                          : map.layers[0].spriteLayer.getOffset();
        let dx = (cameraFocus.x) - (-offs.x + cameraHalf.x),
            dy = (cameraFocus.y) - (-offs.y + cameraHalf.y),
            dd = Math.sqrt(dx * dx + dy * dy),
            maxDist = cameraSpeed * dt;

        if (dd > maxDist) {
            dx *= (maxDist / dd);
            dy *= (maxDist / dd);
        }

        for (let layer of map.layers) {
            layer.patchLayer.offset(offs.x - dx, offs.y - dy);
            layer.spriteLayer.offset(offs.x - dx, offs.y - dy);
        }
        if (map.debugLayer) map.debugLayer.offset(offs.x - dx, offs.y - dy);

        map.frame(dt);
    }
}

export function centerCameraOn(pt:{x:number,y:number}, snap?:boolean) {
    let cx = pt.x;
    let cy = pt.y;

    if (map && map.cameraBoxes) {
        let cameraBox = map.cameraBoxes.find((box) => box.contains(cx, cy));

        if (cameraBox) {
            if (cameraBox.width <= Cozy.config('width')) {
                cx = cameraBox.x + cameraBox.width / 2;
            } else {
                cx = Math.max(cameraBox.x + cameraHalf.x, cx);
                cx = Math.min(cameraBox.x + cameraBox.width - cameraHalf.x, cx);
            }

            if (cameraBox.height <= Cozy.config('height')) {
                cy = cameraBox.y + cameraBox.height / 2;
            } else {
                cy = Math.max(cameraBox.y + cameraHalf.y, cy);
                cy = Math.min(cameraBox.y + cameraBox.height - cameraHalf.y, cy);
            }
        }
    }

    cameraFocus.x = cx;
    cameraFocus.y = cy;

    if (snap) {
        // _.each(map.layers, (layer:MapLayer) => {
        // TODO parallax
        for (let layer of map.layers) {
            layer.patchLayer.offset(-cx + cameraHalf.x, -cy + cameraHalf.y);
            layer.spriteLayer.offset(-cx + cameraHalf.x, -cy + cameraHalf.y);
        }
        // });
        if (map.debugLayer) map.debugLayer.offset(-cx + cameraHalf.x, -cy + cameraHalf.y);
    }
}

export function cameraFollow(e:Entity) {
    cameraTarget = e;
}

export function setCameraSpeed(sp:number):void {
    cameraSpeed = sp;
}

export function getPlayer():Entity {
    return player;
}

export function setPlayer(e:Entity) {
    player = e;
}

export function setCharacters(ch:any) {
    characters = ch;
}

export function clearMap() {
    map = null;
}

export function getBattleSystem() { return battleSystem; }
export function getCameraFocus() { return cameraFocus; }
export function getCameraSpeed() { return cameraSpeed; }
export function getCharacters() { return characters; }
export function getCharacter(k) { return characters[k]; }
export function getUiPlane() { return uiPlane; }
export function getRenderPlane() { return renderPlane; }
export function getDebugPlane() { return debugPlane; }
export function getMap() { return map; }
export function getMapkey() { return mapkey; }
export function getMainMenuClass() { return mainMenuClass; }
export function getEquipSlots() { return equipSlots; }
export function getMoneyName() { return moneyName; }

export function getSFX(k) { return sfx[k]; }
export function getSFXKeys() { return Object.keys(sfx); }
export function getMusic(k) { return music[k]; }
export function getMusicKeys() { return Object.keys(music); }

export function startMap(key:string, x?:number, y?:number, layerName?:string, options?:any) {
    mapkey = key;
    
    let opts = options || {};
    Scene.do(function*() {
        if (!opts.noFadeOut)
            yield* Scene.waitFadeOut(0.2);

        if (map) {
            map.finish();
            map.close();
        }

        // // let mapArgs = _.clone(mapLookup[mapkey]);
        let mapArgs = mapLookup[mapkey].slice(0);
        let mapType = mapArgs.shift();

        map = null;
        rawOpenMap(mapArgs, mapType)
            .then((m) => map = m);
        while (!map) yield;

        console.log(map);

        player.place((x + 0.5) * map.tileSize.x, (y + 0.5) * map.tileSize.y, map.getLayerByName(layerName || '#spritelayer'));
        if (opts.direction) player.dir = opts.direction;
        centerCameraOn(player.position, true);

        if (!opts.noFadeIn)
            yield* Scene.waitFadeIn(0.2);

        map.start();
    });
}

export async function rawOpenMap(args:any, type?:any) {
    if (type === undefined) {
        type = GameMap;
    }

    console.log("rawOpenMap>", args);
    // if we're loading a map file by path, preload the file
    if (typeof args === 'string') {
        args = Cozy.gameDir().file(args);
        await args.load();
        console.log("Map file loaded:", args);
    }

    let newmap = new type(args);
    newmap.open();

    return newmap;
}
