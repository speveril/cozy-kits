import * as Cozy from 'Cozy';
import { getUiPlane, getMap, getMapkey, getCharacters, getPlayer, setPlayer, setCharacters, startMap } from './Core';
import { Character } from './Character';
import { Inventory } from './Inventory';
import { GameMap } from './map/Map';
import { Party } from './Party';

export class SavedGame {
    static count():number {
        // this is kind of dumb.
        var files:Cozy.UserdataFile[] = Cozy.UserdataFile.glob("saves/save-*.json");
        return files.length;
    }

    static async getList():Promise<SavedGame[]> {
        var files:Cozy.UserdataFile[] = Cozy.UserdataFile.glob("saves/save-*.json");

        let loadPromises = [];
        for (let f of files) {
            loadPromises.push(f.load());
        }
        await Promise.all(loadPromises);

        // reverse sort by modification time
        files.sort((a,b) => {
            return a.stat().mtime > b.stat().mtime ? -1 : 1;
        });

        return files.map((f) => new SavedGame(f, f.getData('json')));
    }

    static fromFile(f:Cozy.UserdataFile):Promise<SavedGame> {
        return new Promise((resolve, reject) => {
            f.load().then(() => resolve(new SavedGame(f, f.getData('json'))));
        });
    }

    static fromState():Promise<SavedGame> {
        getUiPlane().hide();
        let resolve;
        let p = <Promise<SavedGame>>new Promise((_res, _rej) => {
            resolve = _res;
        });

        window.requestAnimationFrame(() => {
            Cozy.captureScreenshot(48)
                .then((image) => {
                    getUiPlane().show();

                    var next = 1;
                    let savefiles = Cozy.UserdataFile.glob("saves/save-*.json");
                    for (let f of savefiles) {
                        var m = f.name.match(/save-(\d+)/);
                        if (!m) continue;
                        var i = parseInt(m[1], 10);
                        if (i >= next) next = i + 1;
                    }

                    let file = new Cozy.UserdataFile(`saves/save-${next.toString()}.json`);
                    var data = {
                        image:          image.toDataURL(),
                        name:           getMap().displayName,
                        map:            getMapkey(),
                        mapPersistent:  GameMap.persistent,
                        party:          Party.serialize(),
                        characters:     Cozy.mapO(getCharacters(), (ch) => ch.serialize()),
                        playerLocation: {
                            x:   (getPlayer().position.x / getMap().tileSize.x) | 0,
                            y:   (getPlayer().position.y / getMap().tileSize.y) | 0,
                            lyr: getPlayer().layer.name
                        }
                    };
                    resolve(new SavedGame(file, data));
                });
        });

        return p;
    }

    // ---

    file:Cozy.UserdataFile;
    data:any;

    constructor(file:Cozy.UserdataFile, data:any) {
        this.file = file;
        this.data = data;
    }

    applyToState() {
        // TODO there may be implications here of not doing deep-clones

        // TODO probably want to be actually do this somewhere in Party; a cleanup maybe?
        Party.inventory = new Inventory();
        Party.members = [];

        this.data.party.inventory.forEach((k:string) => Party.inventory.add(k));
        setCharacters(Cozy.mapO(this.data.characters, (def) => new Character(def)));
        this.data.party.members.forEach((k:string) => Party.add(getCharacters()[k]));
        Party.money = parseInt(this.data.party.money, 10) || 0;

        setPlayer(Party.members[0].makeEntity());

        GameMap.persistent = this.data.mapPersistent || { global: {} };
        if (this.data.map) startMap(this.data.map, this.data.playerLocation.x, this.data.playerLocation.y, this.data.playerLocation.lyr);
    }

    writeToDisk() {
        this.file.setData(JSON.stringify(this.data));
        this.file.write();
    }
}
