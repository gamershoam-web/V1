// WYRMFALL — recipes.

ServerEvents.recipes(event => {
  event.shaped('kubejs:heart_crystal', [
    ' S ',
    'SAS',
    ' S '
  ], {
    S: 'kubejs:heart_shard',
    A: 'minecraft:golden_apple'
  }).id('wyrmfall:heart_crystal')
})
