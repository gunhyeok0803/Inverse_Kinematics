import AFRAME from 'aframe';
import * as THREE from 'three';
import { distance } from '../lib/vec.js';

// 검지 끝으로 누르는 가상 버튼. 맨손에는 버튼이 없어서 장면에 버튼을 두고 검지 끝이 가까이 오면 누른 것으로 본다.
// 누르면 이 엔티티에서 button-press 이벤트를 한 번 보낸다. 눌렀을 때 할 일은 받는 쪽이 정한다(지금은 tool-log의 저장).
// 핀치가 1.5 cm에서 붙고 2 cm에서 떨어지는 것처럼 누름과 뗌의 거리를 다르게 둔다.
// 검지 끝 위치는 hand-tracking-controls가 핀치 판정에 쓰려고 매 프레임 채우는 indexTipPosition을 읽는다.
// A-Frame 1.8.0 소스에서 확인한 내부 값이라 버전을 바꾸면 다시 확인한다. 양손이 #rig 안에 있어 장면 좌표와 같다.
const PRESS_DISTANCE = 0.02;   // 버튼 윗면 가운데와 검지 끝이 이보다 가까우면 누름 (m)
const RELEASE_DISTANCE = 0.04; // 누른 뒤 이보다 멀어지면 뗌 (m)
const BUTTON_RADIUS = 0.03;    // 버튼 반지름 (m)
const BUTTON_HEIGHT = 0.02;    // 버튼 높이 (m). 엔티티 위치가 버튼 바닥이다

AFRAME.registerComponent('press-button', {
  schema: {
    left: { type: 'selector' },     // 왼손 엔티티
    right: { type: 'selector' },    // 오른손 엔티티
    label: { default: 'SAVE' },     // 버튼 위 글자. 기본 글꼴에 한글이 없어서 영어로 쓴다
    color: { default: '#2A9D8F' },  // 버튼 색. 짙은 책상, 흰 로봇, 자홍색 선과 구분되는 청록색
  },

  init() {
    this.pressed = false;                 // 지금 눌려 있는지
    this.topCenter = new THREE.Vector3(); // 버튼 윗면 가운데의 장면 좌표. tick에서 매 프레임 구한다

    // 버튼 모양. 원리와 상관없는 표시라 AI가 짰다.
    this.buttonMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(BUTTON_RADIUS, BUTTON_RADIUS, BUTTON_HEIGHT, 32),
      new THREE.MeshStandardMaterial({ color: this.data.color, roughness: 0.6 })
    );
    this.buttonMesh.position.y = BUTTON_HEIGHT / 2; // 원기둥 기준점이 가운데라 바닥이 엔티티 위치에 오게 올린다
    this.el.setObject3D('mesh', this.buttonMesh);
    this.topPoint = new THREE.Object3D();          // 버튼 윗면 가운데를 가리키는 보이지 않는 점
    this.topPoint.position.y = BUTTON_HEIGHT;
    this.el.object3D.add(this.topPoint);
    this.looksPressed = false;                     // 화면에 지금 눌린 모양으로 보이는지

    // 버튼 위 글자 판. 사용자 쪽으로 조금 기울인다
    this.labelEl = document.createElement('a-entity');
    this.labelEl.setAttribute('position', { x: 0, y: BUTTON_HEIGHT + 0.04, z: 0 });
    this.labelEl.setAttribute('rotation', { x: -30, y: 0, z: 0 });
    this.el.appendChild(this.labelEl);
  },

  update() {
    // 책상이 짙어서 글자는 흰색으로 쓴다
    this.labelEl.setAttribute('text', { value: this.data.label, align: 'center', color: '#FFFFFF', width: 0.6 });
  },

  remove() {
    this.el.removeObject3D('mesh');
    this.el.object3D.remove(this.topPoint);
    this.labelEl.remove();
  },

  tick() {
    // 버튼이 책상의 자식이라 윗면 가운데를 장면 좌표로 바꿔 둔다
    this.topPoint.getWorldPosition(this.topCenter);

    // 양손 중 버튼에 더 가까운 검지 끝 하나만 판정에 넘긴다.
    // 손마다 판정하면 멀리 있는 손이 방금 누른 버튼을 바로 떼어 버린다
    let nearestFingertip = null;
    for (const handEl of [this.data.left, this.data.right]) {
      const handTracking = handEl && handEl.components['hand-tracking-controls'];
      if (!handTracking || !handTracking.hasPoses) continue;
      const fingertip = handTracking.indexTipPosition;
      if (!nearestFingertip || distance(fingertip, this.topCenter) < distance(nearestFingertip, this.topCenter)) {
        nearestFingertip = fingertip;
      }
    }
    if (nearestFingertip) this.checkPress(nearestFingertip);

    // 눌린 상태가 바뀌었을 때만 모양을 바꾼다
    if (this.looksPressed !== this.pressed) this.setPressedLook(this.pressed);
  },

  // 검지 끝 위치 fingertip으로 누름과 뗌을 판정한다. 누른 순간에만 button-press를 보낸다.
  checkPress(fingertip) {
    // 1단계: 검지 끝과 버튼 윗면 가운데(this.topCenter) 사이 거리를 구함
    const fingertipDist = distance(fingertip, this.topCenter);

    // 2단계: 안 눌린 상태에서 PRESS_DISTANCE보다 가까우면 눌림으로 바꾸고 button-press를 보냄
    if(!this.pressed && fingertipDist < PRESS_DISTANCE) {
      this.pressed = true;
      this.el.emit('button-press');
    // 3단계: 눌린 상태에서 RELEASE_DISTANCE보다 멀어지면 뗌으로 바꿈
    } else if(this.pressed && fingertipDist > RELEASE_DISTANCE) {
      this.pressed = false;
    }

  },

  // 눌렸을 때는 버튼을 반쯤 내려가게 하고 밝게 한다. AI가 짰다.
  setPressedLook(pressed) {
    this.buttonMesh.scale.y = pressed ? 0.5 : 1;
    this.buttonMesh.position.y = (BUTTON_HEIGHT * this.buttonMesh.scale.y) / 2;
    this.buttonMesh.material.color.set(pressed ? '#8FD3C7' : this.data.color);
    this.looksPressed = pressed;
  },
});
