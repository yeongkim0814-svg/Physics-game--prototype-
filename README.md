# Physics Skill Game

물리 법칙 자체가 능력인 웹 기반 3D 익스트랙션 슈터 (Three.js + Vite + TypeScript).

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크 + 프로덕션 빌드 (dist/)
```

## 조작 (Phase 0)

| 입력 | 동작 |
| --- | --- |
| 화면 클릭 | 포인터 잠금(시작) |
| WASD | 이동 |
| 마우스 | 시점 |
| Shift | 달리기 |
| Esc | 포인터 해제 |

## 구조

- `src/engine/GameEngine.ts` — 고정 60Hz 로직 + 보간 렌더 루프
- `src/player/` — 입력, 플레이어(이동/충돌)
- `src/level/` — 방, 벽, AABB 충돌 데이터

## 배포

Vercel에서 저장소를 Import하면 Vite가 자동 감지됩니다 (Build: `npm run build`, Output: `dist`).
