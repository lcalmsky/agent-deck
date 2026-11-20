#!/bin/sh
# Demo session scan: made-up sessions in the scan.sh line format, so the deck runs without any agent.
exec node -e '
const now = Date.now(), m = 60_000;
const s = (id, cwd, status, ago, extra = {}) => console.log(JSON.stringify({
  t: "s", sessionId: id, agent: "claude", cwd: "/Users/demo/code/" + cwd, status,
  statusUpdatedAt: now - ago * m, startedAt: now - (ago + 40) * m, lastMeaningfulAt: now - ago * m,
  where: { terminalId: "t-" + id }, ...extra }));
s("a1", "shop-api", "waiting", 2, { lastSentence: "마이그레이션을 운영 DB에 바로 적용할까요?", identity: { firstPrompt: "주문 테이블에 배송 메모 컬럼 추가" } });
s("b2", "web-checkout", "busy", 1, { currentAction: "Edit src/checkout/Summary.tsx", identity: { firstPrompt: "결제 요약 카드 리디자인" } });
s("c3", "docs-site", "idle", 6, { lastSentence: "검색 색인을 다시 만들고 배포까지 끝냈어.", identity: { firstPrompt: "문서 검색 색인 갱신" } });
s("d4", "billing-worker", "busy", 24, { currentAction: "Run npm test", identity: { firstPrompt: "정산 배치 재시도 로직" } });
s("e5", "mobile-app", "busy", 3, { agent: "codex", currentAction: "Read ios/AppDelegate.swift", background: { total: 2 }, identity: { firstPrompt: "푸시 알림 딥링크" } });
s("f6", "design-tokens", "waiting", 5, { agent: "gemini", lastSentence: "다크 모드 대비가 4.2:1이에요. 색을 바꿀까요?", identity: { firstPrompt: "다크 모드 토큰 정리" } });
s("g7", "infra", "idle", 50, { lastSentence: "스테이징 인증서 갱신 완료.", identity: { firstPrompt: "인증서 자동 갱신" } });
console.log(JSON.stringify({ t: "meta", error: null }));
'
