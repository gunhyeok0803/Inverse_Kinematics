import AFRAME from 'aframe';
import * as THREE from 'three';

// 로봇 관절마다 좌표축을 띄우고 공구 끝 아래에 장면 좌표를 글자로 띄운다. 빨강 x, 초록 y, 파랑 z.
// 관절이 어느 축으로 도는지 눈으로 확인하는 표시 도구라 AI가 짰다. 회전축은 joint1 y, joint2~4 x, joint5 z, joint6 y.
// 좌표축은 각 관절 노드의 자식이라 관절과 같이 돌고, 로봇 몸체에 가려도 보이게 맨 위에 그린다.
// 글자는 장면에 바로 붙여 로봇과 같이 돌지 않게 하고 매번 카메라 쪽을 보게 한다.
const NODE_NAMES = ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6', 'tcp'];
const LABEL_DROP = 0.07; // 공구 끝에서 글자까지 내려간 거리 (m). 공구가 아래를 보고 있어서 위에 두면 손목을 가린다

AFRAME.registerComponent('joint-axes', {
  schema: {
    size: { default: 0.08 },        // 좌표축 길이 (m)
    showToolTip: { default: true }, // 공구 끝 장면 좌표 글자를 띄울지
  },

  init() {
    this.axesHelpers = [];
    this.toolTip = null;
    this.toolTipPosition = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();

    // 공구 끝 좌표 글자. 짙은 책상과 밝은 벽 어느 쪽에서도 읽히게 반투명 검은 판 위에 흰 글자로 쓴다
    this.labelEl = document.createElement('a-entity');
    this.labelEl.setAttribute('text', { value: '', align: 'center', color: '#FFFFFF', width: 0.5 });
    const background = document.createElement('a-plane');
    background.setAttribute('width', 0.24);
    background.setAttribute('height', 0.045);
    background.setAttribute('position', { x: 0, y: 0, z: -0.002 });
    background.setAttribute('material', { color: '#222222', opacity: 0.7, transparent: true });
    this.labelEl.appendChild(background);
    this.el.sceneEl.appendChild(this.labelEl);

    this.onLoaded = () => this.attachAxes();
    this.el.addEventListener('model-loaded', this.onLoaded);
    if (this.el.getObject3D('mesh')) this.attachAxes();

    // 글자는 1초에 열 번이면 충분하다
    this.tick = AFRAME.utils.throttleTick(this.tick, 100, this);
  },

  remove() {
    this.el.removeEventListener('model-loaded', this.onLoaded);
    for (const helper of this.axesHelpers) {
      helper.parent.remove(helper);
      helper.dispose();
    }
    this.labelEl.remove();
  },

  // 모델에서 관절과 공구 끝 노드를 찾아 좌표축을 붙인다.
  attachAxes() {
    const model = this.el.getObject3D('mesh');
    if (!model || this.axesHelpers.length > 0) return;
    for (const name of NODE_NAMES) {
      const node = model.getObjectByName(name);
      if (!node) continue;
      const helper = new THREE.AxesHelper(this.data.size);
      helper.material.depthTest = false; // 로봇 몸체에 가려도 보이게 한다
      helper.renderOrder = 1;
      node.add(helper);
      this.axesHelpers.push(helper);
    }
    this.toolTip = model.getObjectByName('tcp');
  },

  // 공구 끝 장면 좌표를 글자로 바꾸고 글자가 카메라를 보게 한다.
  tick() {
    const visible = Boolean(this.toolTip) && this.data.showToolTip;
    this.labelEl.object3D.visible = visible;
    if (!visible) return;
    const position = this.toolTipPosition;
    this.toolTip.getWorldPosition(position);
    this.labelEl.object3D.position.set(position.x, position.y - LABEL_DROP, position.z);
    this.el.sceneEl.camera.getWorldPosition(this.cameraPosition);
    this.labelEl.object3D.lookAt(this.cameraPosition);
    this.labelEl.setAttribute('text', 'value', `${position.x.toFixed(3)}  ${position.y.toFixed(3)}  ${position.z.toFixed(3)}`);
  },
});
