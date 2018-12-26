import * as Cozy from 'Cozy'
import { getMoneyName, getMusic, getSFX, getUiPlane } from '../../Core';
import { BouncyComponent } from '../../BouncyComponent';
import { Character } from '../../Character';
import { Dice } from '../../Dice';
import { Effect } from '../../Effect';
import { Item } from '../../Item';
import { Menu } from '../../Menu';
import { Textbox } from '../../Textbox';
import { Party } from '../../Party';
import { Scene } from '../../Scene';
import { uiBattleScreen } from './uiBattleScreen';

export class System {
    fightMusic:Cozy.Music                   = null;
    fightSound:Cozy.SFX                     = null;
    victoryMusic:Cozy.Music                 = null;
    monsters:any                            = null;
    renderPlane:Cozy.RenderPlane            = null;
    uiPlane:Cozy.UiPlane                    = null;
    gameOver:any                            = null;

    combatants:Array<Character>             = null;
    bouncyComponent:BouncyComponent     = null;

    constructor(args:any) {
        this.fightMusic = getMusic(args.fightMusic) || null;
        this.fightSound = getSFX(args.fightSound) || null;
        this.victoryMusic = getMusic(args.victoryMusic) || null;
        this.monsters = args.monsters || {};
        this.gameOver = args.gameOver || Cozy.quit;

        this.renderPlane = <Cozy.RenderPlane>Cozy.addPlane(Cozy.RenderPlane, { className: 'battle-render' });
        this.renderPlane.container.classList.add('hide');
        this.renderPlane.hide();

        this.uiPlane = <Cozy.UiPlane>Cozy.addPlane(Cozy.UiPlane, { className: 'battle-ui' });
        this.uiPlane.hide();
    }

    *start(args:any) {
        //// SET UP

        this.uiPlane.clear();
        this.renderPlane.clear();
        this.renderPlane.container.classList.add('hide');

        var music = Cozy.Audio.currentMusic;
        if (this.fightSound) this.fightSound.play();
        if (this.fightMusic) this.fightMusic.start();

        var player = Party.members[0].character;
        var monster = new Character(this.monsters[args.enemy]);
        var monsterActions = this.monsters[args.enemy].actions;
        this.combatants = [player, monster];

        let opts = {};
        if (args['noFlee']) {
            opts['noFlee'] = true;
        }

        var battleScreen = new uiBattleScreen(player, monster, opts);
        this.uiPlane.addChild(battleScreen);

        let monsterLayer = this.renderPlane.addRenderLayer();
        let bgSprite = new Cozy.Sprite({
            texture: args.scene,
            position: { x: 80, y: 0 }
        });
        let monsterSprite = new Cozy.Sprite({
            texture: this.monsters[args.enemy].image,
            position: { x: -320, y: 0 }
        });
        monsterLayer.add(bgSprite);
        monsterLayer.add(monsterSprite);

        battleScreen.update(0);

        this.uiPlane.show();
        this.renderPlane.show();

        this.renderPlane.bringToFront();
        getUiPlane().bringToFront();
        this.uiPlane.bringToFront();
        this.renderPlane.container.classList.add('hide');

        this.bouncyComponent = new BouncyComponent();
        this.uiPlane.addChild(this.bouncyComponent);

        Cozy.Input.debounce('confirm');

        //// LOOP

        var result = null;
        var battleOutcome:any = null;
        var dt:any = 0;

        yield *Scene.waitFrame(1);
        this.renderPlane.container.classList.remove('hide');
        yield *Scene.waitTime(0.25);

        const v = 400 / 0.25;
        let d = 0;

        while (monsterSprite.position.x < 80) {
            dt = yield;
            d = v * dt;

            monsterSprite.adjustPosition(d, 0);
        }
        battleScreen.go();

        monsterSprite.setPosition(80, 0);

        Textbox.show("Encountered " + monster.name + "!");

        // TODO sounds should be passed into the configuration somehow, or something like that
        while (!battleOutcome) {
            //// PLAYER ACTION PHASE

            Menu.push(battleScreen.menu);
            while(!battleScreen.menu.done) {
                dt = yield;
                Menu.update(dt);
            }

            switch(battleScreen.menu.result.action) {
                case 'fight':
                    // TODO the result should just pass back messages, somehow...
                    result = Effect.do('basicAttack', player, monster, ['physical']);
                    switch (result.type) {
                        case 'crit':
                            getSFX('battle_playerhit').play();
                            this.output(`\nYou score a critical hit on the ${monster.name}! It takes ${(-result.hpChange)} damage.`);
                            monsterSprite.quake(0.5, { x: 7, y: 2 }, { x: 14, y: 4 });
                            this.bouncyComponent.show((-result.hpChange).toString());
                            break;
                        case 'hit':
                            getSFX('battle_playerhit').play();
                            this.output(`\nYou hit the ${monster.name}! It takes ${(-result.hpChange)} damage.`);
                            monsterSprite.quake(0.5, { x: 5, y: 1 }, { x: 10, y: 2 });
                            this.bouncyComponent.show((-result.hpChange).toString());
                            break;
                        case 'weak':
                            this.output(`\nYou hit the ${monster.name}, but it's a weak hit. It takes ${(-result.hpChange)} damage.`);
                            getSFX('battle_playerweakhit').play();
                            monsterSprite.quake(0.5, { x: 3, y: 0 }, { x: 6, y: 0 });
                            this.bouncyComponent.show((-result.hpChange).toString());
                            break;
                        case 'miss':
                            getSFX('battle_playermiss').play();
                            this.output(`\nYou miss the ${monster.name}.`);
                            this.bouncyComponent.show("miss");
                            break;
                    }
                    break;
                case 'item':
                    var item = battleScreen.menu.result.item;
                    this.output(`\nYou use ${item.iconHTML}${item.name}.`);
                    if (!item.def.useEffect) {
                        this.output(`\nYou can't use that!`);
                    } else {
                        var target = item.def.useEffect._target === 'enemy' ? monster : player;
                        result = item.activate(target, { source: player })
                        if (result.success) {
                            this.outputEffectResult(target, result);
                        } else {
                            this.output(`\nIt doesn't seem to work.`);
                        }
                    }
                    break;
                case 'flee':
                    this.output(`\nYou attempt to escape.`);
                    result = this.resolveFlee(player, monster);
                    if (result.success) battleOutcome = { playerEscaped: true };
                    else this.output(`\nYou can't get away!`);
                    break;
            }

            yield* Scene.waitTime(0.75);

            if (monster.hp <= 0) battleOutcome = { victory: true };
            if (battleOutcome) break;

            //// MONSTER ACTION PHASE

            var monsterAction = this.monsterThink(monsterActions, monster, player);

            if (monsterAction._sound) {
                getSFX(monsterAction._sound).play()
            }
            if (monsterAction._message) {
                this.output("\n" + monsterAction._message);
            }

            result = {};
            // _.each(monsterAction, (params:any, effect:string) => {
            for (let effect of Object.keys(monsterAction)) {
                let params = monsterAction[effect];
                if (effect[0] === '_') return;
                let r = Effect.do(effect, monster, player, params);
                // _.each(r, (v, k:string) => {
                for (let k of Object.keys(r)) {
                    if (k === 'success') result[k] = result[k] || v;
                    else result[k] = result[k] ? result[k] + v : v;
                }
            }

            if (result.sound) {
                getSFX(result.sound).play();
            }
            if (result.message) {
                this.output("\n" + result.message);
            }

            if (monsterAction.basicAttack) {
                switch (result.type) {
                    case 'crit':
                        getSFX('battle_playerhit').play(); // TODO
                        battleScreen.shake();
                        this.output(`\nThe ${monster.name} scores a critical hit on you! You take ${(-result.hpChange)} damage.`);
                        break;
                    case 'hit':
                        getSFX('battle_playerhit').play(); // TODO
                        battleScreen.shake();
                        this.output(`\nThe ${monster.name} hits you! You take ${(-result.hpChange)} damage.`);
                        break;
                    case 'weak':
                        getSFX('battle_playerweakhit').play(); // TODO
                        battleScreen.shake();
                        this.output(`\nThe ${monster.name} hits you, but it's a weak hit. You take ${(-result.hpChange)} damage.`);
                        break;
                    case 'miss':
                        getSFX('battle_playermiss').play(); // TODO
                        this.output(`\nThe ${monster.name} attacks, but misses you.`);
                        break;
                }
            } else if (result.hpChange) {
                this.outputEffectResult(player, result);
            }

            if (monsterAction.flee) {
                this.output(`\nThe ${monster.name} tries to run away.`);
                result = this.resolveFlee(monster, player);
                if (result.success) battleOutcome = { monsterEscaped: true };
                else this.output(`\nIt doesn't get away!`);
            }

            yield* Scene.waitTime(0.75);

            if (player.hp < 1) battleOutcome = { defeat: true };
            if (battleOutcome) break;
        }

        //// RESOLUTION PHASE

        if (battleOutcome.defeat) {
            this.output("\nYou have died!");
            Cozy.Audio.currentMusic.stop(2.0);
            yield* Scene.waitFadeTo("black", 2.0);

            Cozy.Input.debounce('confirm');
            this.renderPlane.hide();
            this.uiPlane.hide();
            this.renderPlane.clear();
            Textbox.hide();

            this.gameOver();
            while (true) yield;
        } else if (battleOutcome.victory) {
            if (this.victoryMusic) this.victoryMusic.start();

            this.output(`\nThe ${monster.name} is defeated!`);
            yield* Scene.waitTime(0.75);

            this.output(`\nYou gained ${monster.xp} XP!`);

            for (let partyIdx = 0; partyIdx < Party.members.length; partyIdx++) {
                let ch = Party.members[partyIdx].character;
                let lv = ch.level;
                ch.xp += monster.xp;
                while (lv < ch.level) {
                    lv++;

                    let thisLevel = ch.levels[lv];
                    let lastLevel = ch.levels[lv - 1];

                    this.output(`\nYou are now level ${lv}!`);
                    let changes = [];
                    let diff;

                    diff = thisLevel.hp - lastLevel.hp;
                    if (diff !== 0) {
                        changes.push(`${diff < 0 ? '' : '+'}${diff} HP`);
                    }
                    // _.each(Character.attributes, (attr, idx) => {
                    for (let idx in Character.attributes) {
                        let attr = Character.attributes[idx];
                        diff = thisLevel[attr] - lastLevel[attr];
                        if (diff !== 0) {
                            changes.push(`${diff < 0 ? '' : '+'}${diff} ${Character.attributeAbbr[idx]}`);
                        }
                    }

                    if (changes.length > 0) {
                        this.output(`\nYou gain ${changes.join(", ")}.`);
                    }

                    yield *Scene.waitButton('confirm');
                    Cozy.Input.debounce('confirm');
                }
            }

            let money = 0;
            let loot = [];
            // _.each(monster.treasure, (t:any) => {
            for (let t of monster.treasure) {
                if (t.chance && Math.random()*100 > t.chance) {
                    return;
                }

                if (t.item === '_money') {
                    money += Dice.roll(null, t.count);
                    Party.money += money;
                } else {
                    let it = Item.library[t.item];
                    let count = (t.count === undefined ? 1 : Dice.roll(null, t.count));
                    if (count > 0) {
                        loot.push(`${it.iconHTML}${it.name}${count > 1 ? ' x' + count : ''}`);
                        Party.inventory.add(t.item, count);
                    }
                }
            }

            if (money > 0) {
                loot.push(`${money} ${getMoneyName()}`);
            }

            if (loot.length > 0) {
                if (loot.length === 1) {
                    this.output("\nYou found " + loot[0] + "!");
                } else {
                    let extra = loot.pop();
                    this.output("\nYou found " + loot.join(",") + " and " + extra + "!");
                }
            } else {
                this.output(`\nYou didn't find anything.`);
            }
            yield* Scene.waitTime(1.5);
        } else if (battleOutcome.playerEscaped) {
            // TODO sound
            this.output(`\nYou escaped!`);
        } else if (battleOutcome.monsterEscaped) {
            // TODO sound
            this.output(`\nThe ${monster.name} escaped!`);
        }

        //// CLEAN UP

        yield* Scene.waitButton('confirm');
        this.combatants = [];

        if (music) music.start();

        Cozy.Input.debounce('confirm');

        this.renderPlane.hide();
        this.uiPlane.hide();

        this.renderPlane.clear();

        Textbox.hide();

        return battleOutcome;
    }

    output(s) {
        Textbox.box.appendText(s);
    }

    monsterThink(actions:Array<any>, monster:Character, player:Character) {
        if (!actions) {
            return { 'basicAttack':['physical'] };
        }

        // let maxchance = _.reduce(actions, (x:number, act:any) => x + act._chance, 0);
        let maxchance = actions.reduce((x:number, act:any) => x + act._chance, 0);
        let roll = Math.random() * maxchance;
        for (let i = 0; i < actions.length; i++) {
            if (roll < actions[i]._chance) {
                return actions[i];
            } else {
                roll -= actions[i]._chance;
            }
        }

        console.warn("ERROR: Somehow we got to the end of monsterThink without choosing an action.");
    }

    outputEffectResult(target:Character, result:any) {
        if (Party.isInParty(target)) {
            // if (_.has(result, 'hpChange')) {
            if (result.hasOwnProperty('hpChange')) {
                if (result.hpChange > 0) this.output(`\nYou gain ${result.hpChange} health!`);
                if (result.hpChange < 0) this.output(`\nYou take ${-result.hpChange} damage!`);
            }
        } else {
            // if (_.has(result, 'hpChange')) {
            if (result.hasOwnProperty('hpChange')) {
                if (result.hpChange > 0) {
                    this.bouncyComponent.show(result.hpChange.toString(), 'heal');
                    this.output(`\nThe ${target.name} gains ${result.hpChange} health!`);
                }
                if (result.hpChange < 0) {
                    this.bouncyComponent.show((-result.hpChange).toString());
                    this.output(`\nThe ${target.name} takes ${-result.hpChange} damage!`);
                }
            }
        }
    }

    resolveFlee(runner:Character, chaser:Character):any {
        return { success: (Math.random() < 0.6) };
    }

    isCombatant(ch:Character):boolean {
        return this.combatants.indexOf(ch) !== -1;
    }
}
