# Runs every second: welcome new players, apply the death penalty, set max health.
execute as @a unless score @s wf_hearts matches -2147483648..2147483647 run function wyrmfall:hearts/first_join
execute as @a[scores={wf_deaths=1..}] run function wyrmfall:hearts/on_death
function wyrmfall:hearts/apply
schedule function wyrmfall:hearts/sync 20t replace
