import AFRAME from 'aframe';
import * as THREE from 'three';

// 좌표축 표시. 빨강 x, 초록 y, 파랑 z.
// 엔티티의 기준점과 방향을 눈으로 확인할 때 붙인다(2주 좌표 변환, 5주 로봇 관절에서도 쓴다).
AFRAME.registerComponent('axes-helper', {
  schema: {
    size: { default: 0.2 }, // 축 길이 (m)
  },

  update() {
    this.remove();
    this.helper = new THREE.AxesHelper(this.data.size);
    this.el.setObject3D('axes', this.helper);
  },

  remove() {
    if (!this.helper) return;
    this.el.removeObject3D('axes');
    this.helper.dispose();
    this.helper = null;
  },
});
