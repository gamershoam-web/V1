# WYRMFALL — runs on world load and /reload.
scoreboard objectives add wf_hearts dummy {"text":"Heart Crystals","color":"red"}
scoreboard objectives add wf_deaths deathCount
# WYRMFALL is balanced for Hard. Delete this line to choose your own difficulty.
difficulty hard
schedule function wyrmfall:hearts/sync 20t replace
