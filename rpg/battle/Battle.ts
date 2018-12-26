import { getBattleSystem } from '../Core';
import { Character } from '../Character';
import { Scene } from '../Scene';

export enum AttackResult { Miss, Weak, Normal, Critical  };
export class Battle {
    static active:boolean = false;

    static start(args):Promise<any> {
        return new Promise((resolve, reject) => {
            Scene.do(function *() {
                let result = yield *Battle.waitBattle(args);
                resolve(result);
            });
        });
    }

    static *waitBattle(args) {
        Battle.active = true;
        let result = yield *getBattleSystem().start(args);
        Battle.active = false;
        return result;
    }

    static isCombatant(ch:Character):boolean {
        if (!Battle.active) return false;
        return getBattleSystem().isCombatant(ch);
    }
}
