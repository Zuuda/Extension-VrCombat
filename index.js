import { getContext } from '../../../extensions.js';

// Define module name
export const MODULE_NAME = 'vrCombatSimulator';

// ============== COMBAT ENGINE START ==============
const VRCombatSimulator = (() => {
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

        const mod = typeModifiers[type];
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

    const calculateDamage = (attacker, defender) => {
        const diceRoll = rollD6();
        if (diceRoll === 1) return { damage: 0, isMiss: true, isCrit: false };
        if (diceRoll === 6) {
            const baseDamage = Math.abs(attacker.atk - defender.def);
            return { damage: baseDamage + 6 + attacker.luk, isMiss: false, isCrit: true };
        }
        const totalDamage = Math.max(0, attacker.atk - defender.def + diceRoll);
        return { damage: totalDamage, isMiss: false, isCrit: false };
    };

    const getWoundSeverity = (damage, maxHealth) => {
        const pct = (damage / maxHealth) * 100;
        if (pct <= 10) return "Glancing Blow";
        if (pct <= 25) return "Moderate Wound";
        if (pct <= 50) return "Severe Injury";
        if (pct <= 75) return "Critical Trauma";
        return "Lethal Blow";
    };

    const attemptFlee = luk => rollD6() >= (6 - luk);

    // 3. COMBAT ENGINE
    const runCombat = (player, enemies, targetStrategy = 'random') => {
        // Initialize combat state
        const combatLog = [];
        let playerHp = player.hp;
        let round = 1;
        let fled = false;
        let victory = false;

        // Create mob instances
        const mobGroups = enemies.map((group, groupId) => ({
            id: groupId + 1,
            mobs: Array.from({ length: group.count }, () => ({
                ...createMob(group.level, group.type),
                groupId: groupId + 1
            }))
        }));

        // Flatten all mobs for targeting
        const allMobs = mobGroups.flatMap(g => g.mobs);

        // Main combat loop
        while (playerHp > 0 && !fled && !victory) {
            combatLog.push(`--- ROUND ${round} ---`);

            // Player turn
            if (playerHp <= player.maxHp * 0.2 && player.potions > 0) {
                player.potions--;
                playerHp = Math.min(player.maxHp, playerHp + 15);
                combatLog.push(`💊 Potion used! +15 HP (${player.potions} left)`);
            } else if (playerHp <= player.maxHp * 0.2) {
                combatLog.push(`🏃 Flee attempt...`);
                if (fled = attemptFlee(player.luk)) {
                    combatLog.push(`✅ Escaped successfully!`);
                    break;
                }
                combatLog.push(`❌ Escape failed!`);
            } else {
                // Select target
                const target = allMobs.find(m => m.currentHp > 0) || null;
                if (!target) break;

                // Attack sequence
                const { damage, isMiss, isCrit } = calculateDamage(player, target);
                if (isMiss) {
                    combatLog.push(`❌ Attack missed Group ${target.groupId}!`);
                } else {
                    target.currentHp = Math.max(0, target.currentHp - damage);
                    const severity = getWoundSeverity(damage, target.maxHp);
                    combatLog.push(`🗡️ Hit Group ${target.groupId}: ${damage} dmg (${severity})`);
                    if (isCrit) combatLog.push(`✨ CRITICAL!`);
                    if (target.currentHp <= 0) combatLog.push(`☠️ Group ${target.groupId} defeated`);
                }
            }

            // Enemy turn
            let enemyDamage = 0;
            allMobs.filter(m => m.currentHp > 0).forEach(mob => {
                const { damage } = calculateDamage(mob, player);
                enemyDamage += damage;
                combatLog.push(`🪓 Group ${mob.groupId} attacks: ${damage} dmg`);
            });
            playerHp = Math.max(0, playerHp - enemyDamage);
            if (enemyDamage > 0) combatLog.push(`💥 Total damage taken: ${enemyDamage}`);

            // End check
            victory = allMobs.every(m => m.currentHp <= 0);
            round++;
        }

        // Result calculation
        let xpChange = 0;
        let goldChange = 0;

        if (victory) {
            mobGroups.forEach(group => {
                const baseXP = 25 * group.mobs[0].level;
                const multiplier = { Trash: 0.6, Normal: 1.0, Elite: 1.8, Boss: 5.0 }[group.mobs[0].type];
                xpChange += Math.floor(baseXP * multiplier * group.mobs.length);
                goldChange += Math.floor((5 + Math.random() * 10) * group.mobs[0].level * group.mobs.length);
            });
            combatLog.push(`🎉 VICTORY! Earned ${xpChange} XP and ${goldChange} silver`);
        } else if (playerHp <= 0) {
            xpChange = -Math.floor(player.xp * 0.1);
            goldChange = -Math.floor(player.gold * 0.1);
            combatLog.push(`💀 DEFEAT! Lost ${-xpChange} XP and ${-goldChange} silver`);
        } else if (fled) {
            xpChange = -Math.floor(player.xp * 0.05);
            goldChange = -Math.floor(player.gold * 0.05);
            combatLog.push(`🏃 RETREAT! Lost ${-xpChange} XP and ${-goldChange} silver`);
        }

        return {
            log: combatLog.join('\n'),
            player: {
                ...player,
                hp: playerHp,
                xp: player.xp + xpChange,
                gold: player.gold + goldChange
            },
            victory,
            fled
        };
    };

    return { runCombat };
})();

// ============== TOOL REGISTRATION ==============
function registerCombatTool() {
    try {
        const context = getContext();
        if (!context || !context.registerFunctionTool) {
            console.debug('VR Combat Simulator: Function tools are not supported');
            return;
        }

        context.registerFunctionTool({
            name: "vrCombatSimulator",
            displayName: "VR Combat Simulator",
            description: "Run VR combat simulation using Lukkeh's formulas",
            parameters: {
                $schema: "http://json-schema.org/draft-04/schema#",
                type: "object",
                properties: {
                    player: {
                        type: "object",
                        properties: {
                            level: { type: "integer" },
                            hp: { type: "integer" },
                            maxHp: { type: "integer" },
                            atk: { type: "integer" },
                            def: { type: "integer" },
                            luk: { type: "integer" },
                            gold: { type: "integer" },
                            potions: { type: "integer" },
                            xp: { type: "integer" }
                        },
                        required: ["level", "hp", "maxHp", "atk", "def", "luk"]
                    },
                    enemies: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                count: { type: "integer", minimum: 1, maximum: 5 },
                                level: { type: "integer", minimum: 1, maximum: 50 },
                                type: {
                                    type: "string",
                                    enum: ["Trash", "Normal", "Elite", "Boss"]
                                }
                            },
                            required: ["count", "level", "type"]
                        }
                    }
                },
                required: ["player", "enemies"]
            },
            action: async ({ player, enemies }) => {
                return VRCombatSimulator.runCombat(player, enemies);
            },
            formatMessage: () => '',
        });
        console.log('VR Combat Simulator registered successfully');
    } catch (error) {
        console.error('VR Combat Simulator: Error registering function tools', error);
    }
}

// Wait for SillyTavern to fully initialize
setTimeout(() => {
    if (window.getContext) {
        registerCombatTool();
    } else {
        console.error('VR Combat Simulator: SillyTavern context not available');
    }
}, 1000);
