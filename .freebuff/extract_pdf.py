import re, zlib, base64

p = r"C:\Users\User\Downloads\Telegram Desktop\brivia brand_colour_palette(1).pdf"
data = open(p, "rb").read()

i = data.find(b"7 0 obj")
j = data.find(b"stream", i)
start = j + len(b"stream")
while data[start] in (10, 13):
    start += 1
end = data.find(b"endstream", start)
raw = data[start:end].strip()
d = zlib.decompress(base64.a85decode(raw, adobe=True))
txt = d.decode("latin1")

# print raw operators of interest
for line in txt.splitlines():
    if "Tj" in line or "TJ" in line or "rg" in line or "RG" in line or "re" in line:
        print(line)
