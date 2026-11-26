# Blender에서 실행: 공식 도면 ROBOT_ARM_SYMPHONY5.pdf(23.05.31) 치수대로 심포니 5를 만든다.
# 관절 0이면 팔이 위로 곧게 선다. 좌표는 glTF(y 위, m)로 적고 Blender(z 위)로 바꿔 넣는다.
# x는 joint2 축 방향이고 위팔이 비켜난 쪽이 +x. 축: joint1 y, joint2 x, joint3 x, joint4 x, joint5 y, joint6 x.
# 도면 숫자(mm): 바닥→joint2 167, 425, 392.3, joint4→joint6 99.6, 위팔 비켜남 137.8, 위팔→아래팔 131.2,
#   아래팔→joint5 축 113.6, joint5 축→공구 플랜지 면 113.5, 받침판 180x180 볼트 간격 150, 플랜지 Ø63.
# 부품 굵기와 이음새 위치는 도면 그림을 확대해 잰 값이다(±2 mm 정도).
import bpy, bmesh, math, os
from mathutils import Vector

SCENE_NAME = "Symphony5Drawing"
COLL_NAME = "symphony5_drawing"
OUT = r"C:\Users\rnsgu\Desktop\경희\학부연구생\과제\Inverse_Kinematics\프로젝트 1\assets\models\symphony-5-drawing.glb"

# 실제 심포니 5 사진처럼: 검은 몸체, 짙은 덮개와 받침판, 은색 이음 고리, 흰 공구 쪽 고리, 금속 플랜지
COLORS = {"body": "#1E2023", "joint": "#2A2D31", "ring": "#C4C8CC", "tool": "#ECEEF0", "metal": "#A7ADB4"}
PBR = {"body": (0.0, 0.4), "joint": (0.0, 0.3), "ring": (0.3, 0.35), "tool": (0.0, 0.45), "metal": (0.4, 0.6)}  # metallic, roughness


def srgb_to_linear(hexstr):
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]


def gl2bl(p):
    return Vector((p[0], -p[2], p[1]))


# ---------- 단면 ----------
def arc(ca, cr, rad, th0, th1, n):
    return [(ca + rad * math.cos(th0 + (th1 - th0) * k / n), cr + rad * math.sin(th0 + (th1 - th0) * k / n)) for k in range(n + 1)]


def rounded(a0, a1, r, f0, f1, n=3):
    pts = [(a0, 0.0)]
    pts += arc(a0 + f0, r - f0, f0, math.pi, math.pi / 2, n) if f0 > 0 else [(a0, r)]
    pts += arc(a1 - f1, r - f1, f1, math.pi / 2, 0, n) if f1 > 0 else [(a1, r)]
    pts.append((a1, 0.0))
    return pts


def cap(a_face, d, t, R, f=0.003, n=3):
    """관절 덮개: a_face 면에서 d 방향으로 t만큼 나온 원판, 바깥 모서리 둥글고 얕은 홈 하나."""
    a_in = a_face - d * 0.002
    pts = [(a_in, 0.0), (a_in, R)]
    for k in range(n + 1):
        th = (math.pi / 2) * k / n
        pts.append((a_face + d * (t - f + f * math.sin(th)), R - f + f * math.cos(th)))
    g = 0.0012
    pts += [(a_face + d * t, 0.80 * R), (a_face + d * (t - g), 0.78 * R), (a_face + d * (t - g), 0.73 * R),
            (a_face + d * t, 0.71 * R), (a_face + d * t, 0.0)]
    return pts


def band(a0, a1, r):
    return [(a0, 0.0), (a0, r), (a1, r), (a1, 0.0)]


def seg_for(r):
    return 40 if r >= 0.05 else (32 if r >= 0.03 else 16)


# ---------- 기하 만들기 ----------
def finish(bm, faces, mat_index):
    for f in faces:
        f.material_index = mat_index
        f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def lathe(bm, axis, center, profile, seg, mat_index):
    cx, cy, cz = center

    def P(a, r, t):
        c, s = r * math.cos(t), r * math.sin(t)
        if axis == 'y':
            g = (cx + c, cy + a, cz + s)
        elif axis == 'x':
            g = (cx + a, cy + c, cz + s)
        else:
            g = (cx + c, cy + s, cz + a)
        return gl2bl(g)

    prof = []
    for p in profile:
        if not prof or abs(p[0] - prof[-1][0]) > 1e-7 or abs(p[1] - prof[-1][1]) > 1e-7:
            prof.append(p)
    rings = []
    for a, r in prof:
        rings.append([bm.verts.new(P(a, 0, 0))] if r < 1e-9 else [bm.verts.new(P(a, r, 2 * math.pi * j / seg)) for j in range(seg)])
    return finish(bm, connect(bm, rings, seg), mat_index)


def connect(bm, rings, seg):
    faces = []
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for j in range(seg):
            j2 = (j + 1) % seg
            if len(A) == 1:
                faces.append(bm.faces.new((A[0], B[j], B[j2])))
            elif len(B) == 1:
                faces.append(bm.faces.new((A[j], A[j2], B[0])))
            else:
                faces.append(bm.faces.new((A[j], B[j], B[j2], A[j2])))
    return faces


def sweep(bm, path, seg, mat_index):
    """xy 평면 위의 경로를 따라 굵기가 변하는 관. path: [(x, y, r), ...], 양 끝은 막는다."""
    rings = []
    n = len(path)
    for i, (x, y, r) in enumerate(path):
        x0, y0, _ = path[max(i - 1, 0)]
        x1, y1, _ = path[min(i + 1, n - 1)]
        tx, ty = x1 - x0, y1 - y0
        L = math.hypot(tx, ty)
        tx, ty = tx / L, ty / L
        nx, ny = -ty, tx  # 경로 평면 안의 수직 방향, 나머지 하나는 z
        if i == 0:
            rings.append([bm.verts.new(gl2bl((x, y, 0)))])
        ring = []
        for j in range(seg):
            t = 2 * math.pi * j / seg
            c, s = math.cos(t), math.sin(t)
            ring.append(bm.verts.new(gl2bl((x + r * c * nx, y + r * c * ny, r * s))))
        rings.append(ring)
        if i == n - 1:
            rings.append([bm.verts.new(gl2bl((x, y, 0)))])
    return finish(bm, connect(bm, rings, seg), mat_index)


def plate(bm, half, corner, y0, y1, mat_index, n=6):
    """받침판: 모서리가 둥근 정사각 판 (glTF xz 평면, 두께 y0~y1)."""
    pts = []
    for sx, sz, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        cxp, czp = sx * (half - corner), sz * (half - corner)
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cxp + corner * math.cos(a), czp + corner * math.sin(a)))
    bot = [bm.verts.new(gl2bl((x, y0, z))) for x, z in pts]
    top = [bm.verts.new(gl2bl((x, y1, z))) for x, z in pts]
    faces = [bm.faces.new(bot), bm.faces.new(top)]
    m = len(pts)
    for i in range(m):
        j = (i + 1) % m
        faces.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
    return finish(bm, faces, mat_index)


# ---------- 노드와 부품 (glTF, 노드 자기 기준, m) ----------
J1Y = 0.095          # joint1 회전 이음새 높이 (받침 바닥에서)
SH = 0.167 - J1Y     # joint1 → joint2 축
L2, L3 = 0.425, 0.3923
UP = 0.1378          # 위팔 중심선 비켜남
FO = UP - 0.1312     # 아래팔 중심선 비켜남 0.0066
J5X = FO + 0.1136    # joint5 축 비켜남 0.1202 (joint4 기준)
W56 = 0.0996         # joint4 → joint6 축 (joint5 축 방향)
FL = 0.1135          # joint5 축 → 공구 플랜지 면 (joint6 축 방향)
TOOL_OFFSET = 0.04   # 공구 끝 기준점(tcp)을 플랜지 면에서 앞으로 띄운 거리. 주황 공과 선이 플랜지에 묻히지 않게 공구를 단 것처럼 둔다


def bend_path():
    """팔꿈치 굽은 관: joint3 축 위 x=0.076에서 -x로 나가 아래팔 중심선(x=FO)에서 위로 꺾인다. 굵기 0.057 → 0.0373."""
    R = 0.076 - FO
    cxp, cyp = 0.076, R
    pts = []
    n = 14
    for k in range(n + 1):
        th = -math.pi / 2 - (math.pi / 2) * k / n   # -90° → -180°
        w = k / n
        r = 0.0373 + (0.057 - 0.0373) * (1 - w) ** 1.6
        pts.append((cxp + R * math.cos(th), cyp + R * math.sin(th), r))
    return pts


def flange_holes():
    out = []
    for k, ang in enumerate((45, 135, 225, 315, 0)):
        a = math.radians(ang)
        r = 0.003
        out.append(('joint', 'x', (0, 0.025 * math.cos(a), 0.025 * math.sin(a)), band(FL - 0.0003, FL + 0.0002, r), 12))
    return out


def base_bolts():
    return [('joint', 'y', (sx * 0.075, 0, sz * 0.075), band(0.0160, 0.0169, 0.0075), 16) for sx in (1, -1) for sz in (1, -1)]


NODES = [
    ("base", None, (0, 0, 0), [
        ('joint', 'plate', None, (0.090, 0.014, 0.0, 0.0166), None),                       # 받침판 180x180
        ('body', 'y', (0, 0, 0), [(0.012, 0.0), (0.012, 0.081), (0.0166, 0.081), (0.022, 0.078), (0.028, 0.071),
                                  (0.034, 0.066), (0.040, 0.063), (0.077, 0.063), (0.077, 0.0)], None),   # 받침 몸통
        ('ring', 'y', (0, 0, 0), band(0.077, 0.082, 0.0645), None),                         # 고리
        ('body', 'y', (0, 0, 0), rounded(0.082, 0.0934, 0.063, 0, 0.002), None),            # 받침 윗단
        ('joint', 'y', (0, 0, 0), band(0.0925, 0.0985, 0.060), None),                       # joint1 이음새
    ] + base_bolts()),
    ("joint1", "base", (0, J1Y, 0), [
        ('body', 'y', (0, 0, 0), rounded(0.0025, 0.141, 0.0576, 0.002, 0.007), None),       # joint1 몸통 (세로)
        ('joint', 'x', (0, SH, 0), band(0.045, 0.0745, 0.057), None),                       # joint2 이음새
    ]),
    ("joint2", "joint1", (0, SH, 0), [
        ('body', 'x', (0, 0, 0), rounded(0.074, 0.2074, 0.059, 0.006, 0.006), None),        # 어깨 관절 몸통
        ('joint', 'x', (0, 0, 0), cap(0.2074, 1, 0.006, 0.053), None),                      # 어깨 덮개
        ('body', 'y', (UP, 0, 0), [(0.0, 0.0), (0.0, 0.0587), (0.082, 0.0587), (0.086, 0.045), (0.098, 0.045),
                                   (0.100, 0.0425), (0.346, 0.0425), (0.350, 0.058), (L2, 0.058), (L2, 0.0)], None),  # 위팔
        ('ring', 'y', (UP, 0, 0), band(0.0835, 0.0875, 0.0592), None),                     # 위팔 아래 고리
        ('ring', 'y', (UP, 0, 0), band(0.328, 0.335, 0.0435), None),                       # 위팔 위 고리
        ('body', 'x', (0, L2, 0), rounded(0.074, 0.207, 0.0573, 0.006, 0.006), None),       # 팔꿈치 관절 몸통
        ('joint', 'x', (0, L2, 0), cap(0.207, 1, 0.005, 0.052), None),                      # 팔꿈치 덮개
        ('joint', 'x', (0, L2, 0), band(0.0595, 0.0745, 0.0578), None),                     # joint3 이음새
    ]),
    ("joint3", "joint2", (0, L2, 0), [
        ('body', 'sweep', None, bend_path(), 40),                                           # 팔꿈치 굽은 관
        ('body', 'y', (FO, 0, 0), [(0.068, 0.0), (0.068, 0.0373), (0.078, 0.0373), (0.080, 0.0355), (0.329, 0.0355),
                                   (0.331, 0.0375), (L3, 0.0375), (L3, 0.0)], None),        # 아래팔
        ('ring', 'y', (FO, 0, 0), band(0.072, 0.076, 0.0378), None),                       # 아래팔 아래 고리
        ('ring', 'y', (FO, 0, 0), band(0.338, 0.342, 0.0380), None),                       # 아래팔 위 고리
        ('body', 'x', (0, L3, 0), rounded(-0.0498, 0.052, 0.038, 0.005, 0.0), None),        # joint4 몸통
        ('joint', 'x', (0, L3, 0), cap(-0.0498, -1, 0.004, 0.033), None),                   # joint4 덮개
        ('joint', 'x', (0, L3, 0), band(0.051, 0.0605, 0.0386), None),                      # joint4 이음새
    ]),
    ("joint4", "joint3", (0, L3, 0), [
        ('body', 'x', (0, 0, 0), band(0.060, J5X, 0.038), None),                            # joint5로 가는 가로 마디
        ('body', 'y', (J5X, 0, 0), rounded(-0.058, 0.0445, 0.037, 0.004, 0.0), None),       # joint5 몸통 (세로)
        ('joint', 'y', (J5X, 0, 0), cap(-0.058, -1, 0.003, 0.031), None),                   # joint5 아래 덮개
        ('joint', 'y', (J5X, 0, 0), band(0.0435, 0.0550, 0.0376), None),                    # joint5 이음새
    ]),
    ("joint5", "joint4", (J5X, 0, 0), [
        ('body', 'y', (0, 0, 0), band(0.054, W56, 0.036), None),                            # joint6 몸통으로 가는 목
        ('body', 'x', (0, W56, 0), rounded(-0.064, 0.046, 0.0373, 0.005, 0.0), None),       # joint6 몸통 (가로)
        ('joint', 'x', (0, W56, 0), cap(-0.064, -1, 0.003, 0.031), None),                   # joint6 안쪽 덮개
        ('joint', 'x', (0, W56, 0), band(0.045, 0.051, 0.0379), None),                      # joint6 이음새
    ]),
    ("joint6", "joint5", (0, W56, 0), [
        ('tool', 'x', (0, 0, 0), [(0.050, 0.0), (0.050, 0.0373), (0.061, 0.0373), (0.0626, 0.0424), (0.0855, 0.0424),
                                  (0.0875, 0.0414), (0.106, 0.0345), (0.106, 0.0)], None),  # 공구 쪽 고리
        ('metal', 'x', (0, 0, 0), [(0.104, 0.0), (0.104, 0.0315), (0.1125, 0.0315), (FL, 0.0305), (FL, 0.0168),
                                   (FL - 0.003, 0.01575), (FL - 0.003, 0.0)], None),         # 공구 플랜지 Ø63, 가운데 Ø31.5
    ] + flange_holes()),
    ("tcp", "joint6", (FL + TOOL_OFFSET, 0, 0), []),                                        # 플랜지 면 가운데에서 4 cm 앞
]
AXES = {"joint1": "y", "joint2": "x", "joint3": "x", "joint4": "x", "joint5": "y", "joint6": "x"}


def cap_ring(axis, center, a_face, d, t, R):
    """덮개 테두리의 은색 고리: 덮개 옆면 아래쪽 절반."""
    a1 = a_face + d * t * 0.5
    return ('ring', axis, center, band(min(a_face, a1), max(a_face, a1), R + 0.0004), None)


# 관절 사이 짙은 틈 가운데의 얇은 은색 고리와 덮개 테두리 고리
SILVER = {
    "base": [('ring', 'y', (0, 0, 0), band(0.0945, 0.0965, 0.0605), None)],
    "joint1": [('ring', 'x', (0, SH, 0), band(0.0655, 0.0675, 0.0575), None)],
    "joint2": [('ring', 'x', (0, L2, 0), band(0.066, 0.068, 0.0583), None),
               cap_ring('x', (0, 0, 0), 0.2074, 1, 0.006, 0.053),
               cap_ring('x', (0, L2, 0), 0.207, 1, 0.005, 0.052)],
    "joint3": [('ring', 'x', (0, L3, 0), band(0.055, 0.057, 0.0391), None),
               cap_ring('x', (0, L3, 0), -0.0498, -1, 0.004, 0.033)],
    "joint4": [('ring', 'y', (J5X, 0, 0), band(0.048, 0.050, 0.0381), None),
               cap_ring('y', (J5X, 0, 0), -0.058, -1, 0.003, 0.031)],
    "joint5": [('ring', 'x', (0, W56, 0), band(0.047, 0.049, 0.0384), None),
               cap_ring('x', (0, W56, 0), -0.064, -1, 0.003, 0.031)],
}
NODES = [(n, p, t, parts + SILVER.get(n, [])) for n, p, t, parts in NODES]


def run():
    scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    coll = bpy.data.collections.get(COLL_NAME)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new(COLL_NAME)
        scene.collection.children.link(coll)
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)

    mats = {}
    for name, hexc in COLORS.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        sock = {s.identifier: s for s in bsdf.inputs}
        col = srgb_to_linear(hexc)
        sock['Base Color'].default_value = col
        sock['Metallic'].default_value = PBR[name][0]
        sock['Roughness'].default_value = PBR[name][1]
        mat.diffuse_color = col
        mats[name] = mat

    # 오브젝트 이름은 파일 전체에서 하나뿐이라, 다른 장면의 같은 이름(symphony_like, joint1 …)을 잠시 비켜 둔다
    names = ["symphony_like"] + [n[0] for n in NODES] + [n[0] + "_mesh" for n in NODES]
    renamed = []
    for nm in names:
        o = bpy.data.objects.get(nm)
        if o and o.name not in coll.objects:
            o.name = nm + "__keep"
            renamed.append(o)

    root = bpy.data.objects.new("symphony_like", None)
    coll.objects.link(root)
    root["note"] = "심포니 5 공식 도면(ROBOT_ARM_SYMPHONY5.pdf) 치수 모델. 관절각 0이면 팔이 위로 곧게 서고 공구는 +x를 봄"
    objs, stats = {}, {}
    for name, parent, t, parts in NODES:
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.03
        e.empty_display_type = 'ARROWS'
        coll.objects.link(e)
        e.parent = objs[parent] if parent else root
        e.matrix_parent_inverse.identity()
        e.location = gl2bl(t)
        if name in AXES:
            e["axis"] = AXES[name]
        objs[name] = e
        if not parts:
            continue
        used = []
        for p in parts:
            if p[0] not in used:
                used.append(p[0])
        bm = bmesh.new()
        for mat, kind, center, prof, seg in parts:
            mi = used.index(mat)
            if kind == 'plate':
                half, corner, y0, y1 = prof
                plate(bm, half, corner, y0, y1, mi)
            elif kind == 'sweep':
                sweep(bm, prof, seg, mi)
            else:
                rmax = max(r for _, r in prof)
                lathe(bm, kind, center, prof, seg or seg_for(rmax), mi)
        bm.normal_update()
        for ed in bm.edges:
            if len(ed.link_faces) == 2 and ed.calc_face_angle(0.0) > math.radians(30):
                ed.smooth = False
        me = bpy.data.meshes.new(name + "_mesh")
        bm.to_mesh(me)
        bm.free()
        for mat in used:
            me.materials.append(mats[mat])
        mo = bpy.data.objects.new(name + "_mesh", me)
        coll.objects.link(mo)
        mo.parent = e
        mo.matrix_parent_inverse.identity()
        stats[name] = (len(me.vertices), sum(len(p.vertices) - 2 for p in me.polygons))
    print("per node (verts, tris):", stats)
    print("total tris", sum(v[1] for v in stats.values()))
    export(coll)
    # 비켜 둔 이름 되돌리기는 하지 않는다(같은 이름이 둘이 될 수 없어서). 이전 장면의 오브젝트는 '__keep'이 붙은 채 남는다.
    print("renamed other-scene objects:", [o.name for o in renamed])


def export(coll):
    for sc in bpy.data.scenes:
        for vl in sc.view_layers:
            for o in sc.objects:
                o.select_set(False, view_layer=vl)
    for o in coll.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["symphony_like"]
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True,
                              export_apply=True, export_texcoords=False, export_normals=True, export_tangents=False,
                              export_materials='EXPORT', export_extras=True, export_cameras=False, export_lights=False,
                              export_animations=False, export_skins=False, export_morph=False, export_vertex_color='NONE')
    print("exported", OUT, os.path.getsize(OUT), "bytes")


run()
