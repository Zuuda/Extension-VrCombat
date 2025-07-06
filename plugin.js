// vrCombatPlugin.js
console.log("[CombatPlugin] Loading VR Combat Simulator...");

// 1. Wait for SillyTavern to be fully loaded
if (window.SillyTavern) {
    initPlugin();
} else {
    window.addEventListener('sillytavern-load-complete', initPlugin);
}

function initPlugin() {
    console.log("[CombatPlugin] Initializing...");
    const ctx = SillyTavern.getContext();

    if (!ctx) {
        console.error("[CombatPlugin] Failed to get context");
        return;
    }

    // 2. Check function calling support
    if (!ctx.isToolCallingSupported?.()) {
        console.warn("[CombatPlugin] Function calling not supported");
        return;
    }

    // 3. Define combat engine (your exact formulas)
    const VRCombatSimulator = {
        createMob: (level, type) => {
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
        },
        runCombat: (player, enemies) => {
            // [Your full combat logic here - same as before]
            // Return combat result object
        }
    };

    // 4. Register the tool with error handling
    try {
        ctx.registerFunctionTool({
            name: "vrCombatSimulator",
            description: "Run VR combat simulation",
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
                                type: { type: "string", enum: ["Trash", "Normal", "Elite", "Boss"] }
                            },
                            required: ["count", "level", "type"]
                        }
                    }
                },
                required: ["player", "enemies"]
            },
            action: async ({ player, enemies }) => {
                console.log("[CombatPlugin] Combat triggered");
                return VRCombatSimulator.runCombat(player, enemies);
            },
            stealth: true
        });
        console.log("[CombatPlugin] Tool registered successfully!");
    } catch (e) {
        console.error("[CombatPlugin] Registration failed:", e);
    }
}
