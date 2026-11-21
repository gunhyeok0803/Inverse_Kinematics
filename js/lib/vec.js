// 벡터 계산 함수. 장면과 상관없이 숫자만 다루므로 컴포넌트와 따로 둔다.
// a, b는 x, y, z를 가진 객체다. THREE.Vector3를 넣어도 된다.

// 두 점 a, b 사이 거리를 구한다.
export function distance(a, b) {
  // 1단계: 두 점 사이 칸마다 차이
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  // 2단계: 제곱근을 씌워 길이를 구함
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}