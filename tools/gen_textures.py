"""Generates the 16x16 item textures for the mod."""
from PIL import Image
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "src/main/resources/assets/aidraw/textures/item")
PAL = {'.': None, 'k': (30,30,30), 'g': (90,90,95), 'l': (160,160,170), 'w': (240,240,240),
       'b': (120,80,40), 'd': (80,50,25), 'r': (210,40,40), 'o': (240,150,30), 'y': (250,220,60),
       'B': (50,110,220), 'c': (120,200,250), 'G': (60,170,60), 'p': (170,70,200), 'P': (240,140,200),
       'n': (230,190,140), 's': (200,200,210)}
ART = {
"painting_board": [
"................","..bbbbbbbbbbbb..","..bwwwwwwwwwwb..","..bwrrwwBBwwwb..","..bwrrwwBBwGwb..",
"..bwwwyywwwGwb..","..bwwwyywwwwwb..","..bwpwwwwoowwb..","..bwwwwwwoowwb..","..bwwwwwwwwwwb..",
"..bbbbbbbbbbbb..","....d......d....","...d........d...","...d........d...","..d..........d..","................"],
"drawn_gun": [
"................","................","................","...kkkkkkkkkkkk.","..kgggggggggglk.",
"..kgggggggggggk.","..kkkkkgkkkkkkk.","......kgkb......","......kgkbb.....",".....kgk.bb.....",
".....kgk........","....kggk........","....kkkk........","................","................","................"],
"drawn_plane": [
"................",".......kk.......","......kssk......","......kssk......","......kBBk......",
"..kkkkkssskkkk..",".kssssssssssssk.","..kkkkkssskkkk..","......kssk......","......kssk......",
"......kssk......","....kkkssskk....","....kssssssk....",".....kkkkkk.....","................","................"],
"drawn_sword": [
"..............kk",".............kck","............kclk","...........kclk.","..........kclk..",
".........kclk...","........kclk....","...kk..kclk.....","...kykkclk......","....kyclk.......",
".....kyk........","....kdkyk.......","...kdk.kyk......","..kdk...kk......",".kkk............","................"],
"drawn_tool": [
"................","...kkkkkkkk.....","..kcccccccck....","..kkkkkdkkcck...","......kdk..kck..",
".....kdk...kck..","....kdk.....kk..","...kdk..........","..kdk...........",".kdk............",
".kk.............","................","................","................","................","................"],
"drawn_bomb": [
"..........y.....",".........oyo....","..........k.....",".........k......","......kkkk......",
"....kkggggkk....","...kgglggggk....","..kgglggggggk...","..kgglggggggk...","..kggggggggggk..",
"..kggggggggggk..","...kggggggggk...","....kggggggk....",".....kkkkkk.....","................","................"],
"drawn_wand": [
"............y...","...........yyy..","..........yyPyy.","...........yyy..","..........kby...",
".........kbk....","........kbk.....",".......kbk......","......kbk.......",".....kbk........",
"....kbk.........","...kbk..........","..kbk...........","..kk............","................","................"],
"drawn_food": [
"................",".......dG.......","......dGG.......","....kkdkkk......","...krrrrrrk.....",
"..krrwrrrrrk....","..krwrrrrrrk....","..krrrrrrrrk....","..krrrrrrrrk....","..krrrrrrrrk....",
"...krrrrrrk.....","....krkkrk......",".....k..k.......","................","................","................"],
"drawn_charm": [
"................","......kkkk......",".....k....k.....","......kkkk......",".......kk.......",
"......kppk......",".....kpPppk.....","....kpPppppk....","....kppppppk....","....kppppppk....",
".....kppppk.....","......kppk......",".......kk.......","................","................","................"],
}
os.makedirs(OUT, exist_ok=True)
for name, rows in ART.items():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == 16, (name, y, len(row))
        for x, ch in enumerate(row):
            c = PAL[ch]
            if c: img.putpixel((x, y), c + (255,))
    img.save(os.path.join(OUT, name + ".png"))
print("ok", len(ART))
