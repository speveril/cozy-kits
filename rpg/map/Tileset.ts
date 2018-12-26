import * as Cozy from 'Cozy'

export class MapTileset {
    index:number;
    texture:string;
    animations:{ [name:string]: any } = {};
}

export class MapTile extends Cozy.Sprite {}
