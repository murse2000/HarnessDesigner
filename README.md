# Harness Designer

Windows, macOS, Linux용 전자제품 하네스 설계 데스크톱 앱입니다. React UI는 Tauri 네이티브 웹뷰에서 실행되고 프로젝트 상태, 파일 패키지, 부품 라이브러리와 XLSX 출력은 Rust 백엔드가 관리합니다.

## 주요 기능

- 프로젝트별 하네스 도면, 하우징, 핀, 구간, 전선과 부자재 편집
- 하우징 드래그 중 실시간 도면·연결선 이동과 놓기 단위 실행 취소
- 하네스 문서 탭, 가로·세로 분할, 동일 앱 세션의 추가 전체 설계 창
- 핀맵, 컷리스트, BOM, 부품 라이브러리와 미리보기 패널의 독립 창 분리
- `.harness` ZIP 패키지 저장, 파일 잠금, 프로젝트별 변경 기록과 실행 취소
- SVG/DXF 하우징 가져오기와 핀 좌표 매핑
- 하네스 DXF·PDF·JPG 및 전체 XLSX·CSV·PDF BOM 출력
- 고밀도 라이트·다크 UI, 한국어·영어, 80~140% UI 배율

## 개발 실행

필수 환경은 Node.js 24 LTS와 Rust stable입니다.

```sh
npm install
npm run tauri dev
```

테스트와 macOS 앱 빌드:

```sh
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --bundles app
```

macOS 결과물은 `src-tauri/target/release/bundle/macos/Harness Designer.app`에 생성됩니다.
