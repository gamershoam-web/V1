// WYRMFALL — Heart Crystal use. The rules (cap, sounds, health) live in the
// datapack function wyrmfall:hearts/use_crystal so they stay in one place.

ItemEvents.rightClicked('kubejs:heart_crystal', event => {
  event.server.runCommandSilent(`execute as ${event.player.username} at @s run function wyrmfall:hearts/use_crystal`)
  event.cancel()
})
