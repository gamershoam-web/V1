package com.aidraw.ability;

/** Building blocks Claude combines into an item's powers. Strength is always 1-10. */
public enum AbilityType {
    EXPLOSION("Explosion", 1.5),
    NUKE("Nuclear blast", 30),
    LIGHTNING("Lightning storm", 1.5),
    FIRE("Firestorm", 1),
    SHOOT_ARROW("Bullets", 0.25),
    SHOOT_FIREBALL("Fireball", 1),
    BEAM("Laser beam", 0.75),
    METEOR_SHOWER("Meteor shower", 8),
    SHOCKWAVE("Shockwave", 2),
    DASH("Dash", 0.75),
    LAUNCH_UP("Super jump", 1),
    TELEPORT("Teleport", 1),
    FLY("Flight", 0),
    FREEZE("Freeze", 2),
    BLACK_HOLE("Black hole", 8),
    SUMMON("Summon", 10),
    HEAL("Heal", 5),
    EFFECT_SELF("Self power", 5),
    EFFECT_AREA("Curse area", 3),
    KNOCKBACK("Mega knockback", 0.5),
    LIFESTEAL("Lifesteal", 0);

    public final String label;
    /** Minimum cooldown in seconds when used via right-click, so nothing can be spammed. */
    public final double minCooldown;

    AbilityType(String label, double minCooldown) {
        this.label = label;
        this.minCooldown = minCooldown;
    }

    /** Heavy abilities only trigger on melee hits every few seconds. */
    public boolean heavy() {
        return this == NUKE || this == METEOR_SHOWER || this == BLACK_HOLE || this == SUMMON || this == EXPLOSION;
    }
}
