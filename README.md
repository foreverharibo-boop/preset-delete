# preset delete

SillyTavern 1.18용 Chat Completion 프리셋 일괄 관리 확장입니다.

## 기능

- Chat Completion 프리셋 이름 검색
- 표시된 프리셋 전체 선택 및 선택 해제
- 여러 프리셋 일괄 삭제
- 현재 사용 중인 프리셋을 삭제할 때 남아 있는 프리셋으로 자동 전환
- 프리셋이 0개가 되지 않도록 마지막 1개 보호
- 선택한 프리셋을 ZIP 안의 개별 JSON 파일로 저장
- 확장에서 만든 ZIP 백업 및 이전 버전의 통합 JSON 백업 복원

## 설치

압축을 풀어 `preset-delete` 폴더를 다음 위치에 넣고 SillyTavern을 재시작합니다.

`SillyTavern/data/default-user/extensions/`

이후 확장 탭에서 **preset delete**를 열어 사용합니다.

## 삭제 전 주의

프리셋 삭제는 영구적입니다. 중요한 프리셋은 먼저 **선택 백업**을 눌러 저장하세요. 백업 파일에는 프리셋에 저장된 프록시 주소나 사용자 지정 엔드포인트 같은 설정이 포함될 수 있습니다.

이 확장은 프롬프트 목록(`prompts`, `prompt_order`)이 들어 있는 **Chat Completion 프리셋**만 관리합니다. 컨텍스트 템플릿, 인스트럭트 템플릿, 퀵 리플 세트는 삭제하지 않습니다.
