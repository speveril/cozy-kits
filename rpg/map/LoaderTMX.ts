import * as Cozy from 'Cozy';
import { Entity } from '../Entity';
import { GameMap, MapTrigger, MapEvent } from './Map';
import { MapLayer } from './MapLayer';
import { MapObstruction } from './MapObstruction';
import { loadTSX } from './LoaderTSX'

export function loadTMX(path:string, existingMap?:GameMap) {
    var map = existingMap || new GameMap({});

    var dataDirectory = path.substr(0, path.lastIndexOf('/') + 1);
    const data = Cozy.File.get(path).getData('xml');
    var mapEl = data.getElementsByTagName('map')[0];

    map.filename = path;
    map.size = new PIXI.Point(parseInt(mapEl.getAttribute('width'), 10), parseInt(mapEl.getAttribute('height'), 10));
    map.tileSize = new PIXI.Point(parseInt(mapEl.getAttribute('tilewidth'), 10), parseInt(mapEl.getAttribute('tileheight'), 10));

    // TODO ??
    var propertyMap = {
        'Name': 'displayName'
    };

    for (let i in mapEl.children) {
        let el = mapEl.children[i];
        switch (el.tagName) {
            case "properties":
                for (let i in el.children) {
                    let propEl = el.children[i];
                    var key = propEl.getAttribute('name');
                    if (propertyMap[key]) {
                        map[propertyMap[key]] = propEl.getAttribute('value');
                    } else {
                        console.warn(`Ignoring unrecognized property called '${key}'.`);
                    }
                }
                break;
            case "tileset":
                if (el.getAttribute('source')) {
                    var ts = loadTSX(dataDirectory, el.getAttribute('source'));
                    map.addTileSet(parseInt(el.getAttribute('firstgid'), 10), ts);
                }
                // TODO support non-external tilesets; not sure what they look like yet

                break;
            case "layer":
                // TODO this assumes encoding="csv" but that may not be true
                var dataEl:HTMLElement = <HTMLElement>el.getElementsByTagName('data')[0];
                var tileString = dataEl.innerHTML.replace(/\s/g, '');

                var layer = new MapLayer(el.getAttribute("name"));
                map.addLayer(layer);
                layer.map = map;
                layer.tiles = [];
                layer.tileLookup = [];
                tileString.split(',').forEach((x) => layer.tiles.push(parseInt(x, 10)));
                break;
            case "objectgroup":
                var layer = new MapLayer(el.getAttribute("name"));
                map.addLayer(layer);
                layer.map = map;
                layer.obstructions = [];
                layer.events = [];
                layer.triggers = [];
                layer.entities = [];
                for (let i in el.children) {
                    let objectEl = el.children[i];
                    var x = parseInt(objectEl.getAttribute('x'), 10),
                        y = parseInt(objectEl.getAttribute('y'), 10);

                    switch(objectEl.getAttribute('type')) {
                        case "event":
                            var w = parseInt(objectEl.getAttribute('width'), 10),
                                h = parseInt(objectEl.getAttribute('height'), 10),
                                propertiesEl = <HTMLElement>objectEl.getElementsByTagName('properties')[0],
                                ev = new MapEvent(map.tileSize);
                            ev.name = objectEl.getAttribute('name');
                            ev.rect = new PIXI.Rectangle(x, y, w, h);
                            ev.properties = {};
                            if (propertiesEl) {
                                for (let i in propertiesEl.children) {
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
                            break;
                        case "trigger":
                            var w = parseInt(objectEl.getAttribute('width'), 10),
                                h = parseInt(objectEl.getAttribute('height'), 10),
                                propertiesEl = <HTMLElement>objectEl.getElementsByTagName('properties')[0],
                                tr = new MapTrigger(map.tileSize);
                            tr.name = objectEl.getAttribute('name');
                            tr.rect = new PIXI.Rectangle(x, y, w, h);
                            tr.properties = {};
                            if (propertiesEl) {
                                for (let i in propertiesEl.children) {
                                    let property = propertiesEl.children[i];
                                    tr.properties[property.getAttribute('name')] = property.getAttribute('value');
                                }
                            }

                            if (tr.properties['solid']) {
                                tr.solid = (objectEl.getAttribute('solid') === 'true' || objectEl.getAttribute('solid') === '1');
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
                            break;
                        case "entity":
                            var propertiesEl = <HTMLElement>objectEl.getElementsByTagName('properties')[0],
                                args = {
                                    id: objectEl.getAttribute('id'),
                                    name: objectEl.getAttribute('name')
                                };
                            x += parseInt(objectEl.getAttribute('width'), 10) / 2;
                            y += parseInt(objectEl.getAttribute('height'), 10) / 2;
                            if (propertiesEl) {
                                for (let i in propertiesEl) {
                                    let property = propertiesEl.children[i];
                                    args[property.getAttribute('name')] = property.getAttribute('value');
                                }
                            }
                            var e = new Entity(args);
                            e.spawn = new PIXI.Point(x, y);
                            layer.entities.push(e);
                            break;
                        case 'camerabox':
                            var w = parseInt(objectEl.getAttribute('width')),
                                h = parseInt(objectEl.getAttribute('height'));
                            map.cameraBoxes.push(new PIXI.Rectangle(x, y, w, h));
                            break;
                        default:
                            var name = objectEl.hasAttribute('name') ? objectEl.getAttribute('name') : null;
                            if (objectEl.hasAttribute('width') && objectEl.hasAttribute('height')) {
                                var w = parseInt(objectEl.getAttribute('width'), 10),
                                    h = parseInt(objectEl.getAttribute('height'), 10);
                                layer.obstructions.push(new MapObstruction({x1:x,y1:y,x2:x+w,y2:y,name:name}));
                                layer.obstructions.push(new MapObstruction({x1:x,y1:y,x2:x,y2:y+h,name:name}));
                                layer.obstructions.push(new MapObstruction({x1:x,y1:y+h,x2:x+w,y2:y+h,name:name}));
                                layer.obstructions.push(new MapObstruction({x1:x+w,y1:y,x2:x+w,y2:y+h,name:name}));
                            } else {
                                for (let i in objectEl.children) {
                                    let defEl = objectEl.children[i];

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
                }
                break;
            default:
                console.warn(`Ignoring unknown tag named '${el.tagName}'.`);
        }
    }

    map.cameraBoxes.push(new PIXI.Rectangle(0, 0, map.size.x * map.tileSize.x, map.size.y * map.tileSize.y));
    return map;
}
