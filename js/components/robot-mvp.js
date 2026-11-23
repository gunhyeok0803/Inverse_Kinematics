import AFRAME from 'aframe';
import * as THREE from 'three';

// 로봇 MVP. 공구 끝(tcp) 근처에서 핀치하면 잡히고, 집고 있는 동안 손을 따라 공구 끝이 움직인다.
// AI가 만든 기준 코드다. 5~6주에 직접 짤 CCD와 Jacobian IK를 이 결과와 비교한다.
// IK는 위치만 맞추는 CCD이고 joint1~joint5만 돌린다. joint6은 공구를 감는 축이라 위치에 영향이 없다.
// 핀치 위치는 reference space 기준이다. #rig가 원점에 있어서 장면 좌표와 같다고 본다.
const AXES = { 1: 'y', 2: 'x', 3: 'x', 4: 'x', 5: 'z' };
const AXIS_VEC = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const LIMIT = THREE.MathUtils.degToRad(170); // 관절 회전 범위 ±170°

AFRAME.registerComponent('robot-mvp', {
  schema: {
    left: { type: 'selector' },   // 왼손 엔티티
    right: { type: 'selector' },  // 오른손 엔티티
    grabRadius: { default: 0.08 }, // 공구 끝에서 이 거리 안에서 핀치하면 잡힌다 (m)
    iterations: { default: 12 },  // 한 번 움직일 때 CCD 반복 횟수
  },

  init() {
    this.joints = null;
    this.tcp = null;
    this.grabHand = null;              // 지금 잡고 있는 손 엔티티
    this.offset = new THREE.Vector3(); // 잡은 순간 공구 끝과 핀치 위치의 차이
    this.target = new THREE.Vector3();

    // 계산용 그릇
    this.tcpPos = new THREE.Vector3();
    this.pivot = new THREE.Vector3();
    this.axis = new THREE.Vector3();
    this.toTcp = new THREE.Vector3();
    this.toTarget = new THREE.Vector3();
    this.cross = new THREE.Vector3();
    this.parentQuat = new THREE.Quaternion();

    this.onLoaded = () => this.setupModel();
    this.el.addEventListener('model-loaded', this.onLoaded);
    if (this.el.getObject3D('mesh')) this.setupModel();

    this.onStart = (evt) => {
      if (!this.tcp || this.grabHand) return;
      const pinch = evt.detail.position.clone(); // A-Frame이 detail 객체를 다시 쓰므로 복사한다
      this.tcp.getWorldPosition(this.tcpPos);
      if (pinch.distanceTo(this.tcpPos) > this.data.grabRadius) return;
      this.grabHand = evt.currentTarget;
      this.offset.subVectors(this.tcpPos, pinch);
      this.setHandle(true);
      // 다른 컴포넌트가 쓸 수 있게 잡은 순간의 공구 끝 장면 좌표를 알린다. 받는 쪽이 저장해도 되도록 복사본을 보낸다
      this.el.emit('tool-grab', { position: this.tcpPos.clone() });
    };
    this.onMove = (evt) => {
      if (evt.currentTarget !== this.grabHand) return;
      this.target.copy(evt.detail.position).add(this.offset);
      this.target.y = Math.max(this.target.y, this.minY());
      this.solve(this.target);
      // IK가 끝난 뒤 공구 끝이 실제로 간 장면 좌표를 알린다. 목표점에 못 닿으면 목표점과 다를 수 있다
      this.tcp.getWorldPosition(this.tcpPos);
      this.el.emit('tool-move', { position: this.tcpPos.clone() });
    };
    this.onEnd = (evt) => {
      if (evt.currentTarget !== this.grabHand) return;
      this.grabHand = null;
      this.setHandle(false);
      this.el.emit('tool-release');
    };
    for (const handEl of [this.data.left, this.data.right]) {
      if (!handEl) continue;
      handEl.addEventListener('pinchstarted', this.onStart);
      handEl.addEventListener('pinchmoved', this.onMove);
      handEl.addEventListener('pinchended', this.onEnd);
    }
  },

  remove() {
    this.el.removeEventListener('model-loaded', this.onLoaded);
    for (const handEl of [this.data.left, this.data.right]) {
      if (!handEl) continue;
      handEl.removeEventListener('pinchstarted', this.onStart);
      handEl.removeEventListener('pinchmoved', this.onMove);
      handEl.removeEventListener('pinchended', this.onEnd);
    }
    if (this.handle && this.handle.parent) this.handle.parent.remove(this.handle);
  },

  // 모델에서 관절과 공구 끝을 찾고 공구 끝에 잡는 손잡이 공을 붙인다.
  setupModel() {
    const root = this.el.getObject3D('mesh');
    this.joints = [1, 2, 3, 4, 5].map((i) => root.getObjectByName(`joint${i}`));
    this.tcp = root.getObjectByName('tcp');
    if (this.handle) return;
    this.handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#FF8A3D', transparent: true, opacity: 0.85, roughness: 0.5 })
    );
    this.tcp.add(this.handle);
  },

  // 잡았을 때는 손잡이를 키우고 더 밝게 한다.
  setHandle(grabbed) {
    if (!this.handle) return;
    this.handle.scale.setScalar(grabbed ? 1.4 : 1);
    this.handle.material.color.set(grabbed ? '#FFB27A' : '#FF8A3D');
    this.handle.material.opacity = grabbed ? 1 : 0.85;
  },

  // 공구 끝이 책상을 뚫지 않도록 목표 높이의 아래 한계를 정한다.
  minY() {
    const desk = document.querySelector('#desk');
    const h = desk && desk.components.desk ? desk.components.desk.data.height : 0;
    return h + 0.03;
  },

  // 위치만 맞추는 CCD. 끝 관절부터 하나씩, 공구 끝이 목표 쪽을 보도록 그 관절 축으로 돌린다.
  solve(target) {
    for (let it = 0; it < this.data.iterations; it++) {
      for (let k = this.joints.length - 1; k >= 0; k--) {
        const joint = this.joints[k];
        const name = AXES[k + 1];

        // 관절 축을 장면 좌표로 바꾼다. 한 축으로만 도는 노드라 부모 회전을 곱하면 된다.
        joint.parent.getWorldQuaternion(this.parentQuat);
        this.axis.copy(AXIS_VEC[name]).applyQuaternion(this.parentQuat).normalize();
        joint.getWorldPosition(this.pivot);
        this.tcp.getWorldPosition(this.tcpPos);

        // 두 방향을 축에 수직인 평면에 내린 뒤 그 사이 각을 부호까지 구한다.
        this.toTcp.subVectors(this.tcpPos, this.pivot).projectOnPlane(this.axis);
        this.toTarget.subVectors(target, this.pivot).projectOnPlane(this.axis);
        if (this.toTcp.lengthSq() < 1e-10 || this.toTarget.lengthSq() < 1e-10) continue;
        this.cross.crossVectors(this.toTcp, this.toTarget);
        const angle = Math.atan2(this.cross.dot(this.axis), this.toTcp.dot(this.toTarget));

        joint.rotation[name] = THREE.MathUtils.clamp(joint.rotation[name] + angle, -LIMIT, LIMIT);
        joint.updateMatrixWorld(true);
      }
      this.tcp.getWorldPosition(this.tcpPos);
      if (this.tcpPos.distanceTo(target) < 0.001) break;
    }
  },
});
