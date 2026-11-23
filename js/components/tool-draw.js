import AFRAME from 'aframe';
import * as THREE from 'three';
import { distance } from '../lib/vec.js';

// 로봇 공구 끝을 잡고 끄는 동안 공구 끝이 지나간 자리에 3D 선을 그린다.
// 공구 끝 위치는 robot-mvp가 보내는 tool-grab, tool-move, tool-release 이벤트로 받는다.
// 선의 점 칸은 처음에 넉넉히 만들어 두고 그릴 점 수만 늘린다(three.js 매뉴얼 How to update things).
// 엔티티를 장면 원점에 두므로 선의 좌표는 장면 좌표와 같다.
// WebGL 선은 굵기가 1픽셀로 고정이라 Quest에서 가늘면 나중에 굵은 선으로 바꾼다.
const MAX_POINTS = 2000; // 선 하나에 담을 수 있는 최대 점 수
const MIN_STEP = 0.001;  // 선의 점 간격(m). 마지막 점에서 이만큼 움직였을 때만 점을 더한다. 로봇이 움직이는 정밀도와는 상관없다

AFRAME.registerComponent('tool-draw', {
  schema: {
    color: { default: '#E0218A' }, // 선 색. 흰 로봇, 회색 바닥, 짙은 책상과 구분되는 자홍색
    robot: { type: 'selector' },   // 공구 끝 이벤트를 보내는 로봇 엔티티(robot-mvp가 붙은 것)
  },

  init() {
    this.line = null; // 지금 그리는 선
    this.count = 0;   // 지금 선에 들어간 점 수
    this.strokes = 0; // 지금까지 만든 선 수. 선마다 이름을 stroke0, stroke1로 붙인다

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

  // 공구 끝을 잡은 순간. evt.detail.position에 그 순간 공구 끝의 장면 좌표가 들어 있다.
  toolGrab(evt) {
    // 1단계: 새 선
    this.startLine();
    // 2단계: 잡은 순간 위치를 첫 점으로
    this.addPoint(evt.detail.position); // 선 끝에 점을 하나 더함
  },

  // 공구 끝을 끄는 동안 IK가 끝날 때마다. evt.detail.position에 공구 끝이 실제로 간 장면 좌표가 들어 있다.
  toolMove(evt) {
    // 1단계: 장면 좌표를 addpoint에 점을 넣어봄
    this.addPoint(evt.detail.position);
    // 2단계: 바로 앞 점과 MIN_STEP보다 가까우면 방금 넣은 점을 무름
    if (this.line && this.count > 1) {
      const attr = this.line.geometry.attributes.position;
      const arr = attr.array;
      const last = new THREE.Vector3(arr[(this.count - 1) * 3 + 0], arr[(this.count - 1) * 3 + 1], arr[(this.count - 1) * 3 + 2]);
      const prev = new THREE.Vector3(arr[(this.count - 2) * 3 + 0], arr[(this.count - 2) * 3 + 1], arr[(this.count - 2) * 3 + 2]);
      if (distance(last, prev) < MIN_STEP) {
        this.count--; // 점을 더하지 않고 count를 줄여서 마지막 점을 덮어쓰게 한다
      }
    }
    // 3단계: 점을 this.count만큼 그림
    if (this.line) this.line.geometry.setDrawRange(0, this.count);
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
    this.el.setObject3D(`stroke${this.strokes}`, this.line);
    this.strokes++;
    this.count = 0;
  },

  // 지금 선 끝에 점 p(x, y, z)를 하나 더한다.
  addPoint(p) {
    if (!this.line || this.count >= MAX_POINTS) return; // 선이 없거나 칸이 다 찼으면 더하지 않는다
    const attr = this.line.geometry.attributes.position; // 점 칸을 가진 position 속성
    const arr = attr.array;                               // 실제 숫자 배열(Float32Array)
    // 1단계: 점 p를 arr에 넣음. 점 하나에 3칸이기 때문에 this.count * 3 배열에
    arr[this.count * 3 + 0] = p.x;
    arr[this.count * 3 + 1] = p.y;
    arr[this.count * 3 + 2] = p.z;
    this.count++;
    // 2단계: this.count만큼 점을 그리도록 해서 화면에 반영
    this.line.geometry.setDrawRange(0, this.count);
    // 3단계: 바뀌었다고 알림
    attr.needsUpdate = true; // three.js에 점이 바뀌었다고 알려서 화면에 반영하게 한다
  },
});