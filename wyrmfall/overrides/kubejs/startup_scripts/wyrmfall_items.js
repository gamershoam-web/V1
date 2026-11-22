// WYRMFALL — custom items.
// Heart Shards drop from monsters; four of them around a golden apple make a
// Heart Crystal, which permanently grows your max health by one heart.

StartupEvents.registry('item', event => {
  event.create('heart_shard')
    .displayName('Heart Shard')
    .rarity('rare')
    .maxStackSize(64)
    .tooltip('§7Torn from the corpse of a monster.')
    .tooltip('§8Four of them, bound by a golden apple, become a Heart Crystal.')

  event.create('heart_crystal')
    .displayName('Heart Crystal')
    .rarity('epic')
    .glow(true)
    .maxStackSize(16)
    .tooltip('§cRight-click to grow a new heart.')
    .tooltip('§8You start with 6 hearts. You can grow to 20.')
    .tooltip('§8Each death withers one heart away.')
})
