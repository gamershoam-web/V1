"""Downloads the first N drawings of each class from the public Quick, Draw! dataset (CC BY 4.0) via HTTP range requests."""
import sys, os, ast, urllib.request, urllib.parse, concurrent.futures, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from classes import CLASSES

N = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
BASE = "https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap/"

def fetch(name):
    path = os.path.join(OUT, name.replace(" ", "_") + ".npy")
    if os.path.exists(path):
        return name, "cached"
    url = BASE + urllib.parse.quote(name) + ".npy"
    head = urllib.request.urlopen(urllib.request.Request(url, headers={"Range": "bytes=0-255"})).read()
    hlen = int.from_bytes(head[8:10], "little")
    offset = 10 + hlen
    header = ast.literal_eval(head[10:offset].decode("latin1"))
    total = header["shape"][0]
    n = min(N, total)
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"Range": f"bytes={offset}-{offset + n * 784 - 1}"})).read()
    arr = np.frombuffer(data, dtype=np.uint8).reshape(n, 28, 28)
    np.save(path, arr)
    return name, n

with concurrent.futures.ThreadPoolExecutor(12) as ex:
    for name, n in ex.map(fetch, CLASSES):
        print(name, n, flush=True)
