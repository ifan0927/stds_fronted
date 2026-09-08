 # Backend Gap Report / Issue Draft: <短標題>

  ## 1. 卡住的畫面 / 流程

  - Page / Route:
  - User flow:
  - 使用者原本要完成的動作:
  - 目前卡住的位置:

  ## 2. 目前使用的 Backend API

  - Endpoint:
  - Method:
  - Request payload / query params:
  ```json
  {}

  - Current response relevant fields:

  {}

  - OpenAPI / generated client type, if known:

  ## 3. 缺少的欄位 / Command / 行為

  目前缺少：

  - [ ] Request field
  - [ ] Response field
  - [ ] New command / endpoint
  - [ ] Query filter / sorting
  - [ ] Status / state transition
  - [ ] Validation rule
  - [ ] Permission behavior
  - [ ] Other:

  具體缺口：

  <描述目前 frontend 需要什麼，但 backend 無法提供或無法保存>

  ## 4. Frontend Workaround 風險

  是否有 workaround？

  - [ ] No, completely blocking
  - [ ] Yes, but may create wrong data
  - [ ] Yes, display-only workaround
  - [ ] Yes, temporary mock/local state only

  Workaround description:

  <frontend 目前可能怎麼繞>

  Risk if workaround is used:

  <是否會造成金額錯誤、狀態錯誤、權限繞過、歷史資料不一致、或只是 UI 不完整>

  ## 5. Legacy 對應行為 / 欄位

  Legacy 是否有對應資料或行為？

  - [ ] Yes
  - [ ] No
  - [ ] Unknown

  Legacy field / table / behavior:

  <例如 estate_rent_electric，或 legacy 畫面如何處理>

  Notes:

  <如果只是觀察，不確定語意，也明確寫 unknown / needs backend validation>

  ## 6. Blocking 程度

  Priority:

  - [ ] P0 - Blocks core frontend flow
  - [ ] P1 - Workaround possible but risks wrong business data
  - [ ] P2 - Workaround possible, mostly UX / display limitation
  - [ ] P3 - Follow-up improvement

  Why:

  <說明為什麼是這個等級>

  ## 7. Frontend Expected Outcome

  Frontend 希望 backend 最終能支援：

  <用產品語言描述，不需要完整技術設計>

  Example expected API shape, if useful:

  {}

  ## 8. Suggested Backend Issue Split

  Frontend agent 初步建議：

  - [ ] Single backend issue is enough
  - [ ] Needs separate issues

  Possible issues:

  1. <issue title>
      - Type: api | database | migration | domain | bug | docs
      - Why separate:
  2. <issue title>
      - Type:
      - Why separate:

  ## 9. Out of Scope

  這個 gap report 不要求 backend 處理：
