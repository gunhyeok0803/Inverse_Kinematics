// 진입점. aframe을 먼저 불러오고 컴포넌트 파일을 차례로 불러온다.
// 컴포넌트 등록은 장면이 시작되기 전에 끝나야 하므로 모두 여기서 import 한다.
import 'aframe';
import './components/env-info.js';
import './components/axes-helper.js';
import './components/desk.js';
import './components/spin.js';
import './components/hand-info.js';
import './components/robot-pose.js';
import './components/robot-mvp.js';
import './components/tool-draw.js';
import './components/press-button.js';
import './components/tool-log.js';
import './components/start-view.js';
import './components/joint-axes.js';
import './components/vr-exit-button.js';