import AFRAME from 'aframe';
import * as THREE from 'three';

// PC에서 처음 열 때 카메라가 바라보는 각도를 정한다. 단위는 도.
// look-controls는 시작할 때 카메라 rotation 속성을 무시하고 0도에서 시작해서, 마우스 회전을 담는 내부 값(pitchObject, yawObject)을 직접 정한다.
// 이 내부 값은 A-Frame 1.8.0 look-controls 소스에서 확인했다. 버전을 바꾸면 다시 확인한다.
// VR에서는 look-controls가 머리 방향을 그대로 쓰므로 이 값은 영향이 없다.
AFRAME.registerComponent('start-view', {
  dependencies: ['look-controls'], // look-controls가 먼저 준비된 뒤에 init이 불리게 한다

  schema: {
    pitch: { default: 0 }, // 위아래 각도. 음수면 내려다본다 (도)
    yaw: { default: 0 },   // 좌우 각도. 양수면 왼쪽을 본다 (도)
  },

  init() {
    const lookControls = this.el.components['look-controls'];
    lookControls.pitchObject.rotation.x = THREE.MathUtils.degToRad(this.data.pitch);
    lookControls.yawObject.rotation.y = THREE.MathUtils.degToRad(this.data.yaw);
  },
});
