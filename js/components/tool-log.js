import AFRAME from 'aframe';

// 로봇 공구 끝을 끄는 동안 손과 공구 끝 위치를 시간과 함께 기록한다.
// 4주에 손이 얼마나 떨리고 빠르게 움직이는지 재서 정밀 모드의 기준을 정할 때 이 기록을 쓴다.
// 위치는 robot-mvp가 보내는 tool-grab, tool-move 이벤트로 받는다.
// detail.toolTipPosition은 공구 끝, detail.handPosition은 핀치 위치이고 둘 다 장면 좌표의 복사본이다.
// tool-draw와 달리 가까운 점을 거르지 않고 오는 대로 모두 남긴다. pinchmoved가 매 프레임 오므로 매 프레임 한 행이다.
// 가상 버튼을 누르면 지금까지의 기록 전부를 CSV 파일로 내려받는다. 내려받아도 기록은 지우지 않는다.

AFRAME.registerComponent('tool-log', {
  schema: {
    robot: { type: 'selector' },  // 공구 끝 이벤트를 보내는 로봇 엔티티(robot-mvp가 붙은 것)
    button: { type: 'selector' }, // 누르면 기록을 내려받는 가상 버튼 엔티티(press-button이 붙은 것)
  },

  init() {
    this.rows = [];      // 기록 행을 담는 배열. 행 하나가 { time, dragNumber, eventType, handPosition, toolTipPosition } 모양의 객체 하나다
    this.dragNumber = 0; // 끌기 번호. 공구 끝을 잡아서 놓을 때까지가 끌기 한 번이고 잡을 때마다 1씩 늘린다

    // 로봇과 버튼이 보내는 이벤트를 아래 함수로 넘긴다
    this.onGrab = (evt) => this.toolGrab(evt);
    this.onMove = (evt) => this.toolMove(evt);
    this.onPress = () => this.save();
    const { robot, button } = this.data;
    if (robot) {
      robot.addEventListener('tool-grab', this.onGrab);
      robot.addEventListener('tool-move', this.onMove);
    }
    if (button) button.addEventListener('button-press', this.onPress);
  },

  remove() {
    const { robot, button } = this.data;
    if (robot) {
      robot.removeEventListener('tool-grab', this.onGrab);
      robot.removeEventListener('tool-move', this.onMove);
    }
    if (button) button.removeEventListener('button-press', this.onPress);
  },

  // 공구 끝을 잡은 순간.
  toolGrab(evt) {
    // 1단계: 끌기 번호를 하나 늘림
    this.dragNumber++;

    // 2단계: 잡은 순간의 위치를 'grab' 행으로 기록
    this.addRow('grab', evt.detail);

  },

  // 공구 끝을 끄는 동안 매 프레임.
  toolMove(evt) {
    // 1단계: 이번 프레임의 위치를 'move' 행으로 기록
    this.addRow('move', evt.detail);

  },

  // 기록 행 하나를 rows 끝에 더한다. eventType은 'grab'이나 'move', detail은 이벤트의 detail이다.
  addRow(eventType, detail) {
    // 1단계: 지금 시각을 ms로 구함
    const time = performance.now();
    // 2단계: 시각, 끌기 번호, 종류, 손 위치, 공구 끝 위치를 객체 하나로 묶어 rows 끝에 넣음
    this.rows.push({ time, dragNumber: this.dragNumber, eventType, handPosition: detail.handPosition, toolTipPosition: detail.toolTipPosition });

  },

  // 버튼을 눌렀을 때. 지금까지의 기록을 CSV 파일로 내려받는다.
  save() {
    // 1단계: 기록이 없으면 아무것도 하지 않음
    if (this.rows.length === 0) return;
    // 2단계: toCSV로 기록을 글자로 바꾸고 fileName으로 만든 이름과 함께 download에 넘김
    this.download(this.fileName(), this.toCSV());
    // 3단계: 버튼 글자를 저장한 행 수로 바꿔 VR 안에서도 저장된 것을 보이게 함
    const button = this.data.button;
    if (button) button.setAttribute('press-button', 'label', `SAVED ${this.rows.length} rows`);

  },

  // 아래 세 함수는 파일을 만드는 틀이라 AI가 짬.

  // rows를 CSV 글자로 바꾼다. 첫 행은 열 이름이고 그다음부터 기록 행 하나가 파일의 한 줄이다. 시각은 ms, 위치는 m 단위로 소수 다섯째 자리(0.01 mm)까지 쓴다.
  toCSV() {
    const toFiveDecimals = (number) => number.toFixed(5);
    const lines = ['time_ms,drag_number,event_type,hand_x,hand_y,hand_z,tool_tip_x,tool_tip_y,tool_tip_z'];
    for (const row of this.rows) {
      const hand = row.handPosition;
      const toolTip = row.toolTipPosition;
      lines.push([row.time.toFixed(1), row.dragNumber, row.eventType,
        toFiveDecimals(hand.x), toFiveDecimals(hand.y), toFiveDecimals(hand.z),
        toFiveDecimals(toolTip.x), toFiveDecimals(toolTip.y), toFiveDecimals(toolTip.z)].join(','));
    }
    return lines.join('\n');
  },

  // 지금 날짜와 시각으로 파일 이름을 만든다. 예: tool-log-20261124-153012.csv
  fileName() {
    const now = new Date();
    const twoDigits = (number) => String(number).padStart(2, '0');
    const day = `${now.getFullYear()}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}`;
    const time = `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
    return `tool-log-${day}-${time}.csv`;
  },

  // 글자 text를 filename이라는 파일로 내려받는다.
  // 글자를 파일 덩어리(Blob)로 만들고 그 주소를 가진 링크를 코드로 눌러 브라우저가 내려받게 한다.
  download(filename, text) {
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // 내려받기가 시작된 뒤 주소를 정리한다
  },
});
