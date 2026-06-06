# Space Founder - System Architecture Specification

## 1. Project Overview
- **Project Name:** Space Founder
- **Concept:** NASA 스타일의 고독하고 웅장한 웹 기반 천체 관측 시뮬레이터.
- **Core Principle:** 순수 시뮬레이션 지향. 유저는 생성 시 존재(행성)를 선택하는 것 외에 물리적 조작 불가. 오직 실시간 우주 물리 법칙에 따른 궤도 변화를 관측하고 탐사함.
- **Scale:** 유저 수 100명 미만의 소규모 정예 커뮤니티 타겟. 리소스(비용) 최적화 필수.

## 2. Tech Stack
- **Runtime & Language:** Node.js (TypeScript)
- **Web Framework:** Fastify (초경량, 저메모리 지향)
- **Real-time Protocol:** Socket.io (WebSocket)
- **Database:** Supabase (PostgreSQL) - 무료 티어 이내 활용
- **Infrastructure:** Railway (RAM 512MB~1GB 환경 내 상시 구동)

## 3. World & Physics Architecture
- **Seamless Single World:** 물리적으로 분리된 채널/방 구조가 아닌, 하나의 거대한 3D 마스터 좌표계 `(X, Y, Z)` 사용.
- **Fixed Gravity Anchor:** 유명 별자리(예: 북극성, 쌍둥이자리 등)의 거대 코어 항성들은 실제 천체 고증 좌표에 상수로 고정 배치 (연산 제외, 중력원으로만 작동).
- **In-Memory Calculation:** 100개 내외 행성의 만유인력 및 궤도 연산($O(n^2)$)은 서버 메모리(In-Memory `Map`) 위에서 즉각 처리. DB I/O는 5~10분 주기 스냅샷 백업 및 주요 이벤트 발생 시에만 간헐적 호출.

## 4. Network & Communication Strategy
- **Sector-based Streaming (Room):** 우주는 하나로 뚫려 있으나, 서버는 유저 카메라의 3D 좌표를 기반으로 해당 구역(Sector)의 행성 데이터만 필터링하여 스트리밍 (`Socket.io Room` 스위칭).
- **10s Broadcast Interval:** 서버 푸시(Server Push) 주기는 10초에 1회로 제한하여 네트워크 오버헤드 최소화.
- **Dead Reckoning:** 서버는 10초마다 [위치 좌표 + 현재 속도 벡터(`vx, vy, vz`)]를 전송. 클라이언트(브라우저)는 다음 패킷이 오기 전까지 속도 벡터 기반으로 위치를 추측 보간하여 부드럽게 렌더링.
- **Binary Protocol (Optimized):** 트래픽 최소화를 위해 JSON 데이터 포맷을 지양하고, `ArrayBuffer` 기반의 순수 숫자 바이트(Binary)로 압축 전송.

## 5. Business Model & Core Cycle (Warp System)
- **Free User:** 월드 외곽에 행성 생성 후 코어 항성의 중력권에 종속됨. 스스로 이탈 불가. 단, 외곽 보이드 구역의 시스템 블랙홀에 흡수될 시 타 월드(별자리) 무작위 좌표로 강제 전송 및 순환 회귀.
- **Paid User (Warp Ticket):** 결제 시 행성에 성간 워프 드라이브 권한 부여. 현재 성계의 중력을 일시적으로 초월하여 원하는 다른 별자리 월드의 안정적 궤도로 즉시 차원 도약 및 화려한 이펙트 연출.

## 6. Development Roadmap
1. Phase 1: Fastify + TypeScript 기본 환경 및 `setInterval` 기반 10초 주기 인메모리 물리 연산 루프 구현.
2. Phase 2: Socket.io 연동 및 룸(Sector) 기반 데이터 브로드캐스트 구현.
3. Phase 3: ArrayBuffer 바이너리 프로토콜 설계 및 데이터 압축 적용.
4. Phase 4: Supabase 연동 및 간헐적 데이터 스냅샷 저장/복구 로직 구현.