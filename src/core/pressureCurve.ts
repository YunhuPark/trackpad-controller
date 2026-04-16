/**
 * PressureCurve — 압력(0~1)을 커스텀 곡선으로 매핑
 *
 * 4개의 컨트롤 포인트로 정의된 피스와이즈 선형 곡선.
 * 포인트는 x(입력), y(출력) 각각 0~1 범위.
 */

export interface CurvePoint {
  x: number  // 0~1 (입력 압력)
  y: number  // 0~1 (출력 값)
}

export type PressureCurve = [CurvePoint, CurvePoint, CurvePoint, CurvePoint]

export const DEFAULT_CURVE: PressureCurve = [
  { x: 0,    y: 0    },
  { x: 0.33, y: 0.33 },
  { x: 0.66, y: 0.66 },
  { x: 1,    y: 1    },
]

/**
 * 압력 값을 커스텀 곡선에 통과시켜 매핑된 값 반환
 * @param pressure 0~1 원시 압력
 * @param curve 4개 컨트롤 포인트 배열 (x 오름차순 정렬 필수)
 * @returns 0~1 매핑된 출력
 */
export function applyPressureCurve(pressure: number, curve: PressureCurve): number {
  const p = Math.max(0, Math.min(1, pressure))

  // 양 끝 경계 처리
  if (p <= curve[0].x) return curve[0].y
  if (p >= curve[3].x) return curve[3].y

  // 해당 구간 찾아서 선형 보간
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]
    const b = curve[i + 1]
    if (p >= a.x && p <= b.x) {
      const t = (b.x - a.x) < 0.0001 ? 0 : (p - a.x) / (b.x - a.x)
      return a.y + t * (b.y - a.y)
    }
  }
  return p
}

/**
 * 압력(0~1) → MIDI velocity(0~127) 변환 (곡선 적용 포함)
 */
export function pressureToVelocity(pressure: number, curve: PressureCurve): number {
  const mapped = applyPressureCurve(pressure, curve)
  return Math.round(mapped * 127)
}
