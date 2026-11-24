import AFRAME from 'aframe';
import * as THREE from 'three';

// 로봇 MVP. 공구 끝(모델의 tcp 노드) 근처에서 핀치하면 잡히고, 집고 있는 동안 손을 따라 공구 끝이 움직인다.
// AI가 만든 기준 코드다. 5~6주에 직접 짤 CCD와 Jacobian IK를 이 결과와 비교한다.
// IK는 위치만 맞추는 CCD이고 joint1~joint5만 돌린다. joint6은 공구를 감는 축이라 위치에 영향이 없다.
// 핀치 위치는 reference space 기준이다. #rig가 원점에 있어서 장면 좌표와 같다고 본다.
const JOINT_AXES = { 1: 'y', 2: 'x', 3: 'x', 4: 'x', 5: 'z' };
const AXIS_VECTORS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const JOINT_LIMIT = THREE.MathUtils.degToRad(170); // 관절 회전 범위 ±170°
const DESK_CLEARANCE = 0.03; // 공구 끝이 책상 윗면에서 이만큼 위로만 가게 한다 (m)

AFRAME.registerComponent('robot-mvp', {
  schema: {
    left: { type: 'selector' },    // 왼손 엔티티
    right: { type: 'selector' },   // 오른손 엔티티
    desk: { type: 'selector' },    // 책상 엔티티. 공구 끝이 책상을 뚫지 않게 높이를 읽는다
    grabRadius: { default: 0.08 }, // 공구 끝에서 이 거리 안에서 핀치하면 잡힌다 (m)
    iterations: { default: 12 },   // 한 번 움직일 때 CCD 반복 횟수
  },

  init() {
    this.joints = null;
    this.tcp = null;
    this.grabbingHand = null;              // 지금 잡고 있는 손 엔티티
    this.grabOffset = new THREE.Vector3(); // 잡은 순간 공구 끝과 핀치 위치의 차이
    this.target = new THREE.Vector3();     // IK에 넘기는 목표점

    // 계산용 그릇
    this.tcpPosition = new THREE.Vector3();
    this.jointPosition = new THREE.Vector3();
    this.jointAxis = new THREE.Vector3();
    this.jointToTcp = new THREE.Vector3();
    this.jointToTarget = new THREE.Vector3();
    this.crossProduct = new THREE.Vector3();
    this.parentRotation = new THREE.Quaternion();

    this.onLoaded = () => this.setupModel();
    this.el.addEventListener('model-loaded', this.onLoaded);
    if (this.el.getObject3D('mesh')) this.setupModel();

    this.onPinchStart = (evt) => {
      if (!this.tcp || this.grabbingHand) return;
      const pinchPosition = evt.detail.position.clone(); // A-Frame이 detail 객체를 다시 쓰므로 복사한다
      this.tcp.getWorldPosition(this.tcpPosition);
      if (pinchPosition.distanceTo(this.tcpPosition) > this.data.grabRadius) return;
      this.grabbingHand = evt.currentTarget;
      this.grabOffset.subVectors(this.tcpPosition, pinchPosition);
      this.setGrabHandleLook(true);
      // 잡은 순간의 공구 끝과 핀치 위치를 장면 좌표로 알린다. 받는 쪽이 저장해도 되도록 복사본을 보낸다
      this.el.emit('tool-grab', { toolTipPosition: this.tcpPosition.clone(), handPosition: pinchPosition });
    };
    this.onPinchMove = (evt) => {
      if (evt.currentTarget !== this.grabbingHand) return;
      this.target.copy(evt.detail.position).add(this.grabOffset);
      this.target.y = Math.max(this.target.y, this.minTargetHeight());
      this.solve(this.target);
      // IK가 끝난 뒤 공구 끝이 실제로 간 위치와 이번 프레임의 핀치 위치를 알린다.
      // 목표점에 못 닿으면 공구 끝은 목표점과 다를 수 있다. 핀치 위치는 A-Frame이 다시 쓰는 객체라 복사한다
      this.tcp.getWorldPosition(this.tcpPosition);
      this.el.emit('tool-move', { toolTipPosition: this.tcpPosition.clone(), handPosition: evt.detail.position.clone() });
    };
    this.onPinchEnd = (evt) => {
      if (evt.currentTarget !== this.grabbingHand) return;
      this.grabbingHand = null;
      this.setGrabHandleLook(false);
      this.el.emit('tool-release');
    };
    for (const handEl of [this.data.left, this.data.right]) {
      if (!handEl) continue;
      handEl.addEventListener('pinchstarted', this.onPinchStart);
      handEl.addEventListener('pinchmoved', this.onPinchMove);
      handEl.addEventListener('pinchended', this.onPinchEnd);
    }
  },

  remove() {
    this.el.removeEventListener('model-loaded', this.onLoaded);
    for (const handEl of [this.data.left, this.data.right]) {
      if (!handEl) continue;
      handEl.removeEventListener('pinchstarted', this.onPinchStart);
      handEl.removeEventListener('pinchmoved', this.onPinchMove);
      handEl.removeEventListener('pinchended', this.onPinchEnd);
    }
    if (this.grabHandle && this.grabHandle.parent) this.grabHandle.parent.remove(this.grabHandle);
  },

  // 모델에서 관절과 공구 끝을 찾고 공구 끝에 잡는 손잡이 공을 붙인다.
  setupModel() {
    const model = this.el.getObject3D('mesh');
    this.joints = [1, 2, 3, 4, 5].map((i) => model.getObjectByName(`joint${i}`));
    this.tcp = model.getObjectByName('tcp');
    if (this.grabHandle) return;
    this.grabHandle = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#FF8A3D', transparent: true, opacity: 0.85, roughness: 0.5 })
    );
    this.tcp.add(this.grabHandle);
  },

  // 잡았을 때는 손잡이 공을 키우고 더 밝게 한다.
  setGrabHandleLook(grabbed) {
    if (!this.grabHandle) return;
    this.grabHandle.scale.setScalar(grabbed ? 1.4 : 1);
    this.grabHandle.material.color.set(grabbed ? '#FFB27A' : '#FF8A3D');
    this.grabHandle.material.opacity = grabbed ? 1 : 0.85;
  },

  // 공구 끝이 책상을 뚫지 않도록 목표점 높이의 아래 한계를 정한다.
  minTargetHeight() {
    const desk = this.data.desk;
    const deskHeight = desk && desk.components.desk ? desk.components.desk.data.height : 0;
    return deskHeight + DESK_CLEARANCE;
  },

  // 위치만 맞추는 CCD. 끝 관절부터 하나씩, 공구 끝이 목표 쪽을 보도록 그 관절 축으로 돌린다.
  solve(target) {
    for (let iteration = 0; iteration < this.data.iterations; iteration++) {
      for (let jointIndex = this.joints.length - 1; jointIndex >= 0; jointIndex--) {
        const joint = this.joints[jointIndex];
        const axisName = JOINT_AXES[jointIndex + 1];

        // 관절 축을 장면 좌표로 바꾼다. 한 축으로만 도는 노드라 부모 회전을 곱하면 된다.
        joint.parent.getWorldQuaternion(this.parentRotation);
        this.jointAxis.copy(AXIS_VECTORS[axisName]).applyQuaternion(this.parentRotation).normalize();
        joint.getWorldPosition(this.jointPosition);
        this.tcp.getWorldPosition(this.tcpPosition);

        // 두 방향을 축에 수직인 평면에 내린 뒤 그 사이 각을 부호까지 구한다.
        this.jointToTcp.subVectors(this.tcpPosition, this.jointPosition).projectOnPlane(this.jointAxis);
        this.jointToTarget.subVectors(target, this.jointPosition).projectOnPlane(this.jointAxis);
        if (this.jointToTcp.lengthSq() < 1e-10 || this.jointToTarget.lengthSq() < 1e-10) continue;
        this.crossProduct.crossVectors(this.jointToTcp, this.jointToTarget);
        const angle = Math.atan2(this.crossProduct.dot(this.jointAxis), this.jointToTcp.dot(this.jointToTarget));

        joint.rotation[axisName] = THREE.MathUtils.clamp(joint.rotation[axisName] + angle, -JOINT_LIMIT, JOINT_LIMIT);
        joint.updateMatrixWorld(true);
      }
      this.tcp.getWorldPosition(this.tcpPosition);
      if (this.tcpPosition.distanceTo(target) < 0.001) break;
    }
  },
});
