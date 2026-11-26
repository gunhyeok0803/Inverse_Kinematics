import AFRAME from 'aframe';

// VR에서 나가는 버튼. 같은 엔티티의 press-button이 보내는 button-press를 받으면 VR을 끝내고 브라우저 화면으로 돌아간다.
// Quest의 손바닥 메뉴 동작이 잘 먹지 않아서 장면 안에 둔다. 원리와 상관없는 틀이라 AI가 짰다.
AFRAME.registerComponent('vr-exit-button', {
  init() {
    this.onPress = () => {
      const scene = this.el.sceneEl;
      if (scene.is('vr-mode')) scene.exitVR(); // VR 안일 때만 끝낸다
    };
    this.el.addEventListener('button-press', this.onPress);
  },

  remove() {
    this.el.removeEventListener('button-press', this.onPress);
  },
});
