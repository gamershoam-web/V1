clear @s kubejs:heart_crystal 1
scoreboard players add @s wf_hearts 1
function wyrmfall:hearts/apply
effect give @s minecraft:regeneration 4 2 true
playsound minecraft:block.beacon.activate player @s ~ ~ ~ 1 1.6
playsound minecraft:entity.warden.heartbeat player @s ~ ~ ~ 1 0.8
particle minecraft:heart ~ ~1.2 ~ 0.5 0.5 0.5 0 12
particle minecraft:crimson_spore ~ ~1 ~ 0.6 0.8 0.6 0 60
tellraw @s [{"text":"❤ ","color":"red"},{"text":"A new heart beats within you. ","color":"gold"},{"text":"(","color":"dark_gray"},{"score":{"name":"@s","objective":"wf_hearts"},"color":"red"},{"text":"/14 crystals)","color":"dark_gray"}]
