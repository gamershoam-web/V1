give @s kubejs:heart_crystal 1
playsound minecraft:ui.toast.challenge_complete player @s ~ ~ ~ 1 0.8
tellraw @s [{"text":"✦ ","color":"gold"},{"text":"The beast's heart is yours. ","color":"gold","bold":true},{"text":"+1 Heart Crystal","color":"red"}]
advancement revoke @s only wyrmfall:boss_heart
