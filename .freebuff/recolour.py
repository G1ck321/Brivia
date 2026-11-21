# Recolour legacy greens -> Brivia brand palette (navy #161b2f/#242f49, peach #ffa586, burgundy #541a2e/#b51a2b)
import re, pathlib, sys

HEX = {
    # --- dark greens -> navy ---
    "0e5f4d": "242f49",
    "0d5a49": "161b2f",
    "094b3d": "161b2f",
    "163b30": "161b2f",
    "173c31": "161b2f",
    "25483b": "161b2f",
    "0a3e33": "161b2f",
    "144235": "161b2f",
    "114437": "541a2e",
    "3d2e00": "541a2e",
    "795548": "161b2f",
    "5d4037": "161b2f",
    # --- status / semantic ---
    "315e46": "541a2e",
    "457138": "541a2e",
    "287153": "242f49",
    "4b8961": "242f49",
    "4f8a4a": "242f49",
    "4b8a60": "242f49",
    "99733e": "541a2e",
    "c62828": "b51a2b",
    "993934": "b51a2b",
    # --- amber / demo warnings -> peach + burgundy ---
    "f9a825": "ffa586",
    "e6a817": "ffa586",
    "fff8e1": "fff1ea",
    "fff9e6": "fff1ea",
    "fff9ec": "fff1ea",
    "e3d5a9": "ffd2c2",
    "75613c": "541a2e",
    "554221": "541a2e",
    # --- mid greens -> slate / secondary text ---
    "4a6b5e": "384358",
    "476459": "384358",
    "44665a": "384358",
    "3b6655": "384358",
    "47675a": "5b6478",
    "3f6758": "242f49",
    "346d54": "161b2f",
    "486d5c": "5b6478",
    "4c7b66": "5b6478",
    "4d7c66": "5b6478",
    "507061": "5b6478",
    "526f62": "5b6478",
    "5d776c": "5b6478",
    "61776c": "5b6478",
    "628073": "5b6478",
    "628074": "5b6478",
    "668073": "5b6478",
    "698176": "5b6478",
    "6a8077": "7b8398",
    "6d8178": "5b6478",
    "6d8278": "5b6478",
    "6e8278": "5b6478",
    "6e8b7c": "5b6478",
    "6c7738": "541a2e",
    "687c74": "5b6478",
    "70857b": "5b6478",
    "71857b": "5b6478",
    "72877c": "5b6478",
    "72877d": "5b6478",
    "748a7f": "5b6478",
    "789086": "5b6478",
    "7a8e84": "5b6478",
    "71624b": "5b6478",
    "81948b": "7b8398",
    "72867c": "7b8398",
    "779085": "7b8398",
    "779086": "7b8398",
    "80938a": "7b8398",
    "82938b": "7b8398",
    "84968d": "7b8398",
    "91a298": "7b8398",
    # --- light greens on dark -> light slate / peach ---
    "c7e4d5": "c9d1e3",
    "b9ddca": "c9d1e3",
    "cce4d7": "c9d1e3",
    "cce6d9": "c9d1e3",
    "c8e1d5": "c9d1e3",
    "d5ebde": "c9d1e3",
    "dff1e6": "cfd6e6",
    "e9f8f1": "ffd9cc",
    "f4fbf7": "eef2f8",
    "8fbfa9": "a9b3c9",
    "e0f0e8": "e9edf6",
    "eaf7ee": "e9edf6",
    # --- lime / chartreuse -> peach ---
    "e5f39a": "ffa586",
    "e3f19b": "ffa586",
    "e4f19a": "ffa586",
    "e6f39d": "ffa586",
    "8ece6a": "ffa586",
    "edf5c6": "ffe9e0",
    "eef3c6": "ffe9e0",
    "c7dfc7": "ffc9b8",
    # --- light green surfaces -> warm neutrals ---
    "e7f2dc": "ffe9e0",
    "e2f0e8": "ffe9e0",
    "dcefe4": "ffe9e0",
    "dcebe0": "ffe9e0",
    "dcf0e4": "ffe4d8",
    "e3efe5": "ffe9e0",
    "edf7ef": "fff1ea",
    "edf6ee": "fdf3ef",
    "e4f0e6": "ffe9e0",
    "e4efe6": "f3ece7",
    "e4eee6": "eef0f5",
    "e7f0de": "ffe9e0",
    "d3e3cc": "ffd2c2",
    "f6e7d1": "ffe9e0",
    "f5f8f1": "fdf3ef",
    "f5eee0": "eef0f5",
    "f4f6ef": "fff8f5",
    "f4f6f3": "f6f1ee",
    "f4f9f4": "fbf6f3",
    "f0f2ed": "f5f0ec",
    "f0f5ef": "f7f1ed",
    "f0f7f2": "fff3ee",
    "eff5f0": "f7f0ec",
    "eff7f1": "fdf3ef",
    "f1f6ef": "fdf6f2",
    "e8ede2": "f1e9e4",
    "edf1eb": "f1e9e4",
    "e7eee8": "f3ebe6",
    "e7eee7": "f3ebe6",
    "e7eee9": "f3ebe6",
    "dde8df": "efe1db",
    "dbe7dd": "ece2dd",
    "d8e4da": "d9dce5",
    "fcfdfb": "fffaf8",
    "f0d0d0": "f6dde1",
    "fde8e8": "fbe7ea",
    "fff0ef": "fdf0f1",
    "cbdacf": "d9dce5",
    "79ae8c": "ffa586",
    "72a894": "242f49",
    "8b5c26": "541a2e",
    "59732e": "541a2e",
    "376555": "541a2e",
}

RGB = {
    (14, 95, 77): (36, 47, 73),
    (12, 79, 63): (22, 27, 47),
    (27, 68, 52): (22, 27, 47),
    (7, 37, 29): (13, 17, 34),
    (5, 42, 33): (22, 27, 47),
    (37, 73, 58): (22, 27, 47),
    (29, 65, 52): (22, 27, 47),
    (28, 65, 51): (22, 27, 47),
    (215, 228, 219): (217, 220, 229),
    (247, 252, 247): (255, 248, 245),
    (245, 255, 249): (255, 255, 255),
    (244, 246, 239): (255, 248, 245),
    (236, 255, 245): (255, 255, 255),
    (233, 255, 246): (255, 255, 255),
    (232, 255, 244): (255, 255, 255),
    (229, 243, 154): (255, 165, 134),
    (228, 240, 230): (255, 233, 224),
    (227, 255, 240): (255, 197, 176),
    (226, 245, 235): (255, 255, 255),
    (142, 206, 106): (255, 165, 134),
    (114, 168, 148): (36, 47, 73),
}

RGBA_RE = re.compile(r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\.?\d*\.?\d+)\s*\)")

changed = {"rgba": 0}


def rgba_sub(m):
    key = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    new = RGB.get(key)
    if not new:
        return m.group(0)
    changed["rgba"] += 1
    alpha = m.group(4)
    if alpha.startswith("."):
        alpha = "0" + alpha
    return f"rgba({new[0]},{new[1]},{new[2]},{alpha})"

files = [pathlib.Path("brivia/app/globals.css")]
files += [
    p
    for p in pathlib.Path("brivia").rglob("*.tsx")
    if not any(seg in ("node_modules", ".next") for seg in p.parts)
]

total = {}
for f in files:
    with open(f, encoding="utf-8", newline="") as fh:
        text = fh.read()
    orig = text
    for k, v in HEX.items():
        pat = re.compile("#" + k, re.I)
        text, n = pat.subn("#" + v, text)
        if n:
            total[k] = total.get(k, 0) + n
    before = changed["rgba"]
    text = RGBA_RE.sub(rgba_sub, text)
    n = changed["rgba"] - before
    if n:
        total["rgba(legacy greens)"] = total.get("rgba(legacy greens)", 0) + n
    if text != orig:
        with open(f, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print("updated", f)

print("\nreplacement counts:")
for k, v in sorted(total.items(), key=lambda x: -x[1]):
    print(f"  {v:4d}  {k}")
print("TOTAL", sum(total.values()))
