import AFRAME from 'aframe';

// 같은 엔티티의 press-button이 보내는 button-press를 받을 때마다 target 엔티티를 보였다 숨겼다 한다.
// 손 확인 판이 로봇 옆에 늘 떠 있으면 시연할 때 눈이 분산돼서 평소에는 숨겨 두고 필요할 때만 띄운다.
// 원리와 상관없는 틀이라 AI가 짰다.
AFRAME.registerComponent('visible-toggle', {
  schema: {
    target: { type: 'selector' }, // 보였다 숨겼다 할 엔티티
  },

  init() {
    this.onPress = () => {
      const target = this.data.target;
      if (!target) return;
      target.setAttribute('visible', !target.getAttribute('visible')); // 보이면 숨기고 숨어 있으면 보인다
    };
    this.el.addEventListener('button-press', this.onPress);
  },

  remove() {
    this.el.removeEventListener('button-press', this.onPress);
  },
});
