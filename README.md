# Physics Skill Game

물리 법칙 자체가 능력인 웹 기반 3D 익스트랙션 슈터 (Three.js + Vite + TypeScript).

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크 + 프로덕션 빌드 (dist/)
```

## 조작 (Phase 0)

**PC**

| 입력 | 동작 |
| --- | --- |
| 화면 클릭 | 포인터 잠금(시작) |
| WASD | 이동 |
| 마우스 | 시점 |
| Shift | 달리기 |
| Esc | 포인터 해제 |

**태블릿/폰 (가로 모드 권장)**

| 입력 | 동작 |
| --- | --- |
| 화면 터치 | 시작 (가능하면 전체화면+가로 고정) |
| 왼쪽 절반 드래그 | 가상 조이스틱: 밀기 정도에 따라 속도 조절 (끝까지 밀기 = 스프린트) |
| 오른쪽 절반 드래그 | 시점 |

스틱을 끝까지 밀면 **스프린트가 잠기고**(노브 고정), 손가락을 떼면 해제됩니다.

## 규칙 (Phase 1)

- 에너지 100 중 30으로 시작, 자연 회복 없음.
- 방 곳곳의 발광체에 닿으면 흡수: 작은 것 +10, 큰 것 +25. 에너지가 가득 차면 줍지 않고 남겨 둡니다.

## 구조

- `src/engine/GameEngine.ts` — 고정 60Hz 로직 + 보간 렌더 루프
- `src/player/` — 입력, 플레이어(이동/충돌)
- `src/level/` — 방, 벽, AABB 충돌 데이터

## 배포

Vercel에서 저장소를 Import하면 Vite가 자동 감지됩니다 (Build: `npm run build`, Output: `dist`).
