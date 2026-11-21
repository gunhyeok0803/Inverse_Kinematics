"""심포니급 6축 협동로봇 근사 모델을 GLB로 만든다.

공식 CAD나 URDF가 없어서 같은 급(작업반경 약 850 mm) 협동로봇의 공개 치수 비율을 참고해
원기둥으로 만든다. 단위는 m, y가 위쪽이다. 모든 관절각 0일 때 팔이 위로 곧게 선 자세다.

관절 노드(joint1~joint6)는 회전 중심에 있고 회전축은 아래와 같다(노드 자기 좌표 기준).
  joint1 y, joint2 x, joint3 x, joint4 x, joint5 z, joint6 y
tcp 노드는 공구 끝 기준점이다.
"""
import json, math, struct, sys, pathlib

OUT = pathlib.Path(sys.argv[1])

# 색 (선형 RGB가 아니라 sRGB를 그대로 넣고 아래에서 선형으로 바꾼다)
COLORS = {
    "body": "#F4F5F6",   # 흰색 몸체
    "joint": "#3B4048",  # 짙은 회색 관절 덮개
    "metal": "#A7ADB4",  # 공구 플랜지
}

def srgb_to_linear(hexstr):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]

MAT_NAMES = list(COLORS)


def cylinder(axis, center, radius, length, seg=40):
    """축 방향(x, y, z) 원기둥. 옆면과 위아래 뚜껑을 따로 만들어 법선이 바르게 나오게 한다."""
    cx, cy, cz = center
    pos, nor, idx = [], [], []

    def place(a, r1, r2):
        # a: 축 방향 좌표, r1 r2: 축에 수직인 두 좌표
        if axis == 'y':
            return (cx + r1, cy + a, cz + r2)
        if axis == 'x':
            return (cx + a, cy + r1, cz + r2)
        return (cx + r1, cy + r2, cz + a)

    def place_n(a, r1, r2):
        if axis == 'y':
            return (r1, a, r2)
        if axis == 'x':
            return (a, r1, r2)
        return (r1, r2, a)

    h = length / 2
    # 옆면
    for i in range(seg + 1):
        t = 2 * math.pi * i / seg
        c, s = math.cos(t), math.sin(t)
        for a in (-h, h):
            pos.append(place(a, radius * c, radius * s))
            nor.append(place_n(0, c, s))
    for i in range(seg):
        a0, a1, b0, b1 = 2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3
        idx += [a0, b0, a1, a1, b0, b1]
    # 뚜껑
    for sign in (-1, 1):
        base = len(pos)
        pos.append(place(sign * h, 0, 0))
        nor.append(place_n(sign, 0, 0))
        for i in range(seg + 1):
            t = 2 * math.pi * i / seg
            pos.append(place(sign * h, radius * math.cos(t), radius * math.sin(t)))
            nor.append(place_n(sign, 0, 0))
        for i in range(seg):
            if sign > 0:
                idx += [base, base + 1 + i, base + 2 + i]
            else:
                idx += [base, base + 2 + i, base + 1 + i]
    # 감기는 방향 확인: 옆면 삼각형의 법선이 바깥을 보도록 필요하면 뒤집는다
    return fix_winding(pos, nor, idx)


def fix_winding(pos, nor, idx):
    out = []
    for k in range(0, len(idx), 3):
        a, b, c = idx[k:k + 3]
        pa, pb, pc = pos[a], pos[b], pos[c]
        u = [pb[i] - pa[i] for i in range(3)]
        v = [pc[i] - pa[i] for i in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        avg = [nor[a][i] + nor[b][i] + nor[c][i] for i in range(3)]
        if sum(n[i] * avg[i] for i in range(3)) < 0:
            out += [a, c, b]
        else:
            out += [a, b, c]
    return pos, nor, out


# 부품: (이름, 재질, 원기둥 인자)
# 관절 노드: (이름, 부모, 위치, 부품 목록)
L1, L2, L3 = 0.1625, 0.425, 0.392   # 어깨 높이, 위팔, 아래팔
W4, W5, W6 = 0.090, 0.060, 0.040    # 손목 마디와 공구 끝
OX_UP, OX_FORE = 0.120, 0.030       # 위팔, 아래팔이 옆으로 비켜 있는 거리(축 방향이라 운동에는 영향 없음)

NODES = [
    ("base", None, (0, 0, 0), [
        ("base_flange", "joint", ('y', (0, 0.006, 0), 0.090, 0.012)),
        ("base_body", "body", ('y', (0, 0.051, 0), 0.075, 0.078)),
    ]),
    ("joint1", "base", (0, 0.090, 0), [
        ("j1_ring", "joint", ('y', (0, 0.006, 0), 0.071, 0.012)),
        ("j1_body", "body", ('y', (0, 0.040, 0), 0.068, 0.056)),
        ("shoulder", "body", ('x', (0, L1 - 0.090, 0), 0.068, 0.150)),
        ("shoulder_cap", "joint", ('x', (-0.081, L1 - 0.090, 0), 0.060, 0.012)),
    ]),
    ("joint2", "joint1", (0, L1 - 0.090, 0), [
        ("j2_cap", "joint", ('x', (OX_UP + 0.056, 0, 0), 0.058, 0.012)),
        ("j2_body", "body", ('x', (OX_UP, 0, 0), 0.062, 0.100)),
        ("upper_arm", "body", ('y', (OX_UP, L2 / 2, 0), 0.045, L2)),
        ("elbow", "body", ('x', (OX_UP, L2, 0), 0.056, 0.100)),
        ("elbow_cap", "joint", ('x', (OX_UP + 0.056, L2, 0), 0.052, 0.012)),
    ]),
    ("joint3", "joint2", (0, L2, 0), [
        ("j3_body", "body", ('x', (OX_FORE, 0, 0), 0.050, 0.080)),
        ("forearm", "body", ('y', (OX_FORE, L3 / 2, 0), 0.036, L3)),
    ]),
    ("joint4", "joint3", (0, L3, 0), [
        ("wrist1", "body", ('x', (OX_FORE, 0, 0), 0.044, 0.090)),
        ("wrist1_cap", "joint", ('x', (OX_FORE - 0.051, 0, 0), 0.040, 0.012)),
        ("wrist1_link", "body", ('y', (OX_FORE, W4 / 2, 0), 0.034, W4)),
    ]),
    ("joint5", "joint4", (OX_FORE, W4, 0), [
        ("wrist2", "body", ('z', (0, 0, 0), 0.042, 0.084)),
        ("wrist2_cap", "joint", ('z', (0, 0, 0.048), 0.038, 0.012)),
        ("wrist2_link", "body", ('y', (0, W5 / 2, 0), 0.032, W5)),
    ]),
    ("joint6", "joint5", (0, W5, 0), [
        ("wrist3", "joint", ('y', (0, 0.012, 0), 0.034, 0.024)),
        ("flange", "metal", ('y', (0, 0.030, 0), 0.031, 0.012)),
    ]),
    ("tcp", "joint6", (0, W6, 0), []),
]

AXES = {"joint1": "y", "joint2": "x", "joint3": "x", "joint4": "x", "joint5": "z", "joint6": "y"}

# ---- glTF 조립 ----
binbuf = bytearray()
views, accessors, meshes, nodes = [], [], [], []


def add_view(data, target):
    while len(binbuf) % 4:
        binbuf.append(0)
    off = len(binbuf)
    binbuf.extend(data)
    views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
    return len(views) - 1


def add_mesh(name, mat, cyl):
    pos, nor, idx = cylinder(*cyl)
    pdata = b"".join(struct.pack("<3f", *p) for p in pos)
    ndata = b"".join(struct.pack("<3f", *n) for n in nor)
    idata = b"".join(struct.pack("<H", i) for i in idx)
    mins = [min(p[i] for p in pos) for i in range(3)]
    maxs = [max(p[i] for p in pos) for i in range(3)]
    pv = add_view(pdata, 34962)
    nv = add_view(ndata, 34962)
    iv = add_view(idata, 34963)
    accessors.append({"bufferView": pv, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": mins, "max": maxs})
    accessors.append({"bufferView": nv, "componentType": 5126, "count": len(nor), "type": "VEC3"})
    accessors.append({"bufferView": iv, "componentType": 5123, "count": len(idx), "type": "SCALAR"})
    a = len(accessors)
    meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": a - 3, "NORMAL": a - 2}, "indices": a - 1, "material": MAT_NAMES.index(mat)}]})
    return len(meshes) - 1


node_index = {}
for name, parent, t, parts in NODES:
    children = []
    for pname, mat, cyl in parts:
        m = add_mesh(pname, mat, cyl)
        nodes.append({"name": pname, "mesh": m})
        children.append(len(nodes) - 1)
    node = {"name": name, "translation": list(t), "children": children}
    if name in AXES:
        node["extras"] = {"axis": AXES[name]}
    nodes.append(node)
    node_index[name] = len(nodes) - 1
    if parent:
        nodes[node_index[parent]]["children"].append(node_index[name])

root = {"name": "symphony_like", "children": [node_index["base"]],
        "extras": {"note": "심포니급 6축 협동로봇 근사 모델. 관절각 0이면 팔이 위로 곧게 섬", "axes": AXES}}
nodes.append(root)

gltf = {
    "asset": {"version": "2.0", "generator": "make_glb.py"},
    "scene": 0,
    "scenes": [{"nodes": [len(nodes) - 1]}],
    "nodes": nodes,
    "meshes": meshes,
    "materials": [{"name": n, "pbrMetallicRoughness": {"baseColorFactor": srgb_to_linear(COLORS[n]),
                   "metallicFactor": 0.4 if n == "metal" else 0.0, "roughnessFactor": 0.45 if n == "body" else 0.6}}
                  for n in MAT_NAMES],
    "accessors": accessors,
    "bufferViews": views,
    "buffers": [{"byteLength": len(binbuf)}],
}
while len(binbuf) % 4:
    binbuf.append(0)
gltf["buffers"][0]["byteLength"] = len(binbuf)
js = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
while len(js) % 4:
    js += b" "
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binbuf))
glb += struct.pack("<II", len(js), 0x4E4F534A) + js
glb += struct.pack("<II", len(binbuf), 0x004E4942) + bytes(binbuf)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(glb)
print(OUT, len(glb), "bytes,", len(meshes), "meshes,", len(nodes), "nodes")
