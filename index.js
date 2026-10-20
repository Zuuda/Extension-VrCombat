import { getContext } from '../../../extensions.js';
export { MODULE_NAME };

// Define module name
const MODULE_NAME = 'VrCombat';

// ============== COMBAT ENGINE START ==============
const VrCombat = (() => {
    // 1. MOB STAT GENERATION
    const createMob = (level, type) => {
        const baseStats = {
            hp: 15 + 5 * level,
            atk: 3 + 1.5 * level,
            def: 2 + 1 * level,
            luk: Math.max(1, level - 1)
        };

        const typeModifiers = {
            Trash: { hp: 0.8, atk: 0.9, def: 0.7, luk: 1.0 },
            Normal: { hp: 1.0, atk: 1.0, def: 1.0, luk: 1.0 },
            Elite: { hp: 1.8, atk: 1.4, def: 1.3, luk: 1.5 },
            Boss: { hp: 3.0, atk: 2.0, def: 2.0, luk: 2.0 }
        };

        const mod = typeModifiers[type] || typeModifiers.Normal;
        return {
            level,
            type,
            currentHp: Math.floor(baseStats.hp * mod.hp),
            maxHp: Math.floor(baseStats.hp * mod.hp),
            atk: Math.floor(baseStats.atk * mod.atk),
            def: Math.floor(baseStats.def * mod.def),
            luk: Math.floor(baseStats.luk * mod.luk)
        };
    };

    // 2. CORE MECHANICS
    const rollD6 = () => Math.floor(Math.random() * 6) + 1;
    const rollD100 = () => Math.floor(Math.random() * 100) + 1;

    const calculateDamage = (attacker, defender) => {
        const diceRoll = rollD6();
        if (diceRoll === 1) return { damage: 0, isMiss: true, isCrit: false };
        if (diceRoll === 6) {
            // FIXED: Math.max(0, ...) prevents high DEF from increasing crit damage taken
            const baseDamage = Math.max(0, attacker.atk - defender.def);
            const lukBonus = Math.max(2, Math.floor(attacker.luk * 0.5));
            return { damage: baseDamage + 6 + lukBonus, isMiss: false, isCrit: true };
        }
        const totalDamage = Math.max(1, attacker.atk - defender.def + Math.floor(diceRoll / 2));
        return { damage: totalDamage, isMiss: false, isCrit: false };
    };

    // FIXED: Contested flee roll so LUK >= 6 isn't automatic 100% escape
    const attemptFlee = (playerLuk, maxEnemyLuk) => {
        const playerRoll = rollD6() + Math.floor(playerLuk / 4);
        const enemyRoll = rollD6() + Math.floor(maxEnemyLuk / 4);
        return playerRoll >= enemyRoll;
    };

    // AGNOSTIC RNG LOOT ROLLER (Prevents LLM "convenient plot loot")
    const rollLootDrop = (level, type, playerLuk) => {
        const roll = Math.min(100, rollD100() + Math.min(10, Math.floor(playerLuk / 3)));
        const typeBonus = { Trash: -15, Normal: 0, Elite: 20, Boss: 40 }[type] || 0;
        const finalRoll = roll + typeBonus;

        if (finalRoll < 55) return `Material/Trash Only (Roll: ${finalRoll})`;

        const slots = ['Weapon', 'Light Armor', 'Heavy Armor', 'Accessory/Ring', 'Amulet/Neck', 'Belt/Utility', 'Consumable'];
        const stats = ['+HP', '+ATK', '+DEF', '+LUK', '+Speed/Stamina'];
        const slot = slots[Math.floor(Math.random() * slots.length)];
        const stat = stats[Math.floor(Math.random() * stats.length)];
        const statValue = Math.max(1, Math.floor(level * 0.8) + (finalRoll >= 95 ? 3 : finalRoll >= 80 ? 1 : 0));

        if (finalRoll >= 98) return `[RARE DROP] Lv.${level} ${slot} (${stat} +${statValue * 2}) (Roll: ${finalRoll})`;
        if (finalRoll >= 82) return `[UNCOMMON DROP] Lv.${level} ${slot} (${stat} +${statValue}) (Roll: ${finalRoll})`;
        return `[COMMON DROP] Lv.${level} ${slot} (${stat} +${Math.max(1, Math.floor(statValue * 0.7))}) (Roll: ${finalRoll})`;
    };

    // 3. COMBAT ENGINE
    /**
     * Run VR combat simulation
     * @param {Object} player Player stats
     * @param {Array} enemies Array of enemy groups
     * @returns {Promise<string>} Combat result log
     */
    const runCombat = (player, enemies) => {
        const combatLog = [];
        let playerHp = player.hp;
        const potionHeal = player.potionHeal || 15;
        const regenTick = player.regen || 0;
        let round = 1;
        let fled = false;
        let victory = false;

        // Create mob instances
        const mobGroups = enemies.map((group, groupId) => ({
            id: groupId + 1,
            type: group.type,
            level: group.level,
            mobs: Array.from({ length: group.count }, () => ({
                ...createMob(group.level, group.type),
                groupId: groupId + 1
            }))
        }));

        const allMobs = mobGroups.flatMap(g => g.mobs);

        // Safety cap at 30 rounds to prevent infinite tank stalemates
        while (playerHp > 0 && !fled && !victory && round <= 30) {
            combatLog.push(`--- ROUND ${round} ---`);

            const livingMobs = allMobs.filter(m => m.currentHp > 0);
            if (livingMobs.length === 0) {
                victory = true;
                break;
            }

            // Player turn: Auto-potion at <= 25% HP (consumes turn)
            if (playerHp <= Math.floor(player.maxHp * 0.25) && player.potions > 0) {
                player.potions--;
                playerHp = Math.min(player.maxHp, playerHp + potionHeal);
                combatLog.push(`💊 Potion used! +${potionHeal} HP (HP: ${playerHp}/${player.maxHp} | ${player.potions} belt potions left)`);
            } else if (playerHp <= Math.floor(player.maxHp * 0.25)) {
                const maxEnemyLuk = Math.max(...livingMobs.map(m => m.luk));
                combatLog.push(`🏃 HP Critical (${playerHp}/${player.maxHp}) & Belt Empty! Attempting flee...`);
                if (attemptFlee(player.luk, maxEnemyLuk)) {
                    combatLog.push(`✅ Escaped successfully!`);
                    fled = true;
                    break;
                }
                combatLog.push(`❌ Escape failed!`);
            } else {
                const target = livingMobs[0];
                const { damage, isMiss, isCrit } = calculateDamage(player, target);
                if (isMiss) {
                    combatLog.push(`❌ Attack missed Group ${target.groupId} (${target.type})!`);
                } else {
                    target.currentHp = Math.max(0, target.currentHp - damage);
                    combatLog.push(`🗡️ Hit Group ${target.groupId} (${target.type}): ${damage} dmg (Mob HP: ${target.currentHp}/${target.maxHp})${isCrit ? ' ✨CRIT!' : ''}`);
                    if (target.currentHp <= 0) combatLog.push(`☠️ Mob in Group ${target.groupId} defeated!`);
                }
            }

            // Enemy turn
            let enemyDamage = 0;
            allMobs.filter(m => m.currentHp > 0).forEach(mob => {
                const { damage, isMiss, isCrit } = calculateDamage(mob, player);
                if (isMiss) {
                    combatLog.push(`🛡️ Dodged/Blocked Group ${mob.groupId} attack!`);
                } else {
                    enemyDamage += damage;
                    combatLog.push(`🪓 Group ${mob.groupId} hits for ${damage} dmg${isCrit ? ' ⚠️CRIT!' : ''}`);
                }
            });

            playerHp = Math.max(0, playerHp - enemyDamage);
            if (enemyDamage > 0) combatLog.push(`💥 Total damage taken: ${enemyDamage} (Player HP: ${playerHp}/${player.maxHp})`);

            // Optional Regen Tick (defaults to 0 if character has no regen)
            if (regenTick > 0 && playerHp > 0 && playerHp < player.maxHp) {
                playerHp = Math.min(player.maxHp, playerHp + regenTick);
                combatLog.push(`💚 Regen: +${regenTick} HP (HP: ${playerHp}/${player.maxHp})`);
            }

            victory = allMobs.every(m => m.currentHp <= 0);
            round++;
        }

        // Result calculation
        let xpChange = 0;
        let goldChange = 0;
        const lootDrops = [];

        if (victory) {
            mobGroups.forEach(group => {
                const baseXP = 25 * group.level;
                const multiplier = { Trash: 0.6, Normal: 1.0, Elite: 1.8, Boss: 5.0 }[group.type] || 1.0;
                xpChange += Math.floor(baseXP * multiplier * group.mobs.length);
                goldChange += Math.floor((3 + Math.random() * 6) * group.level * group.mobs.length);
                lootDrops.push(rollLootDrop(group.level, group.type, player.luk));
            });
            combatLog.push(`🎉 VICTORY! Earned ${xpChange} XP and ${goldChange} currency | Final HP: ${playerHp}/${player.maxHp} | Belt Potions Left: ${player.potions}`);
            combatLog.push(`🎁 RNG LOOT SEED: ${lootDrops.join(' | ')}`);
        } else if (playerHp <= 0) {
            combatLog.push(`💀 DEFEAT! | Final HP: 0/${player.maxHp} | Belt Potions Left: ${player.potions}`);
        } else if (fled) {
            combatLog.push(`🏃 RETREAT! | Final HP: ${playerHp}/${player.maxHp} | Belt Potions Left: ${player.potions}`);
        } else {
            combatLog.push(`⏱️ STALEMATE (30 Rounds Reached)! | Final HP: ${playerHp}/${player.maxHp} | Belt Potions Left: ${player.potions}`);
        }

        return Promise.resolve(combatLog.join('\n'));
    };

    return { runCombat };
})();

// ============== TOOL REGISTRATION ==============
function registerCombatTool() {
    try {
        const context = getContext();
        if (!context || !context.registerFunctionTool) {
            console.debug('VrCombat: Function tools are not supported');
            return;
        }

        const combatSchema = Object.freeze({
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                player: {
                    type: 'object',
                    properties: {
                        level: { type: 'integer' },
                        hp: { type: 'integer' },
                        maxHp: { type: 'integer' },
                        atk: { type: 'integer' },
                        def: { type: 'integer' },
                        luk: { type: 'integer' },
                        potions: { type: 'integer', description: 'Potions currently slotted in quick-belt (max 4 on starter belt)' },
                        potionHeal: { type: 'integer', description: 'HP restored per potion (default 15 for basic)' },
                        regen: { type: 'integer', description: 'Optional HP regenerated per round (default 0)' }
                    },
                    required: ['level', 'hp', 'maxHp', 'atk', 'def', 'luk', 'potions']
                },
                enemies: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            count: { type: 'integer', minimum: 1, maximum: 5 },
                            level: { type: 'integer', minimum: 1, maximum: 50 },
                            type: {
                                type: 'string',
                                enum: ['Trash', 'Normal', 'Elite', 'Boss']
                            }
                        },
                        required: ['count', 'level', 'type']
                    }
                }
            },
            required: ['player', 'enemies']
        });

        context.registerFunctionTool({
            name: 'vrCombat',
            displayName: 'VrCombat',
            description: 'VrCombat is a tool to simulate combat. Call this whenever combat occurs.',
            parameters: combatSchema,
            action: async (args) => {
                const result = await VrCombat.runCombat(args.player, args.enemies);
                return result;
            },
            formatMessage: () => '',
            stealth: false
        });
        console.log('VR Combat Simulator tool registered successfully');
    } catch (error) {
        console.error('VR Combat Simulator: Error registering function tools', error);
    }
}

jQuery(function () {
    registerCombatTool();
});
