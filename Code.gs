// ============================================
// 일일 활동 기록 캘린더 - Google Sheets 연동 + AI 백엔드 (Gemini 버전, 팀 공유/사번별 로그인)
// ============================================

const USERS_SHEET_NAME = "Users";           // 사번별 계정과 프로필(이름/소속/설정 등)을 저장하는 시트 (한 행 = 한 사람)
const RECORDS_SHEET_NAME = "Records";       // 일일 기록(records)만 사번+연월 단위로 저장하는 시트 (한 행 = 한 사람의 한 달)
// records를 Users 시트 셀 하나에 전부 담으면 몇 년 쌓였을 때 셀당 5만자 제한에 걸릴 수 있어서
// 이 시트로 따로 분리했음. 한 행이 "한 사람의 한 달"이라 아무리 오래 써도 셀 크기가 안 커짐.
const TEAM_REPORTS_SHEET_NAME = "TeamReports"; // 팀 보고용 제출 내용 저장 시트 (한 행 = 한 사람의 하루치 제출본, 개인 카테고리 기록과는 완전히 별개)
const LEGACY_DATA_SHEET_NAME = "AppData";   // 예전 1인용 버전에서 쓰던 시트 (이전용으로만 참조)
const READABLE_SHEET_PREFIX = "일일기록_";  // 사람이 보기 편한 날짜별 표 (사번별로 시트가 따로 생김)
const BACKUP_SHEET_NAME = "AppData_백업";   // 저장할 때마다 직전 상태를 자동 백업해두는 시트 (최근 30개 유지)
const GEMINI_MODEL = "gemini-3.6-flash";    // 안정적인 기본 Flash 모델 (gemini-2.5-flash는 신규 사용자에게 더 이상 제공되지 않아 변경함)

// 사번은 현재 회사 기준 숫자 7자리. 프론트엔드(index.html)의 EMPLOYEE_ID_PATTERN과 동일하게 유지할 것
const EMPLOYEE_ID_PATTERN = /^\d{7}$/;
const EMPLOYEE_ID_INVALID_MESSAGE = "사번은 숫자 7자리입니다. 7자리보다 짧거나 길면 올바른 사번이 아닙니다.";

// 이 사번으로 로그인한 사람만 관리자 API(계정 목록/삭제/비밀번호 초기화)를 쓸 수 있음.
// 프론트엔드(index.html)의 ADMIN_EMPLOYEE_ID와 반드시 같은 값이어야 함
const ADMIN_EMPLOYEE_ID = "9999999";

// 휴지통에 있는 계정을 이 기간(일) 넘게 두면 다음 관리자 목록 조회 때 완전히 삭제됨
const TRASH_RETENTION_DAYS = 7;

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

// ===== 사번+연월별 기록(records) 저장 시트 =====
function getRecordsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RECORDS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(RECORDS_SHEET_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([["사번", "연월", "데이터(JSON)", "마지막 저장"]]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 90);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 160);
  }
  return sheet;
}

// Records 시트를 한 번에 읽어서 "사번|연월" -> 행번호 색인을 만듦 (매번 전체를 훑지 않기 위함)
function buildRecordsIndex(sheet) {
  const lastRow = sheet.getLastRow();
  const index = {};
  if (lastRow < 2) return index;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    const key = String(values[i][0]).trim() + "|" + String(values[i][1]).trim();
    index[key] = i + 2;
  }
  return index;
}

function getYearMonth(dateStr) {
  return (dateStr || "").toString().slice(0, 7); // "YYYY-MM-DD" -> "YYYY-MM"
}

// 이 사번의 모든 월별 기록을 합쳐서 하나의 records 객체로 돌려줌
function loadAllRecordsForUser(employeeId) {
  const sheet = getRecordsSheet();
  const lastRow = sheet.getLastRow();
  const merged = {};
  if (lastRow < 2) return merged;

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() !== employeeId) continue;
    try {
      Object.assign(merged, JSON.parse(values[i][2] || "{}"));
    } catch (parseErr) {}
  }
  return merged;
}

// 아직 마이그레이션 전이라 Users 시트 프로필 JSON 안에 records가 남아있는 계정을 위한 보정.
// 레거시 records + Records 시트에 이미 옮겨진 records를 합쳐서 돌려줌.
// (이 사번이 다음에 저장하면 saveRecordsForUser가 호출되면서 자동으로 Records 시트로 옮겨짐)
function loadMergedRecords(employeeId, profileData) {
  const legacyRecords = (profileData && profileData.records) ? profileData.records : {};
  const monthlyRecords = loadAllRecordsForUser(employeeId);
  return Object.assign({}, legacyRecords, monthlyRecords);
}

// records 객체(날짜별)를 연월 단위로 쪼개서 Records 시트에 저장.
// 기존 전체 덮어쓰기 방식과 동일하게, 이번 저장에 안 들어온 달은 빈 값으로 정리함.
// 내용이 그대로인 달은 다시 쓰지 않아서, 매번 전체 기록을 재저장하는 낭비를 피함.
function saveRecordsForUser(employeeId, recordsObj) {
  const sheet = getRecordsSheet();
  const index = buildRecordsIndex(sheet);
  const now = new Date().toLocaleString('ko-KR');

  const byMonth = {};
  for (const dateStr in recordsObj) {
    const ym = getYearMonth(dateStr);
    if (!ym) continue;
    if (!byMonth[ym]) byMonth[ym] = {};
    byMonth[ym][dateStr] = recordsObj[dateStr];
  }
  for (const key in index) {
    const sep = key.indexOf('|');
    if (key.slice(0, sep) !== employeeId) continue;
    const ym = key.slice(sep + 1);
    if (!(ym in byMonth)) byMonth[ym] = {};
  }

  for (const ym in byMonth) {
    const json = JSON.stringify(byMonth[ym]);
    const key = employeeId + "|" + ym;
    const row = index[key];

    if (!row) {
      if (json === "{}") continue; // 원래 없던 달을 빈 값으로 새로 만들 필요는 없음
      sheet.appendRow([employeeId, ym, json, now]);
      continue;
    }

    const currentJson = sheet.getRange(row, 3).getValue();
    if (currentJson === json) continue; // 내용 그대로면 재저장 생략

    sheet.getRange(row, 3, 1, 2).setValues([[json, now]]);
  }
}

// 관리자 화면용: Records 시트를 한 번 읽어서 사번별 기록 개수 맵을 만듦
function buildRecordCountsByUser() {
  const sheet = getRecordsSheet();
  const lastRow = sheet.getLastRow();
  const counts = {};
  if (lastRow < 2) return counts;
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (let i = 0; i < values.length; i++) {
    const employeeId = String(values[i][0]).trim();
    let n = 0;
    try { n = Object.keys(JSON.parse(values[i][2] || "{}")).length; } catch (parseErr) {}
    counts[employeeId] = (counts[employeeId] || 0) + n;
  }
  return counts;
}

function deleteRecordsForUser(employeeId) {
  const sheet = getRecordsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (let r = lastRow; r >= 2; r--) {
    if (String(sheet.getRange(r, 1).getValue()).trim() === employeeId) {
      sheet.deleteRow(r);
    }
  }
}

function renameRecordsOwner(oldEmployeeId, newEmployeeId) {
  if (oldEmployeeId === newEmployeeId) return;
  const sheet = getRecordsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === oldEmployeeId) {
      sheet.getRange(i + 2, 1).setValue(newEmployeeId);
    }
  }
}

// ===== 팀 보고(개인 카테고리 기록과 별개로 제출하는 보고) 저장 시트 =====
function getTeamReportsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TEAM_REPORTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TEAM_REPORTS_SHEET_NAME);
    sheet.getRange(1, 1, 1, 4).setValues([["사번", "날짜", "내용", "제출시각"]]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#667eea').setFontColor('white');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 320);
    sheet.setColumnWidth(4, 160);
  }
  return sheet;
}

// "날짜" 열은 "2026-08-30" 같은 문자열을 쓰지만, Sheets가 이를 자동으로 실제 Date 값으로
// 바꿔버리는 경우가 있어서(특히 열 서식이 아직 텍스트로 고정되기 전에 써진 예전 행들) 셀 값이
// 문자열일 수도, Date 객체일 수도 있음. 어느 쪽이든 "yyyy-MM-dd" 문자열로 통일해서 비교/출력함
function normalizeReportDateStr(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value).trim();
}

function findTeamReportRow(sheet, employeeId, dateStr) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === employeeId && normalizeReportDateStr(values[i][1]) === dateStr) return i + 2;
  }
  return -1;
}

function deleteTeamReportsForUser(employeeId) {
  const sheet = getTeamReportsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (let r = lastRow; r >= 2; r--) {
    if (String(sheet.getRange(r, 1).getValue()).trim() === employeeId) {
      sheet.deleteRow(r);
    }
  }
}

function renameTeamReportsOwner(oldEmployeeId, newEmployeeId) {
  if (oldEmployeeId === newEmployeeId) return;
  const sheet = getTeamReportsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === oldEmployeeId) {
      sheet.getRange(i + 2, 1).setValue(newEmployeeId);
    }
  }
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

// 휴지통(소프트 삭제)에 있거나 관리자가 비활성화해둔 계정이면 로그인/데이터 접근을 막고
// 그 이유를 문자열로 돌려줌. 정상 계정이면 null
function getAccountAccessDenialMessage(parsedData) {
  if (parsedData && parsedData.deletedAt) {
    const purgeDate = new Date(new Date(parsedData.deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const formatted = Utilities.formatDate(purgeDate, "Asia/Seoul", "MM월 dd일 HH시 mm분");
    return formatted + "에 계정이 삭제될 예정입니다.\n관리자에게 문의해주세요.";
  }
  if (parsedData && parsedData.disabled) {
    return "현재 계정이 비활성화 상태입니다. 관리자에게 문의 바랍니다.";
  }
  return null;
}

function parseUserJson(json) {
  try {
    return JSON.parse(json || "{}");
  } catch (parseErr) {
    return {};
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

  const denialMessage = getAccountAccessDenialMessage(parseUserJson(sheet.getRange(row, 3).getValue()));
  if (denialMessage) {
    return jsonResponse({ status: "error", message: denialMessage });
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
  const parsedData = parseUserJson(json);
  const denialMessage = getAccountAccessDenialMessage(parsedData);
  if (denialMessage) {
    return jsonResponse({ status: "error", message: denialMessage });
  }

  parsedData.records = loadMergedRecords(employeeId, parsedData);

  return ContentService
    .createTextOutput(JSON.stringify(parsedData))
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
    if (data.action === "adminListUsers") return handleAdminListUsers(data);
    if (data.action === "adminDeleteUser") return handleAdminDeleteUser(data);
    if (data.action === "adminResetPassword") return handleAdminResetPassword(data);
    if (data.action === "adminUpdateUserInfo") return handleAdminUpdateUserInfo(data);
    if (data.action === "adminChangeEmployeeId") return handleAdminChangeEmployeeId(data);
    if (data.action === "adminUpdateUserFeatures") return handleAdminUpdateUserFeatures(data);
    if (data.action === "adminSetDefaultFeatures") return handleAdminSetDefaultFeatures(data);
    if (data.action === "adminRestoreUser") return handleAdminRestoreUser(data);
    if (data.action === "adminPurgeUser") return handleAdminPurgeUser(data);
    if (data.action === "adminSetUserDisabled") return handleAdminSetUserDisabled(data);
    if (data.action === "adminSetTeamLead") return handleAdminSetTeamLead(data);
    if (data.action === "submitTeamReport") return handleSubmitTeamReport(data);
    if (data.action === "getMyTeamReport") return handleGetMyTeamReport(data);
    if (data.action === "getMyTeamReportHistory") return handleGetMyTeamReportHistory(data);
    if (data.action === "deleteTeamReport") return handleDeleteTeamReport(data);
    if (data.action === "teamReportOverview") return handleTeamReportOverview(data);

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

  const initialData = { name: name, department: department, disabledFeatures: getDefaultDisabledFeatures() };
  sheet.appendRow([employeeId, passwordHash, JSON.stringify(initialData), "", new Date().toLocaleString('ko-KR')]);

  return jsonResponse({ status: "success" });
}

// 관리자가 정해둔, 신규 가입 계정에 기본으로 적용할 "꺼진 기능" 목록.
// 관리자 화면에서 설정 안 했으면(스크립트 속성이 비어있으면) 전부 켜진 상태(빈 배열)로 시작함
function getDefaultDisabledFeatures() {
  const stored = PropertiesService.getScriptProperties().getProperty('DEFAULT_DISABLED_FEATURES');
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (parseErr) {
    return [];
  }
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

  const denialMessage = getAccountAccessDenialMessage(parseUserJson(sheet.getRange(row, 3).getValue()));
  if (denialMessage) {
    return jsonResponse({ status: "error", message: denialMessage });
  }

  sheet.getRange(row, 2).setValue(newPasswordHash);
  return jsonResponse({ status: "success" });
}

// 사번 변경: 비밀번호로 본인 확인 후, 새 사번이 이미 존재하면(중복) 거부하고
// 그렇지 않으면 계정 행의 사번만 바꿔치기함 (데이터는 그대로 유지)
// 사번 변경은 더 이상 본인이 스스로 할 수 없고, 관리자 화면에서만 가능함(verifyAdmin으로 인증).
// targetEmployeeId(바꾸려는 대상의 현재 사번)와 newEmployeeId(새 사번)를 받음
function handleAdminChangeEmployeeId(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const oldEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  const newEmployeeId = normalizeEmployeeId(data.newEmployeeId);

  if (!oldEmployeeId || !newEmployeeId) {
    return jsonResponse({ status: "error", message: "요청 정보가 올바르지 않습니다." });
  }
  if (!EMPLOYEE_ID_PATTERN.test(newEmployeeId)) {
    return jsonResponse({ status: "error", message: EMPLOYEE_ID_INVALID_MESSAGE });
  }
  if (oldEmployeeId === ADMIN_EMPLOYEE_ID) {
    return jsonResponse({ status: "error", message: "관리자 계정 자신의 사번은 변경할 수 없습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, oldEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다." });
  }

  if (newEmployeeId !== oldEmployeeId) {
    const dupRow = findUserRow(sheet, newEmployeeId);
    if (dupRow !== -1) {
      return jsonResponse({ status: "error", message: "이미 존재하는 사번이라 변경할 수 없습니다." });
    }
  }

  sheet.getRange(row, 1).setValue(newEmployeeId);
  renameRecordsOwner(oldEmployeeId, newEmployeeId);
  renameTeamReportsOwner(oldEmployeeId, newEmployeeId);

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
  if (lastRow < 2) return jsonResponse({ status: "success", users: [], trash: [], defaultDisabledFeatures: getDefaultDisabledFeatures() });

  const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const now = new Date();
  const users = [];
  const trash = [];
  const purgeRowNumbers = []; // 보관기한이 지나 이번에 완전히 삭제할 시트상 행 번호들
  const recordCounts = buildRecordCountsByUser(); // Records 시트로 이미 옮겨진 기록 개수 (사번별)

  rows.forEach(function(row, i) {
    const employeeId = String(row[0]).trim();
    const parsed = parseUserJson(row[2]);
    // 아직 마이그레이션 전이라 프로필 셀에 남아있는 레거시 records도 합쳐서 셈
    const legacyCount = parsed.records ? Object.keys(parsed.records).length : 0;
    const recordCount = legacyCount + (recordCounts[employeeId] || 0);

    if (parsed.deletedAt) {
      const ageDays = (now.getTime() - new Date(parsed.deletedAt).getTime()) / (24 * 60 * 60 * 1000);

      if (ageDays >= TRASH_RETENTION_DAYS) {
        purgeRowNumbers.push(i + 2); // 헤더가 1행이라 데이터는 2행부터 시작
        return;
      }

      trash.push({
        employeeId: employeeId,
        name: parsed.name || "",
        department: parsed.department || "",
        recordCount: recordCount,
        deletedAt: parsed.deletedAt,
        daysRemaining: Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - ageDays)),
        disabledFeatures: Array.isArray(parsed.disabledFeatures) ? parsed.disabledFeatures : []
      });
      return;
    }

    users.push({
      employeeId: employeeId,
      name: parsed.name || "",
      department: parsed.department || "",
      recordCount: recordCount,
      lastSaved: row[3] ? row[3].toString() : "",
      createdAt: row[4] ? row[4].toString() : "",
      disabledFeatures: Array.isArray(parsed.disabledFeatures) ? parsed.disabledFeatures : [],
      disabled: !!parsed.disabled,
      isTeamLead: !!parsed.isTeamLead,
      aiApiKey: (typeof parsed.aiApiKey === "string") ? parsed.aiApiKey : ""
    });
  });

  // 개인 API 키가 다른 계정과 겹치는지 확인(빈 값은 제외) - 계정마다 자기 것만 쓰라고 만든
  // 기능인데 실수로 같은 키를 여러 계정에 넣어둔 경우를 관리자가 알아챌 수 있게 표시해줌
  const apiKeyCounts = {};
  users.forEach(function(u) {
    if (u.aiApiKey) apiKeyCounts[u.aiApiKey] = (apiKeyCounts[u.aiApiKey] || 0) + 1;
  });
  users.forEach(function(u) {
    u.duplicateApiKey = !!(u.aiApiKey && apiKeyCounts[u.aiApiKey] > 1);
  });

  // 보관기한이 지난 휴지통 계정을 이 참에 완전 삭제. 행 번호가 밀리지 않도록 뒤에서부터 지움
  purgeRowNumbers.sort(function(a, b) { return b - a; });
  purgeRowNumbers.forEach(function(rowNumber) {
    try { purgeUserRow(sheet, rowNumber); } catch (purgeErr) {}
  });

  return jsonResponse({ status: "success", users: users, trash: trash, defaultDisabledFeatures: getDefaultDisabledFeatures() });
}

// Users 시트의 특정 행(계정)과 그 계정의 부속 데이터(읽기용 시트, Records 시트 기록)를 전부 완전히 삭제함.
// 보관기한 만료 자동삭제와 관리자의 "즉시 삭제" 둘 다 이 함수를 씀
function purgeUserRow(sheet, rowNumber) {
  const purgedEmployeeId = String(sheet.getRange(rowNumber, 1).getValue()).trim();
  sheet.deleteRow(rowNumber);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const readable = ss.getSheetByName(READABLE_SHEET_PREFIX + purgedEmployeeId);
  if (readable) ss.deleteSheet(readable);
  deleteRecordsForUser(purgedEmployeeId);
  deleteTeamReportsForUser(purgedEmployeeId);
}

// 관리자 화면: 이 계정에서 조회/메모장/AI요약 탭의 어떤 세부 기능을 쓸 수 있는지 설정.
// disabledFeatures에 들어있는 키는 그 계정에서 안 보이게 됨
function handleAdminUpdateUserFeatures(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const targetEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  const disabledFeatures = Array.isArray(data.disabledFeatures) ? data.disabledFeatures : [];

  if (!targetEmployeeId) {
    return jsonResponse({ status: "error", message: "대상 사번이 없습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, targetEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다." });
  }

  const existingJson = sheet.getRange(row, 3).getValue() || "{}";
  let existingData = {};
  try { existingData = JSON.parse(existingJson); } catch (parseErr) { existingData = {}; }

  existingData.disabledFeatures = disabledFeatures;

  sheet.getRange(row, 3).setValue(JSON.stringify(existingData));

  return jsonResponse({ status: "success" });
}

// 관리자 화면: 앞으로 새로 가입하는 계정에 기본으로 적용할 "꺼진 기능" 목록을 설정
// (이미 가입된 계정에는 영향 없음 - 그 계정들은 adminUpdateUserFeatures로 개별 조정)
function handleAdminSetDefaultFeatures(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const disabledFeatures = Array.isArray(data.disabledFeatures) ? data.disabledFeatures : [];
  PropertiesService.getScriptProperties().setProperty('DEFAULT_DISABLED_FEATURES', JSON.stringify(disabledFeatures));

  return jsonResponse({ status: "success" });
}

// 관리자 화면: 계정 삭제. 관리자 자신의 계정(ADMIN_EMPLOYEE_ID)은 잠금 방지를 위해 삭제 불가
// 관리자 화면: 계정 삭제 = 휴지통으로 이동(소프트 삭제). 실제로 행을 지우지 않고
// deletedAt만 표시해두며, TRASH_RETENTION_DAYS(7일)가 지나면 다음 목록 조회 때 완전히 삭제됨
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

  const existingData = parseUserJson(sheet.getRange(row, 3).getValue());
  existingData.deletedAt = new Date().toISOString();
  sheet.getRange(row, 3).setValue(JSON.stringify(existingData));

  return jsonResponse({ status: "success" });
}

// 관리자 화면: 휴지통에 있는 계정을 원래대로 복구 (보관기한 안에만 가능)
function handleAdminRestoreUser(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const targetEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  if (!targetEmployeeId) {
    return jsonResponse({ status: "error", message: "복구할 사번이 없습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, targetEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다. 보관기한이 지나 이미 완전히 삭제되었을 수 있습니다." });
  }

  const existingData = parseUserJson(sheet.getRange(row, 3).getValue());
  delete existingData.deletedAt;
  sheet.getRange(row, 3).setValue(JSON.stringify(existingData));

  return jsonResponse({ status: "success" });
}

// 관리자 화면: 휴지통에 있는 계정을 보관기한(7일)까지 기다리지 않고 즉시 완전히 삭제.
// 휴지통에 있는 계정(deletedAt이 있는 계정)만 대상으로 하고, 되돌릴 수 없음
function handleAdminPurgeUser(data) {
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

  const existingData = parseUserJson(sheet.getRange(row, 3).getValue());
  if (!existingData.deletedAt) {
    return jsonResponse({ status: "error", message: "휴지통에 있는 계정만 즉시 삭제할 수 있습니다." });
  }

  purgeUserRow(sheet, row);

  return jsonResponse({ status: "success" });
}

// 관리자 화면: 계정 활성화/비활성화. 비활성화된 계정은 데이터는 그대로 두고 로그인만 거부됨
function handleAdminSetUserDisabled(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const targetEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  const disabled = !!data.disabled;

  if (!targetEmployeeId) {
    return jsonResponse({ status: "error", message: "대상 사번이 없습니다." });
  }
  if (targetEmployeeId === ADMIN_EMPLOYEE_ID) {
    return jsonResponse({ status: "error", message: "관리자 계정 자신은 비활성화할 수 없습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, targetEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다." });
  }

  const existingData = parseUserJson(sheet.getRange(row, 3).getValue());
  if (disabled) {
    existingData.disabled = true;
  } else {
    delete existingData.disabled;
  }
  sheet.getRange(row, 3).setValue(JSON.stringify(existingData));

  return jsonResponse({ status: "success" });
}

// 관리자 화면: 팀장 권한 지정/해제. 팀장으로 지정된 계정은 [팀 보고] 탭에서
// 팀원들이 제출한 보고 내용을 날짜별로 모아볼 수 있게 됨 (verifyTeamLeadOrAdmin에서 이 값을 확인함)
function handleAdminSetTeamLead(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const targetEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  const isTeamLead = !!data.isTeamLead;

  if (!targetEmployeeId) {
    return jsonResponse({ status: "error", message: "대상 사번이 없습니다." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, targetEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다." });
  }

  const existingData = parseUserJson(sheet.getRange(row, 3).getValue());
  if (isTeamLead) {
    existingData.isTeamLead = true;
  } else {
    delete existingData.isTeamLead;
  }
  sheet.getRange(row, 3).setValue(JSON.stringify(existingData));

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

// 관리자 화면: 다른 계정의 이름/소속을 수정. 그 계정의 데이터(JSON) 안 name/department
// 필드만 바꿔치기하고 나머지(활동기록 등)는 그대로 둠
function handleAdminUpdateUserInfo(data) {
  if (!verifyAdmin(data)) return adminAuthFailedResponse();

  const targetEmployeeId = normalizeEmployeeId(data.targetEmployeeId);
  const newName = (data.name || "").toString().trim();
  const newDepartment = (data.department || "").toString().trim();

  if (!targetEmployeeId) {
    return jsonResponse({ status: "error", message: "대상 사번이 없습니다." });
  }
  if (!newName) {
    return jsonResponse({ status: "error", message: "이름을 입력해주세요." });
  }
  if (!newDepartment) {
    return jsonResponse({ status: "error", message: "소속을 입력해주세요." });
  }

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, targetEmployeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "존재하지 않는 사번입니다." });
  }

  const existingJson = sheet.getRange(row, 3).getValue() || "{}";
  let existingData = {};
  try { existingData = JSON.parse(existingJson); } catch (parseErr) { existingData = {}; }

  existingData.name = newName;
  existingData.department = newDepartment;

  sheet.getRange(row, 3).setValue(JSON.stringify(existingData));

  return jsonResponse({ status: "success" });
}

function handleSaveState(data, rawBody) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";

  if (!employeeId || !passwordHash) {
    return jsonResponse({ status: "error", message: "로그인 정보가 없어 저장할 수 없습니다. 다시 로그인해주세요." });
  }

  // 여러 사람이 거의 동시에 저장을 눌러도 한 번에 하나씩만 처리되도록 잠금을 걺.
  // 잠금이 없으면 Records 시트를 읽고-고치고-쓰는 중간에 다른 저장 요청이 끼어들어
  // 서로 덮어쓰면서 방금 저장한 내용이 유실될 수 있음
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonResponse({ status: "error", message: "다른 저장 요청이 진행 중이라 처리하지 못했습니다. 잠시 후 다시 시도해주세요." });
  }

  try {
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
    let existingProfile = {};
    try { existingProfile = JSON.parse(existingJson); } catch (e2) { existingProfile = {}; }

    const denialMessage = getAccountAccessDenialMessage(existingProfile);
    if (denialMessage) {
      return jsonResponse({ status: "error", message: denialMessage });
    }

    const existingRecords = loadMergedRecords(employeeId, existingProfile);
    const existingRecordCount = Object.keys(existingRecords).length;
    const incomingRecordCount = data.records ? Object.keys(data.records).length : 0;

    if (existingRecordCount >= 5 && incomingRecordCount === 0) {
      return jsonResponse({
        status: "error",
        message: "안전장치 작동: 기존에 " + existingRecordCount + "일치 기록이 저장되어 있는데, 빈 데이터로 덮어쓰려는 요청이라 저장을 거부했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요."
      });
    }

    // 안전장치 2: 직전 상태 자동 백업. 프로필 전체 + 이번 저장으로 실제로 바뀌는 달의 기록만 백업함
    // (기록 전체를 매번 백업하면 백업 시트 셀도 언젠가 5만자 제한에 걸릴 수 있어서, 안 바뀌는
    // 과거 달까지 매번 백업하지 않고 이번에 손대는 달만 백업함)
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let backupSheet = ss.getSheetByName(BACKUP_SHEET_NAME);
      if (!backupSheet) {
        backupSheet = ss.insertSheet(BACKUP_SHEET_NAME);
        backupSheet.getRange(1, 1, 1, 3).setValues([["백업 시각", "사번", "데이터(JSON)"]]);
      }
      const affectedMonths = {};
      for (const dateStr in (data.records || {})) affectedMonths[getYearMonth(dateStr)] = true;
      const backupRecords = {};
      for (const dateStr in existingRecords) {
        if (affectedMonths[getYearMonth(dateStr)]) backupRecords[dateStr] = existingRecords[dateStr];
      }
      const backupPayload = Object.assign({}, existingProfile, { records: backupRecords });
      backupSheet.insertRowBefore(2);
      backupSheet.getRange(2, 1).setValue(new Date().toLocaleString('ko-KR'));
      backupSheet.getRange(2, 2).setValue(employeeId);
      backupSheet.getRange(2, 3).setValue(JSON.stringify(backupPayload));
      const lastRow = backupSheet.getLastRow();
      if (lastRow > 31) {
        backupSheet.deleteRows(32, lastRow - 31);
      }
    } catch (backupErr) {}

    const dataToSave = {};
    for (const key in data) {
      if (key !== 'employeeId' && key !== 'passwordHash' && key !== 'records') dataToSave[key] = data[key];
    }
    // deletedAt(휴지통)/disabled(비활성화)/isTeamLead(팀장 지정)는 관리자만 관리하는 필드라
    // 클라이언트가 보내는 getFullState()에는 포함되지 않음 - 그대로 두면 다음 자동저장 때
    // 사라지므로 여기서 되살려줌
    if (existingProfile.deletedAt) dataToSave.deletedAt = existingProfile.deletedAt;
    if (existingProfile.disabled) dataToSave.disabled = existingProfile.disabled;
    if (existingProfile.isTeamLead) dataToSave.isTeamLead = existingProfile.isTeamLead;
    // records는 더 이상 프로필 셀에 저장하지 않음 - Records 시트로 따로 저장함 (아래 saveRecordsForUser)
    const jsonToSave = JSON.stringify(dataToSave);

    sheet.getRange(row, 3).setValue(jsonToSave);
    sheet.getRange(row, 4).setValue(new Date().toLocaleString('ko-KR'));

    saveRecordsForUser(employeeId, data.records || {});

    updateReadableSheet(employeeId, Object.assign({}, dataToSave, { records: data.records || {} }));

    return jsonResponse({ status: "success" });
  } finally {
    lock.releaseLock();
  }
}

const TEAM_REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 팀 보고 제출: 개인 카테고리 기록(records)과는 완전히 별개인 필드라 여기서만 다룸.
// 같은 날짜에 재제출하면 그 날짜 보고 내용을 덮어씀(갱신)
function handleSubmitTeamReport(data) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";
  const dateStr = (data.date || "").toString().trim();
  const text = (data.text || "").toString();

  if (!employeeId || !passwordHash) {
    return jsonResponse({ status: "error", message: "로그인 정보가 없습니다." });
  }
  if (!TEAM_REPORT_DATE_PATTERN.test(dateStr)) {
    return jsonResponse({ status: "error", message: "날짜가 올바르지 않습니다." });
  }

  const usersSheet = getUsersSheet();
  const row = findUserRow(usersSheet, employeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다." });
  }
  const storedHash = usersSheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }
  const denialMessage = getAccountAccessDenialMessage(parseUserJson(usersSheet.getRange(row, 3).getValue()));
  if (denialMessage) {
    return jsonResponse({ status: "error", message: denialMessage });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonResponse({ status: "error", message: "다른 요청이 진행 중이라 처리하지 못했습니다. 잠시 후 다시 시도해주세요." });
  }

  try {
    const sheet = getTeamReportsSheet();
    const submittedAt = new Date().toISOString();
    const existingRow = findTeamReportRow(sheet, employeeId, dateStr);
    if (existingRow === -1) {
      const newRow = sheet.getLastRow() + 1;
      // "날짜" 열 서식을 텍스트로 먼저 고정한 뒤 값을 써야 "2026-08-30" 같은 값이 Sheets에
      // 의해 실제 Date로 자동 변환되지 않음 (자동 변환되면 재제출 시 findTeamReportRow가
      // 기존 행을 못 찾아 갱신 대신 매번 새 행이 쌓이는 문제가 생김)
      sheet.getRange(newRow, 2).setNumberFormat('@');
      sheet.getRange(newRow, 1, 1, 4).setValues([[employeeId, dateStr, text, submittedAt]]);
    } else {
      sheet.getRange(existingRow, 3, 1, 2).setValues([[text, submittedAt]]);
    }
    return jsonResponse({ status: "success", submittedAt: submittedAt });
  } finally {
    lock.releaseLock();
  }
}

// [팀 보고] 탭을 열거나 날짜를 바꿀 때, 본인이 그 날짜에 이미 제출해둔 내용을 불러와 보여주기 위함
function handleGetMyTeamReport(data) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";
  const dateStr = (data.date || "").toString().trim();

  if (!employeeId || !passwordHash) {
    return jsonResponse({ status: "error", message: "로그인 정보가 없습니다." });
  }
  if (!TEAM_REPORT_DATE_PATTERN.test(dateStr)) {
    return jsonResponse({ status: "error", message: "날짜가 올바르지 않습니다." });
  }

  const usersSheet = getUsersSheet();
  const row = findUserRow(usersSheet, employeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다." });
  }
  const storedHash = usersSheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }

  const sheet = getTeamReportsSheet();
  const existingRow = findTeamReportRow(sheet, employeeId, dateStr);
  if (existingRow === -1) {
    return jsonResponse({ status: "success", text: "", submittedAt: "" });
  }
  const rowValues = sheet.getRange(existingRow, 3, 1, 2).getValues()[0];
  return jsonResponse({ status: "success", text: rowValues[0] || "", submittedAt: rowValues[1] || "" });
}

// [팀 보고] "내 제출 내역"에서 실수로 제출한 건을 본인이 직접 지울 수 있게 함. 본인 것만 지울 수 있고,
// 팀장/관리자라도 남의 제출 내용을 이 액션으로 지울 수는 없음(오직 본인 employeeId+비밀번호로만 인증)
function handleDeleteTeamReport(data) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";
  const dateStr = (data.date || "").toString().trim();

  if (!employeeId || !passwordHash) {
    return jsonResponse({ status: "error", message: "로그인 정보가 없습니다." });
  }
  if (!TEAM_REPORT_DATE_PATTERN.test(dateStr)) {
    return jsonResponse({ status: "error", message: "날짜가 올바르지 않습니다." });
  }

  const usersSheet = getUsersSheet();
  const row = findUserRow(usersSheet, employeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다." });
  }
  const storedHash = usersSheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonResponse({ status: "error", message: "다른 요청이 진행 중이라 처리하지 못했습니다. 잠시 후 다시 시도해주세요." });
  }

  try {
    const sheet = getTeamReportsSheet();
    // 같은 날짜로 예전 버그 때문에 쌓인 중복 행이 남아있을 수 있으므로, 하나만 지우지 않고
    // 이 사람의 그 날짜 행을 전부 지움(뒤에서부터 지워야 인덱스가 안 밀림)
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (let i = values.length - 1; i >= 0; i--) {
        if (String(values[i][0]).trim() === employeeId && normalizeReportDateStr(values[i][1]) === dateStr) {
          sheet.deleteRow(i + 2);
        }
      }
    }
    return jsonResponse({ status: "success" });
  } finally {
    lock.releaseLock();
  }
}

// [팀 보고] 탭에서 "내가 언제 뭘 제출했는지" 본인 제출 이력을 최신순으로 모아 보여주기 위함
function handleGetMyTeamReportHistory(data) {
  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";

  if (!employeeId || !passwordHash) {
    return jsonResponse({ status: "error", message: "로그인 정보가 없습니다." });
  }

  const usersSheet = getUsersSheet();
  const row = findUserRow(usersSheet, employeeId);
  if (row === -1) {
    return jsonResponse({ status: "error", message: "등록되지 않은 사번입니다." });
  }
  const storedHash = usersSheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) {
    return jsonResponse({ status: "error", message: "비밀번호가 일치하지 않습니다." });
  }

  const sheet = getTeamReportsSheet();
  const lastRow = sheet.getLastRow();
  // 예전에 "날짜" 열이 Date로 자동 변환됐던 행들 때문에 같은 날짜로 여러 행이 남아있을 수 있어서,
  // 날짜별로 제출시각이 가장 최신인 것 하나만 남김(날짜별 최신 버전만 이력에 보여줌)
  const latestByDate = {};

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    values.forEach(function(r) {
      if (String(r[0]).trim() !== employeeId) return;
      const text = r[2] || "";
      if (!text) return; // 빈 내용으로 재제출된 건(사실상 취소) 목록에서 제외

      const dateStr = normalizeReportDateStr(r[1]);
      const submittedAt = r[3] || "";
      const existing = latestByDate[dateStr];
      if (!existing || String(submittedAt) > String(existing.submittedAt)) {
        latestByDate[dateStr] = { date: dateStr, text: text, submittedAt: submittedAt };
      }
    });
  }

  const items = Object.keys(latestByDate).map(function(d) { return latestByDate[d]; });
  items.sort(function(a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });

  return jsonResponse({ status: "success", items: items });
}

// 관리자이거나, 관리자가 팀장으로 지정해둔(isTeamLead) 계정만 통과함
function verifyTeamLeadOrAdmin(data) {
  if (verifyAdmin(data)) return true;

  const employeeId = normalizeEmployeeId(data.employeeId);
  const passwordHash = data.passwordHash || "";
  if (!employeeId || !passwordHash) return false;

  const sheet = getUsersSheet();
  const row = findUserRow(sheet, employeeId);
  if (row === -1) return false;

  const storedHash = sheet.getRange(row, 2).getValue();
  if (String(storedHash) !== passwordHash) return false;

  const profile = parseUserJson(sheet.getRange(row, 3).getValue());
  return !!profile.isTeamLead;
}

// [팀 보고] 탭의 팀장용 화면: 지정한 날짜에 제출된 모든 팀원의 보고를 모아서 돌려줌
function handleTeamReportOverview(data) {
  if (!verifyTeamLeadOrAdmin(data)) {
    return jsonResponse({ status: "error", message: "팀장 권한이 있는 계정만 볼 수 있습니다." });
  }

  const dateStr = (data.date || "").toString().trim();
  if (!TEAM_REPORT_DATE_PATTERN.test(dateStr)) {
    return jsonResponse({ status: "error", message: "날짜가 올바르지 않습니다." });
  }

  const reportsSheet = getTeamReportsSheet();
  const lastRow = reportsSheet.getLastRow();
  // 예전에 "날짜" 열이 Date로 자동 변환됐던 행들 때문에 같은 사람이 같은 날짜로 여러 행이
  // 남아있을 수 있어서, 사람별로 제출시각이 가장 최신인 것 하나만 남김
  const latestByEmployeeId = {};

  if (lastRow >= 2) {
    const values = reportsSheet.getRange(2, 1, lastRow - 1, 4).getValues();

    const usersSheet = getUsersSheet();
    const userInfoById = {};
    const usersLastRow = usersSheet.getLastRow();
    if (usersLastRow >= 2) {
      const userRows = usersSheet.getRange(2, 1, usersLastRow - 1, 3).getValues();
      userRows.forEach(function(r) {
        const id = String(r[0]).trim();
        const profile = parseUserJson(r[2]);
        userInfoById[id] = { name: profile.name || "", department: profile.department || "" };
      });
    }

    values.forEach(function(r) {
      const rowDate = normalizeReportDateStr(r[1]);
      if (rowDate !== dateStr) return;
      const text = r[2] || "";
      if (!text) return; // 빈 내용으로 재제출된 건(사실상 취소) 목록에서 제외

      const employeeId = String(r[0]).trim();
      const submittedAt = r[3] || "";
      const existing = latestByEmployeeId[employeeId];
      if (existing && String(submittedAt) <= String(existing.submittedAt)) return;

      const info = userInfoById[employeeId] || {};
      latestByEmployeeId[employeeId] = {
        employeeId: employeeId,
        name: info.name || "",
        department: info.department || "",
        text: text,
        submittedAt: submittedAt
      };
    });
  }

  const items = Object.keys(latestByEmployeeId).map(function(id) { return latestByEmployeeId[id]; });
  items.sort(function(a, b) { return a.employeeId < b.employeeId ? -1 : (a.employeeId > b.employeeId ? 1 : 0); });

  return jsonResponse({ status: "success", items: items });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function missingKeyResponse() {
  return jsonResponse({
    status: "error",
    message: "Gemini API 키가 없습니다. [환경설정] 탭에서 본인의 Gemini API 키를 입력해 저장해주세요."
  });
}

// 공용 API 키는 없음 - 반드시 각자 환경설정에 등록해둔 본인 Gemini API 키(요청에 담겨 온 userApiKey)로만 동작함
function resolveApiKey(data) {
  const userKey = (data && data.userApiKey) ? data.userApiKey.toString().trim() : "";
  return userKey;
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
    const errMsg = (responseData.error && responseData.error.message) ? responseData.error.message : "";
    // Gemini API가 돌려주는 오류 메시지는 영어라서, 그대로 사용자에게 보여주지 않고
    // 한국어 안내문으로 감싸고 원문은 참고용으로 괄호에 덧붙임
    throw new Error("AI 응답을 받아오지 못했습니다 (" + (errMsg || "알 수 없는 오류") + ")");
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

const DAILY_SUMMARY_DEFAULT_ITEM_COUNT = 5;
const DAILY_SUMMARY_MIN_ITEM_COUNT = 1;
const DAILY_SUMMARY_MAX_ITEM_COUNT = 10;

function normalizeDailySummaryItemCount(rawValue) {
  const n = parseInt(rawValue, 10);
  if (!Number.isFinite(n)) return DAILY_SUMMARY_DEFAULT_ITEM_COUNT;
  return Math.min(DAILY_SUMMARY_MAX_ITEM_COUNT, Math.max(DAILY_SUMMARY_MIN_ITEM_COUNT, n));
}

function buildDailySummarySystemPrompt(includeFixedFirstItem, itemCount) {
  const fixedItemRule = includeFixedFirstItem
    ? "- 반드시 '1. " + DAILY_SUMMARY_FIXED_ITEM_TEXT + "'를 첫 번째 항목으로 고정해서 넣으세요. 그 다음 번호부터 그날 실제로 기록된 활동들을 이어서 쓰세요.\n"
    : "- 그날 실제로 기록된 활동들만 번호를 매겨 쓰세요 (다른 사람 업무인 '" + DAILY_SUMMARY_FIXED_ITEM_TEXT + "' 같은 항목을 지어내서 넣지 마세요).\n";

  return (
    "당신은 퇴근 전 팀에 공유하는 '오늘 한 일' 목록을 정리해주는 도우미입니다. " +
    "사용자가 작성한 [오늘 작성한 활동 기록]만을 근거로 번호를 매긴 짧은 목록을 작성하세요.\n\n" +
    fixedItemRule +
    "- 전체 항목은 총 " + itemCount + "개로 정리하세요. 기록된 활동이 " + itemCount + "개보다 많으면 비슷하거나 관련된 내용끼리 묶어서 " + itemCount + "개 이내로 압축하고, 기록된 활동이 " + itemCount + "개보다 적으면 있는 내용만 쓰고 없는 내용을 지어내서 채우지 마세요.\n" +
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
  const itemCount = normalizeDailySummaryItemCount(data.itemCount);

  if (!logText) {
    return jsonResponse({ status: "error", message: "이 날짜에 작성된 활동기록이 없습니다." });
  }

  const userPrompt = `[날짜] ${dateLabel}\n\n[오늘 작성한 활동 기록]\n${logText}`;
  const contents = [{ role: "user", parts: [{ text: userPrompt }] }];

  return callGeminiAndRespond(apiKey, contents, buildDailySummarySystemPrompt(includeFixedFirstItem, itemCount));
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

// 인재육성/성장계획 영역만 팀원(본인 성장계획만) / 파트장·팀장(후배 육성 포함)에 따라 안내문이 갈림
const GOAL_AREA_GUIDE_GROWTH_SELF = "- 성장계획: 파트원(후배) 육성이 아니라, 본인의 지식·역량 습득 계획과 커리어 성장 계획만 다룹니다.";
const GOAL_AREA_GUIDE_GROWTH_WITH_TALENT_DEV = "- 인재육성/성장계획: 본인의 성장계획뿐 아니라, 파트원(후배) 육성 방안과 팀 전체의 역량 강화 계획을 함께 다룹니다.";

// 실제 작성 사례를 보면 '인재육성/성장계획'과 '핵심가치'는 평가기준(A/B/C) 없이 서술형으로만 작성됨
const GOAL_AREA_SKIP_EVAL_CRITERIA = { growth: true, corevalue: true };

function buildGoalSystemPrompt(area, options) {
  options = options || {};
  let label = GOAL_AREA_LABELS[area] || GOAL_AREA_LABELS.kpi;
  let guide = GOAL_AREA_GUIDES[area] || GOAL_AREA_GUIDES.kpi;
  const itemCount = GOAL_AREA_ITEM_COUNT[area] || 1;
  const skipEvalCriteria = !!GOAL_AREA_SKIP_EVAL_CRITERIA[area];

  if (area === "growth") {
    const includeTalentDev = options.includeTalentDev === true;
    label = includeTalentDev ? "인재육성 / 성장계획" : "성장계획";
    guide = includeTalentDev ? GOAL_AREA_GUIDE_GROWTH_WITH_TALENT_DEV : GOAL_AREA_GUIDE_GROWTH_SELF;
  }

  const itemTemplateFull =
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

  const itemTemplateNoEval =
    "[과제명을 대괄호 안에 한 줄로]\n" +
    "1. 목표(Objective)\n(도전적인 1~3문장 서술)\n" +
    "2. 핵심결과(Key Result)\n1) KR1:\n2) KR2:\n" +
    "3. 현 수준 평가(등급 표기)\n" +
    "4. GAP(고민/이슈사항)\n" +
    "5. 주요전략\n" +
    "6. 한일/할일\n1) 한일\n2) 할일\n" +
    "완료일:\n" +
    "카테고리: " + label;

  const itemTemplate = skipEvalCriteria ? itemTemplateNoEval : itemTemplateFull;

  const styleGuide =
    "[작성 스타일 가이드]\n" +
    "- 실제 업무 계획 문서처럼 전문적인 문어체(예: ~하겠습니다, ~하고자 합니다)로 작성합니다.\n" +
    "- '목표'는 도전적이면서 명확한 방향을 1~3문장으로 제시합니다.\n" +
    (skipEvalCriteria ? "" : "- '핵심결과'와 '평가기준'은 가능한 한 정량적 수치(건수, 금액, %, 일정 등)로 표현합니다.\n") +
    "- '현 수준 평가'는 현재 잘하고 있는 부분과 한계를 함께 2~4문장으로 균형 있게 서술합니다.\n" +
    "- 'GAP'은 문제의 근본 원인과 구조적 이슈를 3~5문장으로 구체적으로 분석합니다.\n" +
    "- '주요전략'은 단계적이고 실행 가능한 방안을 3~5문장으로 구체적으로 제시합니다.\n" +
    "- '한일/할일'의 할일은 4~6개의 구체적인 실행 항목을 나열합니다.\n" +
    "- 막연한 이야기 대신, [참고 자료]와 [본인이 적은 방향성/메모]의 맥락을 반영한 구체적인 내용으로 작성합니다.";

  return (
    "당신은 목표수립(OKR) 문서 작성을 도와주는 도우미입니다. 작성 영역: '" + label + "'\n\n" +
    "이 문서는 지난 활동을 요약하는 보고서가 아니라, 앞으로 하반기 동안 수행하겠다는 목표를 선언하는 문서입니다. " +
    "[참고 자료]로 주어지는 과거 활동 기록은 '현 수준 평가'와 'GAP'을 판단하기 위한 배경 정보로만 활용하고, " +
    "목표(Objective)/핵심결과/주요전략/한일·할일은 과거 사실 요약이 아니라 하반기에 실행하겠다는 미래 시점의 계획으로 서술하세요.\n\n" +
    guide + "\n\n" +
    styleGuide + "\n\n" +
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
  const includeTalentDev = !!data.includeTalentDev;

  const userPrompt =
    `[참고 자료 - 현 수준 평가용 과거 활동 기록 (그대로 요약하지 말 것)]\n${logText || '(제공된 활동 기록 없음)'}\n\n` +
    `[본인이 적은 방향성/메모]\n${note || '(작성한 메모 없음)'}`;

  const contents = [{ role: "user", parts: [{ text: userPrompt }] }];
  return callGeminiAndRespond(apiKey, contents, buildGoalSystemPrompt(area, { includeTalentDev }));
}

function handleGoalRevise(data) {
  const apiKey = resolveApiKey(data);
  if (!apiKey) return missingKeyResponse();

  const area = data.area || "kpi";
  const history = Array.isArray(data.history) ? data.history : [];
  const instruction = data.instruction || "";
  const includeTalentDev = !!data.includeTalentDev;

  if (!instruction || history.length === 0) {
    return jsonResponse({ status: "error", message: "수정 요청 내용이 비어있습니다." });
  }

  const contents = history.map(turn => ({
    role: turn.role === "model" ? "model" : "user",
    parts: [{ text: turn.text || "" }]
  }));
  contents.push({ role: "user", parts: [{ text: instruction }] });

  return callGeminiAndRespond(apiKey, contents, buildGoalSystemPrompt(area, { includeTalentDev }));
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
  const recordCounts = buildRecordCountsByUser();
  const lines = rows.map(r => {
    const id = String(r[0]).trim();
    const lastSaved = r[3] || '저장 이력 없음';
    let recordCount = recordCounts[id] || 0;
    let nameLabel = '';
    try {
      const parsed = JSON.parse(r[2] || '{}');
      if (parsed.records) recordCount += Object.keys(parsed.records).length; // 마이그레이션 전 레거시분
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
  const legacyRecords = legacyData.records || {};
  const recordCount = Object.keys(legacyRecords).length;

  // records는 Records 시트로 따로 저장하고, 프로필 셀에는 나머지 필드만 남김
  const legacyProfile = Object.assign({}, legacyData);
  delete legacyProfile.records;
  const profileJson = JSON.stringify(legacyProfile);

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

    sheet.appendRow([employeeId, passwordHash, profileJson, new Date().toLocaleString('ko-KR'), new Date().toLocaleString('ko-KR')]);
    saveRecordsForUser(employeeId, legacyRecords);
    updateReadableSheet(employeeId, legacyData);
    ui.alert("'" + employeeId + "' 계정으로 데이터 이전 및 비밀번호 설정이 완료되었습니다.\n\n웹 화면에서 해당 사번과 비밀번호로 로그인하세요.");
  } else {
    const confirm = ui.alert("'" + employeeId + "' 계정에 이미 데이터가 있습니다. 예전 데이터로 덮어쓸까요?", ui.ButtonSet.YES_NO);
    if (confirm !== ui.Button.YES) return;
    sheet.getRange(row, 3).setValue(profileJson);
    sheet.getRange(row, 4).setValue(new Date().toLocaleString('ko-KR'));
    saveRecordsForUser(employeeId, legacyRecords);
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
  deleteRecordsForUser(employeeId);

  const readable = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(READABLE_SHEET_PREFIX + employeeId);
  if (readable) readable.clear();

  ui.alert("'" + employeeId + "' 계정 데이터를 초기화했습니다.");
}
