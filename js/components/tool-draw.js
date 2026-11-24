import AFRAME from 'aframe';
import * as THREE from 'three';
import { distance } from '../lib/vec.js';

// 로봇 공구 끝을 잡고 끄는 동안 공구 끝이 지나간 자리에 3D 선을 그린다.
// 공구 끝 위치는 robot-mvp가 보내는 tool-grab, tool-move, tool-release 이벤트로 받는다.
// 선의 점 칸은 처음에 넉넉히 만들어 두고 그릴 점 수만 늘린다(three.js 매뉴얼 How to update things).
// 엔티티를 장면 원점에 두므로 선의 좌표는 장면 좌표와 같다.
// WebGL 선은 굵기가 1픽셀로 고정이라 Quest에서 가늘면 나중에 굵은 선으로 바꾼다.
const MAX_POINTS = 2000;          // 선 하나에 담을 수 있는 최대 점 수
const MIN_POINT_SPACING = 0.001;  // 선의 점 간격(m). 마지막 점에서 이만큼 움직였을 때만 점을 더한다. 로봇이 움직이는 정밀도와는 상관없다

AFRAME.registerComponent('tool-draw', {
  schema: {
    color: { default: '#E0218A' }, // 선 색. 흰 로봇, 회색 바닥, 짙은 책상과 구분되는 자홍색
    robot: { type: 'selector' },   // 공구 끝 이벤트를 보내는 로봇 엔티티(robot-mvp가 붙은 것)
  },

  init() {
    this.line = null;    // 지금 그리는 선
    this.pointCount = 0; // 지금 선에 들어간 점 수
    this.lineCount = 0;  // 지금까지 만든 선 수. 선마다 이름을 line0, line1로 붙인다

    // 로봇이 보내는 이벤트를 아래 세 함수로 넘긴다
    this.onGrab = (evt) => this.toolGrab(evt);
    this.onMove = (evt) => this.toolMove(evt);
    this.onRelease = (evt) => this.toolRelease(evt);
    const robot = this.data.robot;
    if (robot) {
      robot.addEventListener('tool-grab', this.onGrab);
      robot.addEventListener('tool-move', this.onMove);
      robot.addEventListener('tool-release', this.onRelease);
    }
  },

  remove() {
    const robot = this.data.robot;
    if (!robot) return;
    robot.removeEventListener('tool-grab', this.onGrab);
    robot.removeEventListener('tool-move', this.onMove);
    robot.removeEventListener('tool-release', this.onRelease);
  },

  // 공구 끝을 잡은 순간. evt.detail.toolTipPosition에 그 순간 공구 끝의 장면 좌표가 들어 있다.
  toolGrab(evt) {
    // 1단계: 새 선
    this.startLine();
    // 2단계: 잡은 순간 위치를 첫 점으로
    this.addPoint(evt.detail.toolTipPosition); // 선 끝에 점을 하나 더함
  },

  // 공구 끝을 끄는 동안 IK가 끝날 때마다. evt.detail.toolTipPosition에 공구 끝이 실제로 간 장면 좌표가 들어 있다.
  toolMove(evt) {
    // 1단계: 장면 좌표를 addPoint로 점에 넣어봄
    this.addPoint(evt.detail.toolTipPosition);
    // 2단계: 바로 앞 점과 MIN_POINT_SPACING보다 가까우면 방금 넣은 점을 무름
    if (this.line && this.pointCount > 1) {
      const positions = this.line.geometry.attributes.position.array;
      const last = (this.pointCount - 1) * 3; // 마지막 점의 x 칸 번호
      const previous = (this.pointCount - 2) * 3; // 그 앞 점의 x 칸 번호
      const lastPoint = new THREE.Vector3(positions[last + 0], positions[last + 1], positions[last + 2]);
      const previousPoint = new THREE.Vector3(positions[previous + 0], positions[previous + 1], positions[previous + 2]);
      if (distance(lastPoint, previousPoint) < MIN_POINT_SPACING) {
        this.pointCount--; // 점을 더하지 않고 pointCount를 줄여서 다음 점이 마지막 점을 덮어쓰게 한다
      }
    }
    // 3단계: 점을 this.pointCount만큼 그림
    if (this.line) this.line.geometry.setDrawRange(0, this.pointCount);
  },

  // 공구 끝을 놓은 순간. detail은 없다.
  toolRelease(evt) {
    // 1단계: 선 끝내기
    this.line = null;
  },

  // 새 선을 하나 만들어 엔티티에 붙인다.
  startLine() {
    const positions = new Float32Array(MAX_POINTS * 3); // 점 하나에 x, y, z 세 칸
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0); // 처음에는 그릴 점이 없다
    const material = new THREE.LineBasicMaterial({ color: this.data.color });
    this.line = new THREE.Line(geometry, material);
    this.line.frustumCulled = false; // 점이 늘어도 화면 밖으로 잘못 판정해 숨기지 않게 한다
    this.el.setObject3D(`line${this.lineCount}`, this.line);
    this.lineCount++;
    this.pointCount = 0;
  },

  // 지금 선 끝에 점 point(x, y, z)를 하나 더한다.
  addPoint(point) {
    if (!this.line || this.pointCount >= MAX_POINTS) return; // 선이 없거나 칸이 다 찼으면 더하지 않는다
    const positionAttribute = this.line.geometry.attributes.position; // 점 칸을 가진 position 속성
    const positions = positionAttribute.array;                         // 실제 숫자 배열(Float32Array)
    // 1단계: 점 point를 positions에 넣음. 점 하나에 3칸이기 때문에 this.pointCount * 3 칸부터
    positions[this.pointCount * 3 + 0] = point.x;
    positions[this.pointCount * 3 + 1] = point.y;
    positions[this.pointCount * 3 + 2] = point.z;
    this.pointCount++;
    // 2단계: this.pointCount만큼 점을 그리도록 해서 화면에 반영
    this.line.geometry.setDrawRange(0, this.pointCount);
    // 3단계: 바뀌었다고 알림
    positionAttribute.needsUpdate = true; // three.js에 점이 바뀌었다고 알려서 화면에 반영하게 한다
  },
});
