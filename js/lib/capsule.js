import * as THREE from 'three';

// 캡슐 계산. 캡슐은 선분 하나와 반지름으로 정한 모양이고 원기둥 양 끝에 반구를 붙인 모양과 같다.
// 선분까지의 거리가 반지름보다 가까운 점이 모두 캡슐 안이라서 거리 하나로 안팎을 판정할 수 있다.
// 로봇 몸을 캡슐 몇 개로 감싸서 공구 끝 목표점이 몸 안으로 들어가지 않게 할 때 쓴다. AI가 짰다.

// 선분 start~end 위에서 점 point와 가장 가까운 점을 돌려준다.
// 선분 위의 점은 (1 - weight) × start + weight × end로 쓸 수 있다. weight가 0이면 start, 1이면 end다.
// weight는 start에서 point로 가는 화살표를 선분 방향으로 내린 길이를 선분 길이로 나눈 값이고 내적으로 구한다.
// 선분 밖으로 나가지 않게 weight를 0~1로 자른다.
export function closestPointOnSegment(point, start, end) {
  const segment = new THREE.Vector3().subVectors(end, start);        // start에서 end로 가는 화살표
  const startToPoint = new THREE.Vector3().subVectors(point, start); // start에서 point로 가는 화살표
  const segmentLengthSquared = segment.lengthSq();
  if (segmentLengthSquared === 0) return start.clone();              // 선분 길이가 0이면 start가 가장 가깝다
  const weight = THREE.MathUtils.clamp(startToPoint.dot(segment) / segmentLengthSquared, 0, 1);
  return start.clone().addScaledVector(segment, weight);             // start + weight × (end - start)
}

// 점 point가 캡슐(선분 start~end, 반지름 radius) 안에 있으면 캡슐 표면으로 밀어내고 true를 돌려준다.
// 밖에 있으면 그대로 두고 false를 돌려준다. point를 직접 바꾼다.
// 선분에서 가장 가까운 점에서 point로 가는 방향으로 밀어서 그 방향의 표면 위에 놓는다.
export function pushOutOfCapsule(point, start, end, radius) {
  const closest = closestPointOnSegment(point, start, end);
  const outward = new THREE.Vector3().subVectors(point, closest); // 선분에서 point로 가는 화살표
  const distanceToSegment = outward.length();
  if (distanceToSegment >= radius) return false;
  // 점이 선분 위에 딱 놓이면 밀 방향이 없다. 그때는 선분에 수직인 아무 방향으로나 민다
  if (distanceToSegment < 1e-9) perpendicularDirection(new THREE.Vector3().subVectors(end, start), outward);
  outward.normalize();
  point.copy(closest).addScaledVector(outward, radius); // 선분 위 가장 가까운 점에서 바깥 방향으로 반지름만큼
  return true;
}

// direction에 수직인 방향 하나를 result에 넣는다. 위쪽(y)과 외적하고, direction이 위쪽과 나란하면 x축과 외적한다.
function perpendicularDirection(direction, result) {
  result.crossVectors(direction, new THREE.Vector3(0, 1, 0));
  if (result.lengthSq() < 1e-12) result.crossVectors(direction, new THREE.Vector3(1, 0, 0));
  return result;
}
