give @s kubejs:heart_crystal 2
playsound minecraft:ui.toast.challenge_complete player @s ~ ~ ~ 1 0.6
playsound minecraft:entity.ender_dragon.growl player @s ~ ~ ~ 0.6 1.4
title @s actionbar {"text":"✦ APEX SLAIN ✦","color":"gold","bold":true}
tellraw @s [{"text":"✦ ","color":"gold"},{"text":"An apex predator has fallen to you. ","color":"gold","bold":true},{"text":"+2 Heart Crystals","color":"red"}]
advancement revoke @s only wyrmfall:apex_heart
