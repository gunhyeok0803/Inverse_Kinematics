import AFRAME from 'aframe';
import * as THREE from 'three';

// 양손의 손목과 검지 끝 위치, 핀치 상태를 판에 글자로 띄운다.
// 위치는 hand-tracking-controls가 매 프레임 채우는 관절 행렬 배열(jointPoses)에서 읽는다.
// jointPoses는 문서에 없는 내부 값이라 A-Frame 버전을 바꾸면 다시 확인한다.
// A-Frame 기본 글꼴에는 한글이 없어서 판의 글자는 영어로 쓴다.
const WRIST = 0;     // XRHand 관절 번호: 손목
const INDEX_TIP = 9; // XRHand 관절 번호: 검지 끝

AFRAME.registerComponent('hand-info', {
  schema: {
    left: { type: 'selector' },  // 왼손 엔티티
    right: { type: 'selector' }, // 오른손 엔티티
    interval: { default: 100 },  // 글자를 바꾸는 간격 (ms)
  },

  init() {
    this.pinched = { left: false, right: false };

    // tick에서 매번 new 하지 않도록 계산용 그릇을 미리 만든다.
    this.mat = new THREE.Matrix4();
    this.pos = new THREE.Vector3();

    // 핀치 이벤트를 받는 함수. 양손에 같은 함수를 붙인다.
    // 리스너를 나중에 떼려면 같은 함수가 필요해서 this에 저장한다.
    this.onPinch = (evt) => {
      // 1단계: 핸드 엔티티를 확인하여 왼손 or 오른손을 구분
      const side = evt.currentTarget === this.data.left ? 'left' : 'right';
      // 2단계: 핀치 시작이면 true, 끝이면 false를 this.pinched에 저장
      this.pinched[side] = evt.type === 'pinchstarted';
    };
    for (const handEl of [this.data.left, this.data.right]) {
      if (!handEl) continue;
      handEl.addEventListener('pinchstarted', this.onPinch);
      handEl.addEventListener('pinchended', this.onPinch);
    }

    // 글자는 1초에 열 번이면 충분하다. 매 프레임 바꾸면 글자 모양을 다시 만드느라 느려진다.
    this.tick = AFRAME.utils.throttleTick(this.tick, this.data.interval, this);
    this.el.setAttribute('text', { value: 'waiting for hands', color: '#222', width: 1.2 });
  },

  remove() {
    for (const handEl of [this.data.left, this.data.right]) {
      if (!handEl) continue;
      handEl.removeEventListener('pinchstarted', this.onPinch);
      handEl.removeEventListener('pinchended', this.onPinch);
    }
  },

  // 손 엔티티(handEl)에서 관절 index의 위치를 읽어 target에 넣는다.
  // 손을 찾았으면 true, 아직 못 찾았으면 false를 돌려준다.
  readJoint(handEl, index, target) {
    // 1단계: 손을 찾았는지 확인
    const htc = handEl && handEl.components['hand-tracking-controls'];
    if (!htc || !htc.hasPoses) {
      return false;
    }
    // 2단계: 관절 행렬을 index*16부터 읽어 this.mat을 채워서 여기에서 위치를 찾음
    this.mat.fromArray(htc.jointPoses, index * 16);
    // 3단계: 찾은 위치를 target에 넣음
    target.setFromMatrixPosition(this.mat);
    return true;
  },

  // 위치 x, y, z를 소수 둘째 자리까지 글자로 만든다.
  fmt(v) {
    return `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}`;
  },

  tick() {
    const lines = [];
    for (const side of ['left', 'right']) {
      const handEl = this.data[side];
      // 손목을 못 읽으면 그 손은 안 보이는 것으로 보고 다음 손으로 넘어간다.
      if (!this.readJoint(handEl, WRIST, this.pos)) {
        lines.push(`${side}: not tracked`);
        continue;
      }
      lines.push(`${side} wrist ${this.fmt(this.pos)}`);
      this.readJoint(handEl, INDEX_TIP, this.pos);
      lines.push(`${side} index ${this.fmt(this.pos)}`);
      lines.push(`${side} pinch ${this.pinched[side] ? 'ON' : 'off'}`);
    }
    this.el.setAttribute('text', 'value', lines.join('\n'));
  },
});