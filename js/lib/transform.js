// 좌표 변환 계산. 장면과 상관없이 숫자만 다루므로 컴포넌트와 따로 둔다.
// 4x4 동차 행렬은 행마다 배열 하나씩, 배열 4개를 담은 배열로 다룬다. 점은 (x, y, z, 1)로 보고 곱한다.
// 지금은 y축 회전과 이동만 만든다. 여러 겹 곱하기(사이클 3), 역행렬(3주), 관절 FK(5주)에서 이 행렬을 이어 쓴다.

// 부모가 position에 있고 y축으로 angleDegrees도 돌았을 때의 4x4 변환 행렬을 만든다.
// 왼쪽 위 3x3은 y축 회전(그래픽스 수업의 R_y)이고 마지막 열은 부모 위치다.
// position은 x, y, z를 가진 객체다.
export function makeTransformY(angleDegrees, position) {
  // 1단계: 각도를 라디안으로 바꾸고 cos, sin을 구함
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // 2단계: 4x4 행렬을 행마다 배열 하나로 만들어 돌려줌
  //        [cos, 0, sin, x], [0, 1, 0, y], [-sin, 0, cos, z], [0, 0, 0, 1]
  return [
    [cos, 0, sin, position.x],
    [0, 1, 0, position.y],
    [-sin, 0, cos, position.z],
    [0, 0, 0, 1],
  ];
}

// 4x4 행렬 matrix에 점 point를 곱해 변환된 점을 { x, y, z }로 돌려준다.
// point는 x, y, z를 가진 객체이고 넷째 칸은 1로 본다.
export function transformPoint(matrix, point) {
  // 1단계: 점을 [x, y, z, 1] 배열로 만듦
  const pointArray = [point.x, point.y, point.z, 1];

  // 2단계: 행렬의 0, 1, 2번 행마다 네 칸과 점의 네 칸을 차례로 곱해 더함
  const transformed = [];
  for (let i = 0; i < 3; i++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      sum += matrix[i][j] * pointArray[j];
    }
    transformed.push(sum);
  }

  // 3단계: { x, y, z }로 돌려줌
  return { x: transformed[0], y: transformed[1], z: transformed[2] };
}

// 4x4 행렬 a와 b를 곱한 4x4 행렬 a × b를 돌려준다. a가 부모 쪽, b가 자식 쪽이다.
// 예: 로봇의 장면 행렬 = multiplyMatrices(multiplyMatrices(M책상, M장착점), M로봇)
export function multiplyMatrices(a, b) {
  // 1단계: 결과를 담을 4x4 행렬을 만듦
  const result = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  // 2단계: 결과의 행 번호와 열 번호마다 a의 그 행과 b의 그 열을 네 칸씩 곱해 더해서 채움
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i][k] * b[k][j];
      }
      result[i][j] = sum;
    }
  // 3단계: 결과를 돌려줌
  }
  return result;
}

