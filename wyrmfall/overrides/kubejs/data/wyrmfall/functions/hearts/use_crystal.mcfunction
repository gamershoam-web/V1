# Called as/at the player who right-clicked a Heart Crystal.
execute if score @s wf_hearts matches 14.. run tellraw @s {"text":"Your heart can hold no more power. (20 hearts is the limit)","color":"gray","italic":true}
execute if score @s wf_hearts matches ..13 run function wyrmfall:hearts/grant
