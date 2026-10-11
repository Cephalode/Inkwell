#!/usr/bin/env python3
"""Trace quill v4 — final: full-length placement (stem dips into bottle),
slim filter, high-eps RDP clean lance, smoothed short rachis slit."""
import math, json
from collections import deque, defaultdict
from PIL import Image

im = Image.open('/tmp/quill-ref.jpg').convert('L').resize((512, 512), Image.LANCZOS)
px = im.load()
W = H = 512
INK = [[1 if px[x, y] < 110 else 0 for x in range(W)] for y in range(H)]

lbl = [[0]*W for _ in range(H)]; best = []
for y in range(H):
    for x in range(W):
        if INK[y][x] and not lbl[y][x]:
            q = deque([(x,y)]); lbl[y][x]=1; pts=[]
            while q:
                cx,cy=q.popleft(); pts.append((cx,cy))
                for nx,ny in ((cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1)):
                    if 0<=nx<W and 0<=ny<H and INK[ny][nx] and not lbl[ny][nx]:
                        lbl[ny][nx]=1; q.append((nx,ny))
            if len(pts)>len(best): best=pts
comp = set(best)
def is_ink(x, y): return (x, y) in comp

# boundary edges (ink right of travel), chain loops
edges = defaultdict(list)
for (x, y) in comp:
    if not is_ink(x, y-1): edges[(x, y)].append(((x+1, y), 'N'))
    if not is_ink(x, y+1): edges[(x+1, y+1)].append(((x, y+1), 'S'))
    if not is_ink(x-1, y): edges[(x, y+1)].append(((x, y), 'W'))
    if not is_ink(x+1, y): edges[(x+1, y)].append(((x+1, y+1), 'E'))
used = set(); loops = []
DIRV = {'N':(1,0),'S':(-1,0),'W':(0,-1),'E':(0,1)}
for start in list(edges.keys()):
    for (nxt, side) in edges[start]:
        if (start, nxt, side) in used: continue
        loop = [start, nxt]; used.add((start, nxt, side))
        cur, cur_side = nxt, side
        while cur != start:
            cands = [(a, s) for (a, s) in edges[cur] if (cur, a, s) not in used]
            if not cands: break
            def turn_key(t):
                a, s = t
                vi, vo = DIRV[cur_side], DIRV[s]
                cross = vi[0]*vo[1] - vi[1]*vo[0]
                dot = vi[0]*vo[0] + vi[1]*vo[1]
                return -cross if cross != 0 else (1 - dot)
            cands.sort(key=turn_key)
            a, s = cands[0]
            used.add((cur, a, s)); loop.append(a); cur, cur_side = a, s
        if len(loop) > 8 and cur == start: loops.append(loop[:-1])
outer = max(loops, key=len)

def rdp(pts, eps):
    if len(pts) < 3: return pts[:]
    x0,y0=pts[0]; x1,y1=pts[-1]
    dxl,dyl=x1-x0,y1-y0; ll=math.hypot(dxl,dyl)
    dmax,idx=-1.0,-1
    for i in range(1,len(pts)-1):
        d = math.hypot(pts[i][0]-x0,pts[i][1]-y0) if ll<1e-9 else abs(dyl*(pts[i][0]-x0)-dxl*(pts[i][1]-y0))/ll
        if d>dmax: dmax,idx=d,i
    if dmax>eps:
        a=rdp(pts[:idx+1],eps); b=rdp(pts[idx:],eps); return a[:-1]+b
    return [pts[0],pts[-1]]

outer_s = rdp(outer, 3.0)
def chaikin(pts, it=2):
    for _ in range(it):
        out=[]
        for i in range(len(pts)):
            a=pts[i]; b=pts[(i+1)%len(pts)]
            out.append((0.75*a[0]+0.25*b[0], 0.75*a[1]+0.25*b[1]))
            out.append((0.25*a[0]+0.75*b[0], 0.25*a[1]+0.75*b[1]))
        pts=out
    return pts
outer_smooth = chaikin(outer_s, 3)
print(f"outer: {len(outer)} -> {len(outer_s)} -> smooth {len(outer_smooth)}")

# ---- alignment: full feather length; stem end lands INSIDE the bottle ----
src_tip = min(comp, key=lambda p:(p[1],p[0]))
src_cal = max(comp, key=lambda p:(p[1],p[0]))
P=(52.5, 1.0)     # plume tip target
C=(40.5, 28.5)    # calamus end target (inside bottle body; mouth at y~19-22.5)
Ltar=math.hypot(C[0]-P[0], C[1]-P[1]); Lsrc=math.hypot(src_cal[0]-src_tip[0], src_cal[1]-src_tip[1])
s=Ltar/Lsrc
rot=math.atan2(C[1]-P[1], C[0]-P[0])-math.atan2(src_cal[1]-src_tip[1], src_cal[0]-src_tip[0])
cr,sr=math.cos(rot),math.sin(rot)
def base_xform(q):
    ax,ay=q[0]-src_tip[0], q[1]-src_tip[1]
    return (P[0]+(ax*cr-ay*sr)*s, P[1]+(ax*sr+ay*cr)*s)

# slim perpendicular to target axis by 0.90
ux,uy=(C[0]-P[0])/Ltar,(C[1]-P[1])/Ltar
nx,ny=-uy,ux
def xform(q):
    bx,by=base_xform(q)
    ax,ay=bx-P[0],by-P[1]
    proj=ax*ux+ay*uy; perp=ax*nx+ay*ny
    return (P[0]+ux*proj+nx*perp*0.90, P[1]+uy*proj+ny*perp*0.90)

out_svg=[xform(q) for q in outer_smooth]
xs=[q[0] for q in out_svg]; ys=[q[1] for q in out_svg]
print(f"placed bbox x[{min(xs):.1f},{max(xs):.1f}] y[{min(ys):.1f},{max(ys):.1f}]")

# ---- vane extent from per-row width ----
minx=int(min(xs)); rows=[]
for sy in range(src_tip[1]+4, src_cal[1]-4, 3):
    row=[x for x in range(W) if is_ink(x,sy)]
    if row: rows.append((sy, max(row)-min(row)))
vane_h_src = max(r[0] for r in rows if r[1] > 14) - src_tip[1]
print(f"vane height (src): {vane_h_src}px of {Lsrc:.0f}px total")

# ---- rachis slit: spine = smoothed row-mid, from 22% to 52% of VANE (short, clean) ----
spine_src=[]
for f in [0.22,0.28,0.34,0.40,0.46,0.52]:
    sy=int(src_tip[1]+vane_h_src*f)
    row=[x for x in range(W) if is_ink(x,sy)]
    if row: spine_src.append(((min(row)+max(row))/2.0, sy))
# smooth spine (moving avg w=3, two passes)
for _ in range(2):
    sm=[]
    for i in range(len(spine_src)):
        lo=max(0,i-1); hi=min(len(spine_src),i+2)
        sm.append((sum(p[0] for p in spine_src[lo:hi])/(hi-lo),
                   sum(p[1] for p in spine_src[lo:hi])/(hi-lo)))
    spine_src=sm
spine=[xform(q) for q in sm]
HW=0.22
left=[]; right=[]
for i,(sx,sy) in enumerate(spine):
    if i==0: t=(spine[1][0]-spine[0][0], spine[1][1]-spine[0][1])
    elif i==len(spine)-1: t=(spine[-1][0]-spine[-2][0], spine[-1][1]-spine[-2][1])
    else: t=(spine[i+1][0]-spine[i-1][0], spine[i+1][1]-spine[i-1][1])
    tl=math.hypot(*t); pn=(-t[1]/tl, t[0]/tl)
    w=HW*math.sin(math.pi*(0.12+0.80*i/(len(spine)-1)))
    left.append((sx+pn[0]*w, sy+pn[1]*w)); right.append((sx-pn[0]*w, sy-pn[1]*w))
slot_svg = left + right[::-1]

def fmt(q): return f"{q[0]:.2f} {q[1]:.2f}"
def to_d(poly): return "M"+" L".join(fmt(q) for q in poly)+" Z"
d = to_d(out_svg)+" "+to_d(slot_svg)
open('/tmp/quill_d.txt','w').write(d)
json.dump({"outline":out_svg,"slot":slot_svg}, open('/tmp/quill_pts.json','w'))
print("path chars:", len(d))
