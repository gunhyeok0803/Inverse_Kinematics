# WebXR IK

Meta Quest에서 컨트롤러 없이 맨손 핀치로 3D 로봇 팔 끝을 잡고 일반 조작과 정밀 조작의 차이를 수치로 보이는 A-Frame 웹 과제다.
같은 GitHub Pages 주소를 Quest Browser(맨손)와 PC 브라우저(마우스)에서 연다.

## 실행

PC에서 확인할 때는 아래 둘 중 하나로 연다. 파일을 더블클릭해서 열면 모듈을 불러오지 못한다.

- VS Code Live Server: index.html을 연 뒤 오른쪽 아래 Go Live
- 터미널: 이 폴더에서 `python -m http.server 5500` 후 http://localhost:5500

Quest에서는 https 주소가 필요하므로 GitHub Pages 주소로 연다.

## 구성

```
index.html              importmap(A-Frame 1.8.0, three r184)과 장면
js/main.js              aframe과 컴포넌트를 불러오는 진입점
js/components/          A-Frame 컴포넌트, 파일 하나에 컴포넌트 하나
js/lib/                 장면과 상관없는 계산 함수(2주부터)
```

| 컴포넌트 | 주차 | 역할 |
|---|---|---|
| env-info | 1 | 버전, three 한 벌 여부, 보안 연결, VR 지원 여부 표시 |
| desk | 1 | 책상(윗판, 다리)을 만들고 로봇 장착점을 윗면 뒤쪽에 놓음 |
| axes-helper | 1 | 엔티티의 좌표축 표시(빨강 x, 초록 y, 파랑 z) |
| input-logger | 1 | 핀치 이벤트와 손 관절 위치 표시 |
| stroke-draw | 2 | 핀치하는 동안 손끝 궤적을 선으로 그리고 CSV 저장 |
| poke-button | 2 | 검지로 누르는 가상 버튼 |
| pinch-grab | 3 | 핀치로 물체 잡기, 놓기 보정 |
| precision-move | 4 | 속도 기반 이득과 EMA |
| robot-arm | 5 | URDF 로봇 팔 불러오기 |
| ik-solver | 5, 6 | CCD, 의사역행렬, DLS |
| perf-logger | 6 | IK 계산 시간과 FPS 기록 |

## 장면 배치

단위는 m이고 사용자는 시작 위치(0, 0, 0)에서 -z 방향을 본다. Quest에서는 높이 0이 실제 바닥이다.

| 항목 | 값 |
|---|---|
| 바닥 | 4 x 4 |
| 책상 | 가로 1.2, 깊이 0.8, 높이 0.75, 앞 모서리 z = -0.35 |
| 로봇 장착점 | 윗면 뒤쪽 가운데, 뒤 모서리에서 0.2, 장면 기준 (0, 0.75, -0.95) |

책상 치수는 index.html의 desk 속성에서만 바꾼다. 장착점은 desk가 다시 계산하므로 로봇은 늘 윗면 위에 있다.
5주에 robot-arm 엔티티를 `#robot-mount` 안에 넣는다. URDF는 z가 위쪽이고 A-Frame은 y가 위쪽이라 x축 -90° 회전이 필요하다.

## 알아 둘 것

- A-Frame 기본 글꼴에는 한글이 없다. 장면 안 글자는 영어로 쓴다.
- A-Frame에는 grabbable 컴포넌트가 이미 있어서 직접 만드는 잡기 컴포넌트는 pinch-grab이다.
- three는 `import * as THREE from 'three'`로 불러온다. importmap 덕분에 A-Frame 안의 three와 같은 객체다(env-info 판의 one three instance로 확인).
