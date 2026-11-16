import AFRAME from 'aframe';

// 책상.
// 기준점은 책상 아래 바닥 가운데라서 책상 엔티티의 높이값은 늘 0으로 둔다.
// 윗판과 다리 4개를 자식으로 만들고 class가 mount인 자식을 윗면 뒤쪽에 놓는다.
// 치수를 바꾸면 장착점과 그 위에 붙은 로봇이 함께 따라온다.
const INSET = 0.03; // 다리를 모서리에서 안쪽으로 들이는 거리 (m)

AFRAME.registerComponent('desk', {
  schema: {
    width: { default: 1.2 },     // 가로, x 방향 (m)
    depth: { default: 0.8 },     // 깊이, z 방향 (m)
    height: { default: 0.75 },   // 바닥에서 윗면까지 (m)
    top: { default: 0.03 },      // 윗판 두께 (m)
    leg: { default: 0.05 },      // 다리 굵기 (m)
    mountBack: { default: 0.2 }, // 장착점이 뒤 모서리에서 떨어진 거리 (m)
    color: { default: '#C8B79E' },
    legColor: { default: '#8C7B65' },
  },

  init() {
    this.topEl = this.makeBox();
    this.legEls = [0, 1, 2, 3].map(() => this.makeBox());
  },

  // init 다음에 한 번 실행되고 desk 속성이 바뀔 때마다 다시 실행된다.
  update() {
    const { width, depth, height, top, leg, mountBack, color, legColor } = this.data;

    // 윗판의 기준점은 상자 가운데이므로 윗면이 height에 오도록 두께의 절반만큼 내린다.
    this.setBox(this.topEl, [width, top, depth], [0, height - top / 2, 0], color);

    const legH = height - top;
    const x = width / 2 - INSET - leg / 2;
    const z = depth / 2 - INSET - leg / 2;
    const corners = [[-x, -z], [x, -z], [-x, z], [x, z]];
    corners.forEach(([cx, cz], i) => {
      this.setBox(this.legEls[i], [leg, legH, leg], [cx, legH / 2, cz], legColor);
    });

    // 장착점: 윗면 위, 가로 가운데, 뒤 모서리(-z 쪽)에서 mountBack만큼 앞.
    const mount = this.el.querySelector(':scope > .mount');
    if (mount) mount.setAttribute('position', { x: 0, y: height, z: -depth / 2 + mountBack });
  },

  makeBox() {
    const el = document.createElement('a-entity');
    this.el.appendChild(el);
    return el;
  },

  setBox(el, [w, h, d], [x, y, z], color) {
    el.setAttribute('geometry', { primitive: 'box', width: w, height: h, depth: d });
    el.setAttribute('material', { color });
    el.setAttribute('position', { x, y, z });
  },
});
