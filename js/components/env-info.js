import AFRAME from 'aframe';
import * as THREE from 'three';

// 환경 확인 판.
// A-Frame과 three 버전, three를 한 벌만 쓰는지, 보안 연결인지, VR을 지원하는지 장면 안에 쓴다.
// A-Frame 기본 글꼴에는 한글이 없어서 장면 안 글자는 영어로 쓴다.
AFRAME.registerComponent('env-info', {
  init() {
    // this는 이 컴포넌트 객체이고 this.el은 컴포넌트가 붙은 엔티티다.
    this.lines = {
      aframe: `A-Frame ${AFRAME.version}`,
      three: `three r${THREE.REVISION}`,
      // importmap이 제대로 되면 A-Frame 안의 three와 내가 import한 three가 같은 클래스를 쓴다.
      // AFRAME.THREE는 three를 복사한 객체라서 객체끼리가 아니라 클래스끼리 비교한다.
      shared: `one three instance: ${AFRAME.THREE.Object3D === THREE.Object3D ? 'yes' : 'NO'}`,
      // WebXR은 https 또는 localhost에서만 열린다. Quest에서는 GitHub Pages 주소로 연다.
      secure: `secure context: ${window.isSecureContext ? 'yes' : 'NO (use https)'}`,
      vr: 'immersive-vr: checking...',
    };
    this.render();

    if (!navigator.xr) {
      this.lines.vr = 'immersive-vr: no WebXR';
      this.render();
      return;
    }
    navigator.xr.isSessionSupported('immersive-vr')
      .then((ok) => { this.lines.vr = `immersive-vr: ${ok ? 'yes' : 'no'}`; })
      .catch(() => { this.lines.vr = 'immersive-vr: error'; })
      .finally(() => this.render());
  },

  render() {
    this.el.setAttribute('text', {
      value: Object.values(this.lines).join('\n'),
      align: 'center',
      color: '#222',
      width: 1.4,
    });
  },
});
