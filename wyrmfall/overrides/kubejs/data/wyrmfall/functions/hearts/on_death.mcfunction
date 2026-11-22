# Each death withers one earned heart away (never below the starting 6).
execute if score @s wf_hearts matches 1.. run tellraw @s [{"text":"☠ ","color":"dark_red"},{"text":"Death takes its toll. One of your hearts has withered.","color":"red","italic":true}]
execute if score @s wf_hearts matches 1.. run scoreboard players remove @s wf_hearts 1
scoreboard players set @s wf_deaths 0
