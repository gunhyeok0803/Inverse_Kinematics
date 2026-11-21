import AFRAME from 'aframe';
import * as THREE from 'three';

// 로봇 모델의 관절 각도를 정한다. 단위는 도.
// 모델 파일(assets/models/symphony-like.glb)의 관절 노드 joint1~joint6을 돌린다.
// 회전축은 모델을 만들 때 정한 대로 joint1 y, joint2~4 x, joint5 z, joint6 y이고 모든 관절이 0이면 팔이 위로 곧게 선다.
const AXES = { 1: 'y', 2: 'x', 3: 'x', 4: 'x', 5: 'z', 6: 'y' };

AFRAME.registerComponent('robot-pose', {
  schema: {
    j1: { default: 0 },
    j2: { default: 0 },
    j3: { default: 0 },
    j4: { default: 0 },
    j5: { default: 0 },
    j6: { default: 0 },
  },

  init() {
    // 모델 파일은 나중에 도착하므로 불러와진 뒤 한 번 더 적용한다.
    this.onLoaded = () => this.update();
    this.el.addEventListener('model-loaded', this.onLoaded);
  },

  update() {
    const root = this.el.getObject3D('mesh');
    if (!root) return;
    for (let i = 1; i <= 6; i++) {
      const joint = root.getObjectByName(`joint${i}`);
      joint.rotation[AXES[i]] = THREE.MathUtils.degToRad(this.data[`j${i}`]);
    }
  },

  remove() {
    this.el.removeEventListener('model-loaded', this.onLoaded);
  },
});
