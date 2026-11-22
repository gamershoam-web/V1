package com.aidraw.ai;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Free mode, no API key needed: builds the item from the words the player typed in the hint box
 * ("atom bomb", "crazy fire sword", "fighter jet"...). Produces the same JSON shape Claude does.
 */
public final class OfflineDesigner {
    private record Recipe(String[] words, String category, String name, String desc, int damage,
                          double cooldown, boolean consumable, int count, String[] use, String[] hit, String[] passive) {}

    private static final List<Recipe> RECIPES = new ArrayList<>();

    private static void r(String words, String category, String name, String desc, int damage, double cooldown,
                          boolean consumable, int count, String use, String hit, String passive) {
        RECIPES.add(new Recipe(words.split(","), category, name, desc, damage, cooldown, consumable, count,
                split(use), split(hit), split(passive)));
    }

    private static String[] split(String s) { return s.isEmpty() ? new String[0] : s.split(","); }

    static {
        // words (comma separated)              category  name                  description                         dmg  cd   cons  n   use abilities (TYPE:str[:id])          hit abilities                    passive (effect:amp)
        r("atom,nuke,nuclear,hydrogen,tsar,a-bomb", "BOMB", "Atom Bomb", "Handle with extreme care.", 0, 30, true, 1, "NUKE:10", "", "");
        r("mini nuke,small nuke", "BOMB", "Mini Nuke", "A nuke, but fun-sized.", 0, 30, true, 2, "NUKE:5", "", "");
        r("bomb,tnt,dynamite,grenade,explosive,c4", "BOMB", "Boom Bomb", "Throw it at your problems.", 0, 2, true, 6, "EXPLOSION:6", "", "");
        r("missile,rocket launcher,bazooka,rpg", "GUN", "Rocket Launcher", "Fires explosive rockets.", 0, 2, false, 1, "SHOOT_FIREBALL:7,EXPLOSION:4", "", "");
        r("laser,ray gun,blaster,plasma", "GUN", "Laser Blaster", "Pew pew, but it really hurts.", 0, 0.5, false, 1, "BEAM:7", "", "");
        r("minigun,machine gun,gatling", "GUN", "Minigun", "Brrrrrrrrrt.", 0, 0.25, false, 1, "SHOOT_ARROW:9", "", "");
        r("shotgun", "GUN", "Shotgun", "Spray and pray.", 0, 1, false, 1, "SHOOT_ARROW:10", "", "");
        r("gun,pistol,rifle,sniper,revolver", "GUN", "Drawn Gun", "Point and click.", 0, 0.4, false, 1, "SHOOT_ARROW:6", "", "");
        r("bow,crossbow", "GUN", "Sky Bow", "Never runs out of arrows.", 0, 0.6, false, 1, "SHOOT_ARROW:5", "", "");
        r("fighter jet,jet fighter,war plane,warplane", "PLANE", "Fighter Jet", "Flies and shoots.", 0, 0.4, false, 1, "FLY:8,SHOOT_ARROW:6", "", "");
        r("plane,jet,airplane,aeroplane,helicopter,ufo,spaceship", "PLANE", "Paper Plane", "Hold right-click to fly.", 0, 1, false, 1, "FLY:7", "", "");
        r("rocket,spaceship", "PLANE", "Space Rocket", "To the moon!", 0, 1, false, 1, "FLY:10", "", "");
        r("wings,wing,broom,carpet,cape,jetpack", "PLANE", "Magic Wings", "Fly like a bird.", 0, 1, false, 1, "FLY:6", "", "slow_falling:0");
        r("dragon", "WAND", "Dragon Heart", "Breathe fire, rule the sky.", 0, 1, false, 1, "FLY:7,SHOOT_FIREBALL:7", "", "fire_resistance:0");
        r("hammer,thor,mjolnir", "SWORD", "Thunder Hammer", "Worthy hands only.", 16, 3, false, 1, "LIGHTNING:8,LAUNCH_UP:5", "LIGHTNING:3,KNOCKBACK:6", "strength:0");
        r("katana,ninja", "SWORD", "Shadow Katana", "Fast as the wind.", 14, 1, false, 1, "DASH:7", "LIFESTEAL:4", "speed:1");
        r("axe", "SWORD", "Battle Axe", "Chop chop.", 15, 2, false, 1, "SHOCKWAVE:5", "KNOCKBACK:4", "");
        r("sword,blade,saber,sabre,dagger,knife,spear", "SWORD", "Drawn Sword", "Sharp and shiny.", 12, 2, false, 1, "DASH:5", "KNOCKBACK:3", "");
        r("pickaxe,pick,drill,shovel", "TOOL", "Mega Drill", "Mines anything, fast.", 6, 1, false, 1, "", "", "haste:2");
        r("black hole,blackhole,void,vortex,portal", "WAND", "Void Orb", "It hungers.", 0, 8, false, 1, "BLACK_HOLE:8", "", "");
        r("meteor,asteroid,comet", "WAND", "Meteor Staff", "Calls the sky down.", 0, 8, false, 1, "METEOR_SHOWER:8", "", "");
        r("lightning,thunder,storm,zeus", "WAND", "Storm Staff", "Unlimited power!", 0, 1.5, false, 1, "LIGHTNING:7", "", "");
        r("fire,flame,lava,volcano,sun,phoenix", "WAND", "Flame Staff", "Everything burns.", 0, 1, false, 1, "SHOOT_FIREBALL:6,FIRE:5", "", "fire_resistance:0");
        r("ice,snow,frost,freeze,frozen,snowflake", "WAND", "Frost Staff", "Let it go.", 0, 2, false, 1, "FREEZE:8", "", "");
        r("tornado,wind,hurricane,earthquake", "WAND", "Storm Bringer", "Blows everything away.", 0, 2, false, 1, "SHOCKWAVE:9,LAUNCH_UP:4", "", "");
        r("wand,staff,magic,wizard,witch,orb", "WAND", "Magic Wand", "Abracadabra!", 0, 1, false, 1, "BEAM:6,TELEPORT:5", "", "");
        r("teleport,ender,pearl", "WAND", "Blink Stone", "Now you see me...", 0, 1, false, 1, "TELEPORT:8", "", "");
        r("shoe,shoes,boot,boots,sneaker,flash", "CHARM", "Speed Boots", "Gotta go fast.", 0, 1, false, 1, "DASH:6", "", "speed:2,jump_boost:1");
        r("spring,frog,kangaroo,trampoline", "CHARM", "Spring Charm", "Boing!", 0, 1, false, 1, "LAUNCH_UP:7", "", "jump_boost:2");
        r("heart,love,medic,doctor,bandage,first aid", "CHARM", "Healing Heart", "Feel better.", 0, 5, false, 1, "HEAL:8", "", "regeneration:0");
        r("shield,armor,armour,knight", "CHARM", "Guardian Shield", "Nothing gets through.", 0, 2, false, 1, "SHOCKWAVE:4", "", "resistance:2");
        r("crown,king,queen", "CHARM", "Royal Crown", "Bow before me.", 0, 5, false, 1, "SUMMON:6:minecraft:iron_golem", "", "strength:1,resistance:0");
        r("ghost,invisible,spy", "CHARM", "Ghost Cloak", "Boo.", 0, 1, false, 1, "", "", "invisibility:0");
        r("glasses,eye,goggles,camera", "CHARM", "Night Goggles", "See in the dark.", 0, 1, false, 1, "", "", "night_vision:0");
        r("fish,bubble,scuba,mermaid,submarine", "CHARM", "Scuba Charm", "Breathe underwater.", 0, 1, false, 1, "", "", "water_breathing:0,dolphins_grace:0");
        r("muscle,dumbbell,gym,hulk", "CHARM", "Hulk Fist", "SMASH!", 10, 2, false, 1, "SHOCKWAVE:7", "KNOCKBACK:8", "strength:2");
        r("clover,lucky,horseshoe,rainbow", "CHARM", "Lucky Clover", "Feeling lucky?", 0, 1, false, 1, "", "", "luck:2");
        r("dog,wolf,puppy", "CHARM", "Dog Whistle", "Who's a good boy?", 0, 10, false, 1, "SUMMON:9:minecraft:wolf", "", "");
        r("cat,kitten", "CHARM", "Cat Bell", "Meow.", 0, 10, false, 1, "SUMMON:6:minecraft:cat", "", "");
        r("golem,robot,mech", "CHARM", "Robot Remote", "Calls in the big guys.", 0, 10, false, 1, "SUMMON:9:minecraft:iron_golem", "", "");
        r("poison,skull,toxic,zombie", "WAND", "Toxic Skull", "Feeling sick?", 0, 3, false, 1, "EFFECT_AREA:7:minecraft:poison", "EFFECT_AREA:5:minecraft:wither", "");
        r("pizza,burger,hamburger,hotdog,hot dog,fries,taco,sandwich,donut,ice cream,candy,chocolate,soda,cola,noodles,sushi", "FOOD", "Tasty Snack", "Yum!", 0, 1, false, 6, "", "", "saturation:0");
        r("potion,energy drink,coffee", "FOOD", "Power Potion", "Drink up!", 0, 1, true, 3, "", "", "speed:1,strength:1,regeneration:0");
    }

    private static final String[] BOOSTERS = {"crazy", "ultimate", "god", "super", "mega", "epic", "insane", "legendary", "op", "infinity", "chaos", "giant", "huge"};

    /** Returns null when the hint is empty. */
    public static DrawingResult design(String hint) {
        String h = hint == null ? "" : hint.toLowerCase(Locale.ROOT).trim();
        if (h.isEmpty()) return null;
        String padded = " " + h.replaceAll("[^a-z0-9 -]", " ") + " ";
        int boost = 0;
        for (String b : BOOSTERS) if (padded.contains(" " + b + " ")) boost += 3;
        boost = Math.min(boost, 5);

        // Best recipe = the one whose matching keyword is longest ("fighter jet" beats "jet").
        Recipe best = null;
        int bestLen = 0;
        for (Recipe r : RECIPES) {
            for (String w : r.words) {
                String word = w.trim();
                if (word.length() > bestLen && (padded.contains(" " + word + " ") || padded.contains(" " + word + "s "))) {
                    best = r;
                    bestLen = word.length();
                }
            }
        }

        String name = title(hint.trim());
        if (best == null) {
            // Maybe it's a Minecraft mob or item by name ("pig", "diamond", "golden apple").
            String id = h.replaceAll("[^a-z0-9 _]", "").trim().replace(' ', '_');
            Identifier rl = Identifier.tryParse("minecraft:" + id);
            if (rl != null && BuiltInRegistries.ENTITY_TYPE.containsKey(rl)) return simple("MOB", name, "", rl.toString(), 1);
            if (rl != null && BuiltInRegistries.ITEM.containsKey(rl)) return simple("VANILLA_ITEM", name, rl.toString(), "", 8);
            if (id.endsWith("s")) {
                Identifier single = Identifier.tryParse("minecraft:" + id.substring(0, id.length() - 1));
                if (single != null && BuiltInRegistries.ITEM.containsKey(single)) return simple("VANILLA_ITEM", name, single.toString(), "", 8);
            }
            // Unknown thing: a lucky charm named after it.
            best = new Recipe(new String[0], "CHARM", name, "One of a kind.", 0, 1, false, 1, new String[]{"EFFECT_SELF:5:minecraft:luck"}, new String[0], new String[]{"luck:1"});
        }

        JsonObject o = new JsonObject();
        o.addProperty("category", best.category);
        o.addProperty("name", name.length() > 2 ? name : best.name);
        o.addProperty("description", best.desc);
        o.addProperty("vanilla_id", "");
        o.addProperty("mob_id", "");
        o.addProperty("count", best.count);
        o.addProperty("attack_damage", best.damage > 0 ? Math.min(30, best.damage + boost * 2) : 0);
        o.addProperty("cooldown_seconds", best.cooldown);
        o.addProperty("consumable", best.consumable);
        o.add("use_abilities", abilities(best.use, boost));
        JsonArray hit = abilities(best.hit, boost);
        if (boost > 0 && best.category.equals("SWORD")) {
            hit.add(ability("LIGHTNING", 2 + boost, ""));
            hit.add(ability("FIRE", 3 + boost, ""));
        }
        o.add("hit_abilities", hit);
        JsonArray passive = new JsonArray();
        for (String p : best.passive) {
            String[] parts = p.split(":");
            JsonObject j = new JsonObject();
            j.addProperty("effect_id", "minecraft:" + parts[0]);
            j.addProperty("amplifier", Math.min(4, Integer.parseInt(parts[1]) + (boost > 0 ? 1 : 0)));
            passive.add(j);
        }
        o.add("passive_effects", passive);
        return new DrawingResult(best.category, o.get("name").getAsString(), best.desc, "", "", best.count, o.get("attack_damage").getAsInt(), o);
    }

    private static JsonArray abilities(String[] list, int boost) {
        JsonArray arr = new JsonArray();
        for (String a : list) {
            String[] parts = a.split(":", 3);
            arr.add(ability(parts[0], Math.min(10, Integer.parseInt(parts[1]) + boost), parts.length > 2 ? parts[2] : ""));
        }
        return arr;
    }

    private static JsonObject ability(String type, int strength, String id) {
        JsonObject j = new JsonObject();
        j.addProperty("type", type);
        j.addProperty("strength", strength);
        boolean summon = type.equals("SUMMON");
        j.addProperty("effect_id", summon ? "" : id);
        j.addProperty("entity_id", summon ? id : "");
        return j;
    }

    private static DrawingResult simple(String category, String name, String vanillaId, String mobId, int count) {
        JsonObject o = new JsonObject();
        o.addProperty("category", category);
        return new DrawingResult(category, name, "", vanillaId, mobId, count, 0, o);
    }

    private static String title(String s) {
        StringBuilder b = new StringBuilder();
        for (String w : s.split("\\s+")) {
            if (w.isEmpty()) continue;
            if (b.length() > 0) b.append(' ');
            b.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return b.length() > 30 ? b.substring(0, 30) : b.toString();
    }

    private OfflineDesigner() {}
}
