// ============================================
// 일일 활동 기록 캘린더 - Google Sheets 연동 + AI 백엔드 (Gemini 버전, 팀 공유/사번별 로그인)
// ============================================

const USERS_SHEET_NAME = "Users";           // 사번별 계정과 데이터를 저장하는 시트 (한 행 = 한 사람)
const LEGACY_DATA_SHEET_NAME = "AppData";   // 예전 1인용 버전에서 쓰던 시트 (이전용으로만 참조)
const READABLE_SHEET_PREFIX = "일일기록_";  // 사람이 보기 편한 날짜별 표 (사번별로 시트가 따로 생김)
const BACKUP_SHEET_NAME = "AppData_백업";   // 저장할 때마다 직전 상태를 자동 백업해두는 시트 (최근 30개 유지)
const GEMINI_MODEL = "gemini-2.5-flash";    // 안정적인 기본 Flash 모델

// 사번은 현재 회사 기준 숫자 7자리. 프론트엔드(index.html)의 EMPLOYEE_ID_PATTERN과 동일하게 유지할 것
const EMPLOYEE_ID_PATTERN = /^\d{7}$/;
const EMPLOYEE_ID_INVALID_MESSAGE = "사번은 숫자 7자리입니다. 7자리보다 짧거나 길면 올바른 사번이 아닙니다.";

// 이 사번으로 로그인한 사람만 관리자 API(계정 목록/삭제/비밀번호 초기화)를 쓸 수 있음.
// 프론트엔드(index.html)의 ADMIN_EMPLOYEE_ID와 반드시 같은 값이어야 함
const ADMIN_EMPLOYEE_ID = "9999999";

// ===== SHA-256 해시 생성 함수 (웹 프론트엔드의 sha256Hex와 100% 호환) =====
function computeSha256(text) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return rawHash.map(function(b) {
    const byteVal = (b < 0) ? b + 256 : b;
    return ('0' + byteVal.toString(16)).slice(-2);
  }).join('');
}

// ===== 사번별 계정/데이터 시트 =====
function getUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.getRange(1, 1, 1, 5).setValues([["사번", "비밀번호해시", "데이터(JSON)", "마지막 저장", "계정 생성일"]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 160);
    sheet.setColumnWidth(5, 160);
  }
  return sheet;
}

function findUserRow(sheet, employeeId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === employeeId) return i + 2;
  }
  return -1;
}

function normalizeEmployeeId(id) {
  return (id || "").toString().trim();
}

// GET 요청: 로그인(action=login) 또는 데이터 불러오기(action=load)
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || "load";
    const employeeId = normalizeEmployeeId(e.parameter && e.parameter.employeeId);
    const passwordHash = (e.parameter && e.parameter.passwordHash) || "";

    if (action === "login") return handleLogin(employeeId, passwordHash);
    if (action === "load") return handleLoad(employeeId, passwordHash);

    return jsonResponse({ status: "error", message: "알 수 없는 요청입니다." });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

// 로그인 전용. 이제 회원가입(action=signup)이 따로 있으므로, 등록되지 않은 사번은
// 더 이상 여기서 자동으로 계정을 만들지 않고 회원가입을 먼저 하라고 안내함
function handleLogin(employeeId, passwordHash) {
  if (!employeeId) {
    return jsonResponse({ status: "error", message: "사번을 입력해주세요." });
  }
  if (!passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호를 입력해주세요." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);

  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다. 회원가입을 먼저 진행해주세요." });
  }

  const storedHash = sheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }

  return jsonResponse({ status: "success", isNewUser: false });
}

function handleLoad(employeeId, passwordHash) {
  if (!employeeId || !passwordHash) {
    return jsonResponse({ status: "error", message: "로그인 정보가 없습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);

  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다." });
  }

  const storedHash = sheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }

  const json = sheet.getRange(row, 3).getValue() || "{}";
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// POST 요청: 회원가입/계정 변경/상태 저장/AI 요청들을 action으로 구분해서 처리
function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(body);

    if (data.action === "summarize") return handleSummarize(data);
    if (data.action === "revise") return handleRevise(data);
    if (data.action === "dailySummary") return handleDailySummary(data);
    if (data.action === "goalDraft") return handleGoalDraft(data);
    if (data.action === "goalRevise") return handleGoalRevise(data);
    if (data.action === "trendAnalysis") return handleTrendAnalysis(data);
    if (data.action === "trendRevise") return handleTrendRevise(data);
    if (data.action === "signup") return handleSignup(data);
    if (data.action === "changePassword") return handleChangePassword(data);
    if (data.action === "changeEmployeeId") return handleChangeEmployeeId(data);
    if (data.action === "adminListUsers") return handleAdminListUsers(data);
    if (data.action === "adminDeleteUser") return handleAdminDeleteUser(data);
    if (data.action === "adminResetPassword") return handleAdminResetPassword(data);

    return handleSaveState(data, body);
  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

// 회원가입: 사번(숫자 7자리)/이름/소속/비밀번호를 받아 새 계정을 만듦.
// 이미 존재하는 사번이면 거부(중복 방지)
function handleSignup(data) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";
  const name = (data.name || "").toString().trim();
  const department = (data.department || "").toString().trim();

  if (!EMPLOYEE_ID_PATTERN.test(employeeId)) {
    return jsonResponse({ status: "error", message: EMPLOYEE_ID_INVALID_MESSAGE });
  }
  if (!passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호를 입력해주세요." });
  }
  if (!name) {
    return jsonResponse({ status: "error", message: "이름을 입력해주세요." });
  }
  if (!department) {
    return jsonResponse({ status: "error", message: "소속을 선택해주세요." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);
  if (row !== -1) {
    return jsonResponse({ status: "error", message: "이미 존재하는 사번입니다. 다른 사번을 사용해주세요." });
  }

  const initialData = { name: name, department: department };
  sheet.appendRow([employeeId, passwordHash, JSON.stringify(initialData), "", new Date().toLocaleString('ko-KR')]);

  return jsonResponse({ status: "success" });
}

// 비밀번호 변경: 현재 비밀번호(oldPasswordHash)를 확인한 뒤에만 새 비밀번호로 교체
function handleChangePassword(data) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const oldPasswordHash = data.oldPasswordHash || "";
  const newPasswordHash = data.newPasswordHash || "";

  if (!employeeId || !oldPasswordHash || !newPasswordHash) {
    return jsonResponse({ status: "error", message: "요청 정보가 올바르지 않습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다." });
  }

  const storedHash = sheet.getRange(row, 2).getValue();
  if (String(storedHash) !== oldPasswordHash) {
    return jsonResponse({ status: "error", message: "현재 비밀번호가 일치하지 않습니다." });
  }

  sheet.getRange(row, 2).setValue(newPasswordHash);
  return jsonResponse({ status: "success" });
}

// 사번 변경: 비밀번호로 본인 확인 후, 새 사번이 이미 존재하면(중복) 거부하고
// 그렇지 않으면 계정 행의 사번만 바꿔치기함 (데이터는 그대로 유지)
function handleChangeEmployeeId(data) {
  const oldEmployeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";
  const newEmployeeId = normalizeEmployeeId(data.newEmployeeId);

  if (!oldEmployeeId || !passwordHash || !newEmployeeId) {
    return jsonResponse({ status: "error", message: "요청 정보가 올바르지 않습니다." });
  }
  if (!EMPLOYEE_ID_PATTERN.test(newEmployeeId)) {
    return jsonResponse({ status: "error", message: EMPLOYEE_ID_INVALID_MESSAGE });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, oldEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다." });
  }

  const storedHash = sheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }

  if (newEmployeeId !== oldEmployeeId) {
    const dupRow = findUserRow(sheet, newEmployeeId);
    if (dupRow !== -1) {
      return jsonResponse({ status: "error", message: "이미 존재하는 사번이라 변경할 수 없습니다." });
    }
  }

  sheet.getRange(row, 1).setValue(newEmployeeId);

  // 사람이 보기 편한 읽기용 시트도 새 사번 이름으로 맞춰줌 (있을 때만)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const oldReadable = ss.getSheetByName(READABLE_SHEET_PREFIX + oldEmployeeId);
    if (oldReadable && oldEmployeeId !== newEmployeeId) {
      oldReadable.setName(READABLE_SHEET_PREFIX + newEmployeeId);
    }
  } catch (renameErr) {}

  return jsonResponse({ status: "success" });
}

// 요청에 실려온 employeeId/passwordHash가 실제 관리자(ADMIN_EMPLOYEE_ID) 계정과 정확히
// 일치할 때만 true. 관리자 API 3개(목록/삭제/비밀번호초기화) 모두 이 검증을 통과해야만 동작함
function verifyAdmin(data) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";
  if (employeeId !== ADMIN_EMPLOYEE_ID || !passwordHash) return false;

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);
  if (row === -1) return false;

  const storedHash = sheet.getRange(row, 2).getValue();
  return String(storedHash) === passwordHash;
}

function adminAuthFailedResponse() {
  return jsonResponse({ status: "error", message: "관리자 인증에 실패했습니다." });
}

// 관리자 화면: 가입된 모든 계정의 사번/이름/소속/기록개수/가입일/마지막저장일 목록
// (비밀번호 해시는 관리자 화면이라도 클라이언트로 절대 내려보내지 않음)
function handleAdminListUsers(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const sheet = getUsersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ status: "success", users: [] });

  const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const users = rows.map(function(row) {
    const employeeId = String(row[0]).trim();
    let parsed = {};
    try { parsed = JSON.parse(row[2] || "{}"); } catch (parseErr) { parsed = {}; }
    const recordCount = parsed.records ? Object.keys(parsed.records).length : 0;

    return {
      employeeId: employeeId,
      name: parsed.name || "",
      department: parsed.department || "",
      recordCount: recordCount,
      lastSaved: row[3] ? row[3].toString() : "",
      createdAt: row[4] ? row[4].toString() : ""
    };
  });

  return jsonResponse({ status: "success", users: users });
}

// 관리자 화면: 계정 삭제. 관리자 자신의 계정(ADMIN_EMPLOYEE_ID)은 잠금 방지를 위해 삭제 불가
function handleAdminDeleteUser(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const targetEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  if (!targetEmployeeId) {
    return jsonResponse({ status: "error", message: "삭제할 사번이 없습니다." });
  }
  if (targetEmployeeId === ADMIN_EMPLOYEE_ID) {
    return jsonResponse({ status: "error", message: "관리자 계정 자신은 삭제할 수 없습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, targetEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다." });
  }

  sheet.deleteRow(row);

  // 그 사람의 읽기용 표 시트도 함께 정리(있을 때만)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const readable = ss.getSheetByName(READABLE_SHEET_PREFIX + targetEmployeeId);
    if (readable) ss.deleteSheet(readable);
  } catch (cleanupErr) {}

  return jsonResponse({ status: "success" });
}

// 관리자 화면: 비밀번호 초기화. newPasswordHash는 프론트엔드가 다른 곳과 동일한 방식
// (sha256(새비밀번호 + ':' + 대상사번))으로 미리 해시해서 보냄
function handleAdminResetPassword(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const targetEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  const newPasswordHash = data.newPasswordHash || "";
  if (!targetEmployeeId || !newPasswordHash) {
    return jsonResponse({ status: "error", message: "요청 정보가 올바르지 않습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, targetEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다." });
  }

  sheet.getRange(row, 2).setValue(newPasswordHash);
  return jsonResponse({ status: "success" });
}

function handleSaveState(data, rawBody) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";

  if (!employeeId || !passwordHash) {
    return jsonResponse({ status: "error", message: "로그인 정보가 없어 저장할 수 없습니다. 다시 로그인해주세요." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);

  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다. 다시 로그인해주세요." });
  }

  const storedHash = sheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }

  const existingJson = sheet.getRange(row, 3).getValue() || "{}";

  // 안전장치 1: 기존에 기록이 있었는데 빈 데이터로 덮어쓰려는 경우 거부
  let existingData = {};
  try { existingData = JSON.parse(existingJson); } catch (e2) { existingData = {}; }
  const existingRecordCount = existingData.records ? Object.keys(existingData.records).length : 0;
  const incomingRecordCount = data.records ? Object.keys(data.records).length : 0;

  if (existingRecordCount >= 5 && incomingRecordCount === 0) {
    return jsonResponse({
      status: "error",
      message: "안전장치 작동: 기존에 " + existingRecordCount + "일치 기록이 저장되어 있는데, 빈 데이터로 덮어쓰려는 요청이라 저장을 거부했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요."
    });
  }

  // 안전장치 2: 직전 상태 자동 백업
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let backupSheet = ss.getSheetByName(BACKUP_SHEET_NAME);
    if (!backupSheet) {
      backupSheet = ss.insertSheet(BACKUP_SHEET_NAME);
      backupSheet.getRange(1, 1, 1, 3).setValues([["백업 시각", "사번", "데이터(JSON)"]]);
    }
    backupSheet.insertRowBefore(2);
    backupSheet.getRange(2, 1).setValue(new Date().toLocaleString('ko-KR'));
    backupSheet.getRange(2, 2).setValue(employeeId);
    backupSheet.getRange(2, 3).setValue(existingJson);
    const lastRow = backupSheet.getLastRow();
    if (lastRow > 31) {
      backupSheet.deleteRows(32, lastRow - 31);
    }
  } catch (backupErr) {}

  const dataToSave = {};
  for (const key in data) {
    if (key !== 'employeeId' && key !== 'passwordHash') dataToSave[key] = data[key];
  }
  const jsonToSave = JSON.stringify(dataToSave);

  sheet.getRange(row, 3).setValue(jsonToSave);
  sheet.getRange(row, 4).setValue(new Date().toLocaleString('ko-KR'));

  updateReadableSheet(employeeId, dataToSave);

  return jsonResponse({ status: "success" });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function missingKeyResponse() {
  return jsonResponse({
    status: "error",
    message: "Gemini API 키가 없습니다. [환경설정] 탭에서 본인의 Gemini API 키를 입력해 저장하거나, 관리자가 Apps Script 프로젝트 설정 → 스크립트 속성에 GEMINI_API_KEY를 추가해주세요."
  });
}

// 사용자별 개인 API 키(요청에 담겨 온 userApiKey)가 있으면 그걸 우선 사용하고,
// 없으면 관리자가 스크립트 속성에 등록해둔 공용 키로 대체함
function resolveApiKey(data) {
  const userKey = (data && data.userApiKey) ? data.userApiKey.toString().trim() : "";
  if (userKey) return userKey;
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

function stripMarkdown(text) {
  return (text || "")
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`([^`]*)`/g, '$1');
}

// ===== Gemini API 저수준 호출 =====
function callGeminiRawText(apiKey, contents, systemPrompt) {
  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: contents
  };

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL + ":generateContent";

  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseData = JSON.parse(response.getContentText());

  if (responseCode !== 200) {
    const errMsg = (responseData.error && responseData.error.message) ? responseData.error.message : "Gemini API 오류";
    throw new Error(errMsg);
  }

  let text = "";
  if (responseData.candidates && responseData.candidates[0] &&
      responseData.candidates[0].content && responseData.candidates[0].content.parts) {
    text = responseData.candidates[0].content.parts.map(p => p.text || "").join("");
  }

  if (!text) throw new Error("AI 응답이 비어있습니다. 잠시 후 다시 시도해주세요.");

  return stripMarkdown(text);
}

function callGeminiAndRespond(apiKey, contents, systemPrompt) {
  try {
    const text = callGeminiRawText(apiKey, contents, systemPrompt);
    return jsonResponse({ status: "success", summary: text });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.message || error.toString() });
  }
}

function callGeminiSplitAndRespond(apiKey, contents, systemPrompt) {
  try {
    const raw = callGeminiRawText(apiKey, contents, systemPrompt);
    const parsed = parseGoodImproveJSON(raw);
    return jsonResponse({ status: "success", good: parsed.good, improve: parsed.improve, raw: raw });
  } catch (error) {
    return jsonResponse({ status: "error", message: error.message || error.toString() });
  }
}

function parseGoodImproveJSON(text) {
  let cleaned = (text || "").trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    return {
      good: (obj.good || "").toString().trim(),
      improve: (obj.improve || "").toString().trim()
    };
  } catch (e) {
    return {
      good: text,
      improve: "(자동으로 좌/우로 나누지 못했습니다. 왼쪽에 전체 내용이 표시됩니다. '수정 요청'에 '좌우로 다시 나눠줘'라고 입력해보세요.)"
    };
  }
}

// ===== 월별 피드백 =====
function buildSystemPrompt() {
  return (
    "당신은 공무팀(설비 유지보수/유틸리티 엔지니어)의 월간 업무 피드백 초안을 작성해주는 도우미입니다. " +
    "사용자가 매일 기록한 [일일 기록 원본]만을 근거로, 아래 [양식]의 항목 구조를 그대로 유지하면서 '잘한점(한일)'과 '개선/보완할 점(할일)' 두 섹션을 작성하세요.\n\n" +
    "=== 절대 원칙 ===\n" +
    "- [일일 기록 원본]에 실제로 등장하지 않는 사실, 숫자(비용/절감액/수치), 설비명, 성과를 절대로 지어내지 마세요.\n" +
    "- 사실을 부풀리거나 없던 협업/조치를 있었던 것처럼 쓰지 마세요.\n\n" +
    "=== '잘한점(한일)' 작성 방식 ===\n" +
    "개조식 보고체(~함, ~완료함 등)로 작성하세요:\n" +
    "① 월 목표 (Objective)\n② 핵심 결과 (KR)\n③ 실행 전략 및 노력 과정\n④ 성과 및 결과\n\n" +
    "=== '개선/보완할 점(할일)' 작성 방식 ===\n" +
    "① 부족했던 점 (한계 인식)\n② 개선·보완 계획 (근본 원인 분석, SOP 표준화, 시스템적 개선 관점)\n\n" +
    "=== 출력 형식 (매우 중요) ===\n" +
    "다른 설명 없이 아래 JSON 객체 '하나만' 출력하세요:\n" +
    '{"good": "잘한점 내용", "improve": "개선점 내용"}\n' +
    "줄바꿈은 \\n을 사용하고, 마크다운 기호는 쓰지 마세요."
  );
}

function handleSummarize(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const template = data.template || "";
  const logText = data.logText || "";
  const periodLabel = data.periodLabel || "";

  const userPrompt = `[기간] ${periodLabel}\n\n[양식]\n${template}\n\n[일일 기록 원본]\n${logText}`;
  const contents = [{ role: "user", parts: [{ text: userPrompt }] }];

  return callGeminiSplitAndRespond(apiKey, contents, buildSystemPrompt());
}

function handleRevise(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const history = Array.isArray(data.history) ? data.history : [];
  const instruction = data.instruction || "";

  if (!instruction || history.length === 0) {
    return jsonResponse({ status: "error", message: "수정 요청 내용이 비어있습니다." });
  }

  const contents = history.map(turn => ({
    role: turn.role === "model" ? "model" : "user",
    parts: [{ text: turn.text || "" }]
  }));
  contents.push({ role: "user", parts: [{ text: instruction }] });

  return callGeminiSplitAndRespond(apiKey, contents, buildSystemPrompt());
}

// ===== 일일 업무 요약 =====
// 사번마다 실제로 맡은 업무가 다르므로, "냉동기/보일러/수처리 일상점검" 고정 항목은
// 그 업무를 실제로 하는 이 사번(2600643)에게만 넣고 다른 사람에게는 넣지 않음
const DAILY_SUMMARY_FIXED_ITEM_EMPLOYEE_ID = "2600643";
const DAILY_SUMMARY_FIXED_ITEM_TEXT = "냉동기, 보일러, 수처리 일상점검";

function buildDailySummarySystemPrompt(includeFixedFirstItem) {
  const fixedItemRule = includeFixedFirstItem
    ? "- 반드시 '1. " + DAILY_SUMMARY_FIXED_ITEM_TEXT + "'를 첫 번째 항목으로 고정해서 넣으세요. 그 다음 번호부터 그날 실제로 기록된 활동들을 이어서 쓰세요.\n"
    : "- 그날 실제로 기록된 활동들만 번호를 매겨 쓰세요 (다른 사람 업무인 '" + DAILY_SUMMARY_FIXED_ITEM_TEXT + "' 같은 항목을 지어내서 넣지 마세요).\n";

  return (
    "당신은 퇴근 전 팀에 공유하는 '오늘 한 일' 목록을 정리해주는 도우미입니다. " +
    "사용자가 작성한 [오늘 작성한 활동 기록]만을 근거로 번호를 매긴 짧은 목록을 작성하세요.\n\n" +
    fixedItemRule +
    "- 각 항목은 짧은 명사형 구문으로 간결히 쓰세요.\n" +
    "- 마크다운 서식을 쓰지 말고 순수 텍스트 번호 매기기만 사용하세요."
  );
}

function handleDailySummary(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const logText = data.logText || "";
  const dateLabel = data.dateLabel || data.date || "";
  const includeFixedFirstItem = normalizeEmployeeId(data.employeeId) === DAILY_SUMMARY_FIXED_ITEM_EMPLOYEE_ID;

  if (!logText) {
    return jsonResponse({ status: "error", message: "이 날짜에 작성된 활동기록이 없습니다." });
  }

  const userPrompt = `[날짜] ${dateLabel}\n\n[오늘 작성한 활동 기록]\n${logText}`;
  const contents = [{ role: "user", parts: [{ text: userPrompt }] }];

  return callGeminiAndRespond(apiKey, contents, buildDailySummarySystemPrompt(includeFixedFirstItem));
}

// ===== 목표수립 (OKR) =====
const GOAL_AREA_LABELS = {
  kpi: "KPI",
  competency: "핵심역량",
  growth: "인재육성 / 성장계획",
  corevalue: "핵심가치",
  etc: "기타"
};

const GOAL_AREA_ITEM_COUNT = {
  kpi: 3,
  competency: 3,
  growth: 3,
  corevalue: 3,
  etc: 1
};

const GOAL_AREA_GUIDES = {
  kpi: "- KPI: 성과 달성을 위한 본인의 본질 업무 관련 과제 (설비 개선, 에너지 절감 등)",
  competency: "- 핵심역량: 본질 업무를 효율적으로 수행하기 위한 프로세스/역량 개선 과제",
  growth: "- 인재육성/성장계획: 본인의 성장계획 및 지식 습득 계획",
  corevalue: "- 핵심가치: 인사제도(인수인계, 피드백, 표준화) 내재화 과제",
  etc: "- 기타: 수명업무 및 TF활동 관련"
};

function buildGoalSystemPrompt(area) {
  const label = GOAL_AREA_LABELS[area] || GOAL_AREA_LABELS.kpi;
  const guide = GOAL_AREA_GUIDES[area] || GOAL_AREA_GUIDES.kpi;
  const itemCount = GOAL_AREA_ITEM_COUNT[area] || 1;

  const itemTemplate =
    "[과제명을 대괄호 안에 한 줄로]\n" +
    "1. 목표(Objective)\n(도전적인 1~3문장 서술)\n" +
    "2. 핵심결과(Key Result)\n1) KR1:\n2) KR2:\n" +
    "3. 평가기준\n1) A:\n2) B:\n3) C:\n" +
    "4. 현 수준 평가(등급 표기)\n" +
    "5. GAP(고민/이슈사항)\n" +
    "6. 주요전략\n" +
    "7. 한일/할일\n1) 한일\n2) 할일\n" +
    "완료일:\n" +
    "카테고리: " + label;

  return (
    "당신은 목표수립(OKR) 문서 작성을 도와주는 도우미입니다. 작성 영역: '" + label + "'\n\n" +
    guide + "\n\n" +
    "독립된 과제 항목을 " + itemCount + "개 작성하세요. 항목 양식:\n" + itemTemplate + "\n\n" +
    "없는 사실을 지어내지 말고 순수 텍스트로만 출력하세요."
  );
}

function handleGoalDraft(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const area = data.area || "kpi";
  const note = data.note || "";
  const logText = data.logText || "";

  const userPrompt =
    `[참고할 최근 활동 기록]\n${logText || '(제공된 활동 기록 없음)'}\n\n` +
    `[본인이 적은 방향성/메모]\n${note || '(작성한 메모 없음)'}`;

  const contents = [{ role: "user", parts: [{ text: userPrompt }] }];
  return callGeminiAndRespond(apiKey, contents, buildGoalSystemPrompt(area));
}

function handleGoalRevise(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const area = data.area || "kpi";
  const history = Array.isArray(data.history) ? data.history : [];
  const instruction = data.instruction || "";

  if (!instruction || history.length === 0) {
    return jsonResponse({ status: "error", message: "수정 요청 내용이 비어있습니다." });
  }

  const contents = history.map(turn => ({
    role: turn.role === "model" ? "model" : "user",
    parts: [{ text: turn.text || "" }]
  }));
  contents.push({ role: "user", parts: [{ text: instruction }] });

  return callGeminiAndRespond(apiKey, contents, buildGoalSystemPrompt(area));
}

// ===== 설비 데이터 경향 분석 =====
function buildTrendSystemPrompt() {
  return (
    "당신은 설비 데이터(전도도, 압력, 온도 등)를 분석하는 엔지니어입니다.\n" +
    "제공된 데이터만을 바탕으로 전체 경향, 기준 대비 현황, 특이 지점, 점검 필요 사항을 명확한 순수 텍스트로 서술하세요."
  );
}

function handleTrendAnalysis(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const prompt = data.prompt || "";
  if (!prompt) return jsonResponse({ status: "error", message: "분석할 데이터가 비어있습니다." });

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  return callGeminiAndRespond(apiKey, contents, buildTrendSystemPrompt());
}

function handleTrendRevise(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const history = Array.isArray(data.history) ? data.history : [];
  const instruction = data.instruction || "";

  if (!instruction || history.length === 0) {
    return jsonResponse({ status: "error", message: "질문 내용이 비어있습니다." });
  }

  const contents = history.map(turn => ({
    role: turn.role === "model" ? "model" : "user",
    parts: [{ text: turn.text || "" }]
  }));
  contents.push({ role: "user", parts: [{ text: instruction }] });

  return callGeminiAndRespond(apiKey, contents, buildTrendSystemPrompt());
}

// ===== 날짜별 읽기용 표 만들기 (시트 동기화) =====
function updateReadableSheet(employeeId, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = READABLE_SHEET_PREFIX + employeeId;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clear();

  const categories = data.categories || [];
  const records = data.records || {};
  const events = data.events || [];

  const dateSet = new Set();
  for (const dateStr in records) {
    const rec = records[dateStr];
    const hasContent = categories.some(c => rec[c] && rec[c].toString().trim() !== '');
    if (hasContent) dateSet.add(dateStr);
  }
  for (const ev of events) {
    dateSet.add(ev.start);
  }

  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) {
    sheet.getRange(1, 1).setValue("아직 기록된 활동이 없습니다.");
    return;
  }

  const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const header = ['날짜', '요일', ...categories, '예정작업'];
  const rows = [header];

  for (const dateStr of dates) {
    const parts = dateStr.split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const weekday = weekdayNames[dateObj.getDay()];

    const rec = records[dateStr] || {};
    const rowCategoryValues = categories.map(c => rec[c] || '');

    const dayEvents = events.filter(ev => dateStr >= ev.start && dateStr <= ev.end);
    const planText = dayEvents.map(ev => ev.title).join(', ');

    rows.push([dateStr, weekday, ...rowCategoryValues, planText]);
  }

  sheet.getRange(1, 1, rows.length, header.length).setValues(rows);

  const headerRange = sheet.getRange(1, 1, 1, header.length);
  headerRange.setFontWeight('bold').setBackground('#667eea').setFontColor('white');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, rows.length, header.length).setWrap(true);
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 50);
  for (let i = 3; i <= header.length; i++) {
    sheet.setColumnWidth(i, 240);
  }
}

// ===== Sheets 메뉴 =====
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("📅 캘린더 데이터")
    .addItem("등록된 사번 목록 보기", "showUserList")
    .addSeparator()
    .addItem("기존(1인용) 데이터를 내 계정으로 이전", "migrateLegacyData")
    .addItem("특정 사번 데이터 초기화", "resetUserData")
    .addToUi();
}

function showUserList() {
  const sheet = getUsersSheet();
  const lastRow = sheet.getLastRow();
  const ui = SpreadsheetApp.getUi();

  if (lastRow < 2) {
    ui.alert("등록된 사번이 아직 없습니다.");
    return;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const lines = rows.map(r => {
    const id = r[0];
    const lastSaved = r[3] || '저장 이력 없음';
    let recordCount = 0;
    let nameLabel = '';
    try {
      const parsed = JSON.parse(r[2] || '{}');
      recordCount = parsed.records ? Object.keys(parsed.records).length : 0;
      if (parsed.name) nameLabel = ' (' + parsed.name + (parsed.department ? ' · ' + parsed.department : '') + ')';
    } catch (e) {}
    return `${id}${nameLabel}  —  기록 ${recordCount}일  —  마지막 저장: ${lastSaved}`;
  });

  ui.alert("등록된 사번 (" + rows.length + "명)", lines.join('\n'), ui.ButtonSet.OK);
}

// 기존 1인용 데이터를 내 계정으로 이전 (비밀번호 해시 동기화 적용)
function migrateLegacyData() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const legacySheet = ss.getSheetByName(LEGACY_DATA_SHEET_NAME);

  if (!legacySheet) {
    ui.alert("이전할 예전 데이터(AppData 시트)가 없습니다.");
    return;
  }

  const legacyJson = legacySheet.getRange(1, 1).getValue() || "{}";
  let legacyData = {};
  try { legacyData = JSON.parse(legacyJson); } catch (e) {}
  const recordCount = legacyData.records ? Object.keys(legacyData.records).length : 0;

  const idResp = ui.prompt("어느 사번으로 이전할까요?", "본인 사번을 입력하세요. (기록 " + recordCount + "일치가 이전됩니다)", ui.ButtonSet.OK_CANCEL);
  if (idResp.getSelectedButton() !== ui.Button.OK) return;
  const employeeId = normalizeEmployeeId(idResp.getResponseText());
  if (!employeeId) { ui.alert("사번이 비어있습니다."); return; }

  const sheet = getUsersSheet();
  let row = findUserRow(sheet, employeeId);

  if (row === -1) {
    const pwResp = ui.prompt("'" + employeeId + "' 계정 비밀번호 설정", "웹에서 로그인할 때 사용할 비밀번호를 입력해주세요.", ui.ButtonSet.OK_CANCEL);
    if (pwResp.getSelectedButton() !== ui.Button.OK) return;
    const rawPw = pwResp.getResponseText().trim();
    if (!rawPw) { ui.alert("비밀번호가 비어있습니다."); return; }

    // 웹 프론트엔드와 100% 동일한 해시 규칙 적용
    const passwordHash = computeSha256(rawPw + ':' + employeeId);

    sheet.appendRow([employeeId, passwordHash, legacyJson, new Date().toLocaleString('ko-KR'), new Date().toLocaleString('ko-KR')]);
    updateReadableSheet(employeeId, legacyData);
    ui.alert("'" + employeeId + "' 계정으로 데이터 이전 및 비밀번호 설정이 완료되었습니다.\n\n웹 화면에서 해당 사번과 비밀번호로 로그인하세요.");
  } else {
    const confirm = ui.alert("'" + employeeId + "' 계정에 이미 데이터가 있습니다. 예전 데이터로 덮어쓸까요?", ui.ButtonSet.YES_NO);
    if (confirm !== ui.Button.YES) return;
    sheet.getRange(row, 3).setValue(legacyJson);
    sheet.getRange(row, 4).setValue(new Date().toLocaleString('ko-KR'));
    updateReadableSheet(employeeId, legacyData);
    ui.alert("'" + employeeId + "' 계정 데이터를 예전 데이터로 덮어썼습니다.");
  }
}

function resetUserData() {
  const ui = SpreadsheetApp.getUi();
  const idResp = ui.prompt("초기화할 사번을 입력하세요", ui.ButtonSet.OK_CANCEL);
  if (idResp.getSelectedButton() !== ui.Button.OK) return;
  const employeeId = normalizeEmployeeId(idResp.getResponseText());

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);
  if (row === -1) { ui.alert("해당 사번을 찾을 수 없습니다."); return; }

  const confirm = ui.alert(
    "'" + employeeId + "' 계정의 모든 데이터를 삭제하시겠습니까?",
    "이 작업은 되돌릴 수 없습니다. (계정 자체와 비밀번호는 유지되고, 데이터만 비워집니다)",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  sheet.getRange(row, 3).setValue("{}");
  sheet.getRange(row, 4).setValue(new Date().toLocaleString('ko-KR'));

  const readable = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(READABLE_SHEET_PREFIX + employeeId);
  if (readable) readable.clear();

  ui.alert("'" + employeeId + "' 계정 데이터를 초기화했습니다.");
}
