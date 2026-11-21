import AFRAME from 'aframe';
import * as THREE from 'three';

// 엔티티를 y축으로 일정한 속도로 돌린다.
AFRAME.registerComponent('spin', {
  schema: {
    speed: { default: 90 }, // 1초에 도는 각도 (°)
  },

  tick(time, timeDelta) {
    // 1단계: 속도 * 시간 = 프레임 당 회전값 (프레임 시간은 tick 받는 timeDelta임 but, 단위가 ms라 초로 바꿔서)
    const framerotation = this.data.speed * timeDelta / 1000; 
    // 2단계: 프레임 당 회전값을 라디안으로 변환한 뒤 현재 엔티티 오브젝트의 y축 기준 회전을 더함.
    this.el.object3D.rotation.y += THREE.MathUtils.degToRad(framerotation);
  },
});