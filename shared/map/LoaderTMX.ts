import * as Cozy from 'Cozy';
import { Entity } from '../Entity';
import { GameMap, MapTrigger, MapEvent } from './Map';
import { MapLayer } from './MapLayer';
import { MapObstruction } from './MapObstruction';
import { loadTSX } from './LoaderTSX'

// TODO ??
const propertyMap = {
    'Name': 'displayName'
};

const parseObject = {
    event: (map, layer, el) => {
        let x = parseInt(el.getAttribute('x'), 10),
            y = parseInt(el.getAttribute('y'), 10),
            w = parseInt(el.getAttribute('width'), 10),
            h = parseInt(el.getAttribute('height'), 10),
            propertiesEl = <HTMLElement>el.getElementsByTagName('properties')[0],
            ev = new MapEvent(map.tileSize);
        ev.name = el.getAttribute('name');
        ev.rect = new PIXI.Rectangle(x, y, w, h);
        ev.properties = {};
        if (propertiesEl) {
            for (let i of Object.getOwnPropertyNames(propertiesEl.children)) {
                let property = propertiesEl.children[i];
                ev.properties[property.getAttribute('name')] = property.getAttribute('value');
            }
        }

        ev.obstructions = [];

        // TODO :|
        if (ev.properties['obstructNPCs'] !== 'false') {
            var o:MapObstruction = new MapObstruction({x1:x, y1:y, x2:x+w, y2:y});
            layer.obstructions.push(o);
            ev.obstructions.push(o);
            o = new MapObstruction({x1:x,y1:y,x2:x,y2:y+h});
            layer.obstructions.push(o);
            ev.obstructions.push(o);
            o = new MapObstruction({x1:x,y1:y+h,x2:x+w,y2:y+h});
            layer.obstructions.push(o);
            ev.obstructions.push(o);
            o = new MapObstruction({x1:x+w,y1:y,x2:x+w,y2:y+h});
            layer.obstructions.push(o);
            ev.obstructions.push(o);
        }

        ev.solid = false;
        layer.events.push(ev);
    },

    trigger: (map, layer, el) => {
        let x = parseInt(el.getAttribute('x'), 10),
            y = parseInt(el.getAttribute('y'), 10),
            w = parseInt(el.getAttribute('width'), 10),
            h = parseInt(el.getAttribute('height'), 10),
            propertiesEl = <HTMLElement>el.getElementsByTagName('properties')[0],
            tr = new MapTrigger(map.tileSize);
        tr.name = el.getAttribute('name');
        tr.rect = new PIXI.Rectangle(x, y, w, h);
        tr.properties = {};
        if (propertiesEl) {
            for (let i of Object.getOwnPropertyNames(propertiesEl.children)) {
                let property = propertiesEl.children[i];
                tr.properties[property.getAttribute('name')] = property.getAttribute('value');
            }
        }

        if (tr.properties['solid']) {
            tr.solid = (el.getAttribute('solid') === 'true' || el.getAttribute('solid') === '1');
            delete(tr.properties['solid']);
        }

        tr.obstructions = [];
        var o:MapObstruction = new MapObstruction({x1:x,y1:y,x2:x+w,y2:y});
        layer.obstructions.push(o);
        tr.obstructions.push(o);
        o = new MapObstruction({x1:x,y1:y,x2:x,y2:y+h});
        layer.obstructions.push(o);
        tr.obstructions.push(o);
        o = new MapObstruction({x1:x,y1:y+h,x2:x+w,y2:y+h})
        layer.obstructions.push(o);
        tr.obstructions.push(o);
        o = new MapObstruction({x1:x+w,y1:y,x2:x+w,y2:y+h});
        layer.obstructions.push(o);
        tr.obstructions.push(o);

        layer.triggers.push(tr);
    },

    entity: (map, layer, el) => {
        let x = parseInt(el.getAttribute('x'), 10),
            y = parseInt(el.getAttribute('y'), 10),
            args = {
                id: el.getAttribute('id'),
                name: el.getAttribute('name')
            };

        x += parseInt(el.getAttribute('width'), 10) / 2;
        y += parseInt(el.getAttribute('height'), 10) / 2;
    
        let propertiesEl = <HTMLElement>el.getElementsByTagName('properties')[0];

        if (propertiesEl) {
            for (let i of Object.getOwnPropertyNames(propertiesEl.children)) {
                let property = propertiesEl.children[i];
                args[property.getAttribute('name')] = property.getAttribute('value');
            }
        }

        const e = new Entity(args);
        e.spawn = new PIXI.Point(x, y);
        layer.entities.push(e);
    },

    camerabox: (map, layer, el) => {
        let x = parseInt(el.getAttribute('x'), 10),
            y = parseInt(el.getAttribute('y'), 10),
            w = parseInt(el.getAttribute('width'), 10),
            h = parseInt(el.getAttribute('height'), 10);
        map.cameraBoxes.push(new PIXI.Rectangle(x, y, w, h));
    },

    obstruction: (map, layer, el) => {
        let x = parseInt(el.getAttribute('x'), 10),
            y = parseInt(el.getAttribute('y'), 10),
            name = el.hasAttribute('name') ? el.getAttribute('name') : null;

        if (el.hasAttribute('width') && el.hasAttribute('height')) {
            var w = parseInt(el.getAttribute('width'), 10),
                h = parseInt(el.getAttribute('height'), 10);
            layer.obstructions.push(new MapObstruction({x1:x,y1:y,x2:x+w,y2:y,name:name}));
            layer.obstructions.push(new MapObstruction({x1:x,y1:y,x2:x,y2:y+h,name:name}));
            layer.obstructions.push(new MapObstruction({x1:x,y1:y+h,x2:x+w,y2:y+h,name:name}));
            layer.obstructions.push(new MapObstruction({x1:x+w,y1:y,x2:x+w,y2:y+h,name:name}));
        } else {
            for (let i of Object.getOwnPropertyNames(el.children)) {
                let defEl = el.children[i];

                switch(defEl.tagName) {
                    case 'polyline':
                        var points = defEl.getAttribute('points').split(" ");
                        var last_point:PIXI.Point = null;
                        points.forEach((pt) => {
                            var pts = pt.split(",");
                            var point = new PIXI.Point(parseInt(pts[0], 10) + x, parseInt(pts[1],10) + y );
                            if (last_point !== null) {
                                layer.obstructions.push(new MapObstruction({x1:last_point.x,y1:last_point.y,x2:point.x,y2:point.y,name:name}));
                            }
                            last_point = point;
                        });
                        break;
                }
            }
        }
    }
};

const parseMapChild = {
    properties: (map, el) => {
        for (let i of Object.getOwnPropertyNames(el.children)) {
            let propEl = el.children[i];
            var key = propEl.getAttribute('name');
            if (propertyMap[key]) {
                map[propertyMap[key]] = propEl.getAttribute('value');
            } else {
                console.warn(`Ignoring unrecognized property called '${key}'.`);
            }
        }
    },

    tileset: (map, el, dataDirectory) => {
        // TODO support non-external tilesets; not sure what they look like yet
        if (el.getAttribute('source')) {
            let ts = loadTSX(dataDirectory, el.getAttribute('source'));
            map.addTileSet(parseInt(el.getAttribute('firstgid'), 10), ts);
        }
    },

    layer: (map, el) => {
        // TODO this assumes encoding="csv" but that may not be true
        let dataEl:HTMLElement = <HTMLElement>el.getElementsByTagName('data')[0];
        let tileString = dataEl.innerHTML.replace(/\s/g, '');

        let layer = new MapLayer(el.getAttribute("name"));
        map.addLayer(layer);
        layer.map = map;
        layer.tiles = [];
        layer.tileLookup = [];
        tileString.split(',').forEach((x) => layer.tiles.push(parseInt(x, 10)));
    },

    objectgroup: (map, el) => {
        let layer = new MapLayer(el.getAttribute("name"));
        map.addLayer(layer);
        layer.map = map;
        layer.obstructions = [];
        layer.events = [];
        layer.triggers = [];
        layer.entities = [];
        for (let objectEl of el.children) {
            let objectType = objectEl.getAttribute('type');
            if (parseObject[objectType]) {
                parseObject[objectType](map, layer, objectEl);
            } else {
                parseObject.obstruction(map, layer, objectEl);
            }
        }
    }
};

export function loadTMX(file:Cozy.File, existingMap?:GameMap) {
    const map = existingMap || new GameMap({});
    const dataDirectory = file.dir;
    const data = file.getData('xml');
    const mapEl = data.getElementsByTagName('map')[0];

    map.filename = file.relativePath(Cozy.gameDir()).replace(/\\/, '/'); // TODO this is kind of dumb, need to reconcile this stuff
    map.size = new PIXI.Point(parseInt(mapEl.getAttribute('width'), 10), parseInt(mapEl.getAttribute('height'), 10));
    map.tileSize = new PIXI.Point(parseInt(mapEl.getAttribute('tilewidth'), 10), parseInt(mapEl.getAttribute('tileheight'), 10));

    for (let el of mapEl.children) {
        if (parseMapChild[el.tagName]) {
            parseMapChild[el.tagName](map, el, dataDirectory);
        } else {
            console.warn(`Ignoring unknown tag named '${el.tagName}'.`);
        }
    }

    map.cameraBoxes.push(new PIXI.Rectangle(0, 0, map.size.x * map.tileSize.x, map.size.y * map.tileSize.y));
    return map;
}
