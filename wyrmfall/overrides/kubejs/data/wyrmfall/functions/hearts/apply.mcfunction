# Max health = 6 hearts + 1 heart per Heart Crystal used (max 14 crystals = 20 hearts).
# Only the base value is set, so armor, trinkets and mods that add hearts still stack on top.
execute as @a[scores={wf_hearts=..-1}] run scoreboard players set @s wf_hearts 0
execute as @a[scores={wf_hearts=15..}] run scoreboard players set @s wf_hearts 14
execute as @a[scores={wf_hearts=0}] run attribute @s minecraft:generic.max_health base set 12
execute as @a[scores={wf_hearts=1}] run attribute @s minecraft:generic.max_health base set 14
execute as @a[scores={wf_hearts=2}] run attribute @s minecraft:generic.max_health base set 16
execute as @a[scores={wf_hearts=3}] run attribute @s minecraft:generic.max_health base set 18
execute as @a[scores={wf_hearts=4}] run attribute @s minecraft:generic.max_health base set 20
execute as @a[scores={wf_hearts=5}] run attribute @s minecraft:generic.max_health base set 22
execute as @a[scores={wf_hearts=6}] run attribute @s minecraft:generic.max_health base set 24
execute as @a[scores={wf_hearts=7}] run attribute @s minecraft:generic.max_health base set 26
execute as @a[scores={wf_hearts=8}] run attribute @s minecraft:generic.max_health base set 28
execute as @a[scores={wf_hearts=9}] run attribute @s minecraft:generic.max_health base set 30
execute as @a[scores={wf_hearts=10}] run attribute @s minecraft:generic.max_health base set 32
execute as @a[scores={wf_hearts=11}] run attribute @s minecraft:generic.max_health base set 34
execute as @a[scores={wf_hearts=12}] run attribute @s minecraft:generic.max_health base set 36
execute as @a[scores={wf_hearts=13}] run attribute @s minecraft:generic.max_health base set 38
execute as @a[scores={wf_hearts=14}] run attribute @s minecraft:generic.max_health base set 40
