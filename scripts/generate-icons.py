#!/usr/bin/env python3
"""Render an original small product symbol without external raster dependencies."""
import math
import struct
import zlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NAVY=(16,28,50,255);WHITE=(255,255,255,255);CORAL=(234,110,70,255)
def distance(x,y,a,b):
    dx=b[0]-a[0];dy=b[1]-a[1]
    t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)
def color(x,y):
    if math.hypot(max(20-x,0,x-108),max(20-y,0,y-108))>20:return (0,0,0,0)
    c=NAVY
    outline=[((30,18),(83,18)),((83,18),(101,36)),((101,36),(101,108)),((101,108),(30,108)),((30,108),(30,18))]
    if min(distance(x,y,a,b) for a,b in outline)<3.5:c=WHITE
    if min(distance(x,y,(45,66),(59,80)),distance(x,y,(59,80),(88,49)))<5:c=CORAL
    return c
def chunk(t,data):return struct.pack('>I',len(data))+t+data+struct.pack('>I',zlib.crc32(t+data)&0xffffffff)
for size in [16,32,48,128]:
    raw=bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            def sample(sx,sy):
                px=x+(sx+.5)/3;py=y+(sy+.5)/3
                if size==128:
                    if not (16<=px<112 and 16<=py<112):return (0,0,0,0)
                    return color((px-16)*128/96,(py-16)*128/96)
                return color(px*128/size,py*128/size)
            colors=[sample(sx,sy) for sx in range(3) for sy in range(3)]
            raw.extend(round(sum(c[i] for c in colors)/9) for i in range(4))
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(raw),9))+chunk(b'IEND',b'')
    p=ROOT/f'assets/icons/icon-{size}.png';p.parent.mkdir(exist_ok=True,parents=True);p.write_bytes(data)
print('Rendered 16/32/48/128px original product icon drafts.')
