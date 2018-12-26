import * as Cozy from 'Cozy';

import { getCharacters } from './Core';
import { Character } from './Character';
import { Entity } from './Entity';
import { Inventory } from './Inventory';
import { Item } from './Item';

export class PartyMember {
    character:Character;
    entity:Entity;

    constructor(ch) {
        this.character = ch;
        this.entity = null;
    }

    makeEntity() {
        this.entity = new Entity({
            sprite: this.character.sprite,
            speed: 80, // 300, // TODO get this from a config
            triggersEvents: true,
            respectsObstructions: 'true'
        });
        console.log("makeEntity =>", this.entity);
        return this.entity;
    }
}

export class Party {
    static members:Array<PartyMember> = [];
    static inventory:Inventory = new Inventory();
    static money:number = 0;

    static add(ch:Character) {
        var pm = new PartyMember(ch);
        this.members.push(pm);
    }

    static each(f:(ch:Character)=>void) {
        for (var i = 0; i < this.members.length; i++) {
            f(this.members[i].character);
        }
    }

    static characters():Array<Character> {
        // return _.pluck(this.members, "character");
        return this.members.map((x) => x['character']);
    }

    static isInParty(ch:Character):boolean {
        return Party.characters().indexOf(ch) !== -1;
    }

    static serialize():any {
        return {
            // members:        _.map(this.members, (m:PartyMember) => _.find(_.keys(characters), (k) => characters[k] === m.character)),
            members:        this.members.map((m:PartyMember) => Object.keys(getCharacters()).find((k) => getCharacters()[k] === m.character)),
            // inventory:      _.map(this.inventory.get(), (i:Item) => i.key),
            inventory:      this.inventory.get().map((i:Item) => i.key),
            money:          this.money
        };
    }
}
