const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxlH6_fhS_6p7ioSysh9rCSw0LxRCMtRNuhCdTUyG8vR451yW1aptfrlrURqO-Y1kQ/exec";
        // 이 사번으로 로그인하면 일반 탭 대신 관리자 전용 화면(계정 관리)만 보여줌. Code.gs의
        // ADMIN_EMPLOYEE_ID와 반드시 같은 값이어야 함
        const ADMIN_EMPLOYEE_ID = "9999999";

        const COLOR_PALETTE = [
            '#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1',
            '#54a0ff', '#5f27cd', '#ee5a6f'
        ];
        
        // 대한민국 공휴일 (대체공휴일·임시공휴일 포함)
        const KR_HOLIDAYS = {
            // 2025년
            "2025-01-01": "신정",
            "2025-01-28": "설날연휴",
            "2025-01-29": "설날",
            "2025-01-30": "설날연휴",
            "2025-03-01": "삼일절",
            "2025-03-03": "대체공휴일(삼일절)",
            "2025-05-05": "어린이날·부처님오신날",
            "2025-05-06": "대체공휴일",
            "2025-06-06": "현충일",
            "2025-08-15": "광복절",
            "2025-10-03": "개천절",
            "2025-10-05": "추석연휴",
            "2025-10-06": "추석",
            "2025-10-07": "추석연휴",
            "2025-10-08": "대체공휴일(추석)",
            "2025-10-09": "한글날",
            "2025-12-25": "크리스마스",
            // 2026년
            "2026-01-01": "신정",
            "2026-02-16": "설날연휴",
            "2026-02-17": "설날",
            "2026-02-18": "설날연휴",
            "2026-03-01": "삼일절",
            "2026-03-02": "대체공휴일(삼일절)",
            "2026-05-05": "어린이날",
            "2026-05-24": "부처님오신날",
            "2026-05-25": "대체공휴일(부처님오신날)",
            "2026-06-03": "전국동시지방선거",
            "2026-06-06": "현충일",
            "2026-07-17": "제헌절",
            "2026-08-15": "광복절",
            "2026-08-17": "대체공휴일(광복절)",
            "2026-09-24": "추석연휴",
            "2026-09-25": "추석",
            "2026-09-26": "추석연휴",
            "2026-10-03": "개천절",
            "2026-10-05": "대체공휴일(개천절)",
            "2026-10-09": "한글날",
            "2026-12-25": "크리스마스",
            // 2027년
            "2027-01-01": "신정",
            "2027-02-06": "설날연휴",
            "2027-02-07": "설날",
            "2027-02-08": "설날연휴",
            "2027-02-09": "대체공휴일(설날)",
            "2027-03-01": "삼일절",
            "2027-05-05": "어린이날",
            "2027-05-13": "부처님오신날",
            "2027-06-06": "현충일",
            "2027-07-17": "제헌절",
            "2027-08-15": "광복절",
            "2027-08-16": "대체공휴일(광복절)",
            "2027-09-14": "추석연휴",
            "2027-09-15": "추석",
            "2027-09-16": "추석연휴",
            "2027-10-03": "개천절",
            "2027-10-04": "대체공휴일(개천절)",
            "2027-10-09": "한글날",
            "2027-10-11": "대체공휴일(한글날)",
            "2027-12-25": "크리스마스"
        };
        
        let currentDate = new Date();
        let selectedDate = null;
        let records = {};       // { "2026-08-25": { "수처리": "내용" } }
        let events = [];        // [{ id, title, start, end, color }]
        let categories = ['카테고리1', '카테고리2', '카테고리3'];
        let categoryColors = { '카테고리1': '#ff6b6b', '카테고리2': '#ff9f43', '카테고리3': '#54a0ff' }; // 빨강/주황/파랑
        let categoryBoxHeights = {}; // { "수처리": 180 } - 카테고리별 기본값
        let dateCategoryBoxHeights = {}; // { "2026-08-26": { "수처리": 300 } } - 날짜별 개별 지정값 (있으면 기본값보다 우선)
        let hiddenCategoriesByDate = {}; // { "2026-08-26": ["보일러"] } - 그 날짜에 안 쓰는 카테고리 숨김 목록
        let dateCategoryOrder = {}; // { "2026-08-26": ["보일러","수처리","냉동기"] } - 그 날짜에서만 적용되는 카테고리 박스 순서
        let categoryCollapseOverride = {}; // { "2026-08-25::보일러": true/false } - 사용자가 직접 접기/펼치기를 클릭해서 자동 규칙을 덮어쓴 경우 (세션 동안만 유지)
        let draggedCategoryId = null; // 드래그 중인 카테고리 박스
        let notesContent = '';
        let todoItems = []; // [{ id, text, done }] - 해야 할 일 체크리스트
        let selectedCategoriesForQuery = new Set();
        let queryStartDate = null;
        let queryEndDate = null;
        let editingEventId = null;
        let editingProjectId = null;
        // 팀 공유 버전: 공유 비밀번호 하나 대신, 사번별로 각자 계정을 갖는 방식
        let editUnlocked = false;     // 로그인 여부 (기존 코드 곳곳에서 이 이름으로 "편집 가능 여부"를 참조하고 있어 그대로 유지)
        let currentEmployeeId = '';   // 로그인한 사번
        let currentPasswordHash = ''; // 서버에 매 요청마다 같이 보내는 비밀번호 해시 (평문 비밀번호는 서버로 보내지 않음)
        let currentUserName = '';       // 로그인한 계정의 이름
        let currentUserDepartment = ''; // 로그인한 계정의 소속

        // 사번은 현재 회사 기준 숫자 7자리. 회원가입/계정정보 수정 시 이 규칙으로 검증함
        const EMPLOYEE_ID_PATTERN = /^\d{7}$/;
        const EMPLOYEE_ID_INVALID_MSG = '사번은 숫자 7자리입니다. 7자리보다 짧거나 길면 올바른 사번이 아닙니다.';
        let selectedColor = COLOR_PALETTE[0];
        
        // 탭 관리
        const TAB_LABELS = {
            calendar: '📅 달력 & 활동기록',
            category: '📊 카테고리 관리',
            query: '🔍 검색 & 조회',
            notes: '📝 할일 & 메모',
            ai: '🤖 AI 도우미',
            improvement: '💡 개선/절감 과제',
            trend: '📈 설비 데이터 분석',
            maintenance: '🔧 정비계획',
            teamReport: '📋 팀 보고',
            settings: '⚙️ 환경설정'
        };
        let tabOrder = ['calendar', 'category', 'query', 'notes', 'ai', 'improvement', 'trend', 'maintenance', 'teamReport', 'settings'];
        let activeTabId = 'calendar';
        let draggedTabId = null;
        // 환경설정에서 꺼둔(비활성화한) 탭 id 목록. 'settings'는 절대 여기 들어가지 않음(항상 표시)
        let disabledTabIds = [];
        // 개인이 환경설정에 입력해 저장한 본인 Gemini API 키. 공용 키는 없어서 AI 기능은 전부 이 키가 있어야만 동작함
        let personalAiApiKey = '';

        // 관리자가 계정별로(또는 신규 가입 기본값으로) 개별 켜고 끌 수 있는 세부 기능 목록.
        // "사용 가능한 기능 설정"/"신규 가입 기본값" 체크리스트가 전부 이 배열 하나로 만들어지므로,
        // 새 탭이나 탭 안의 새 기능을 추가할 때는 여기에도 그룹/키를 추가해야 그 체크리스트에 바로 나타남
        // (환경설정 탭은 관리자가 끌 수 없는 필수 화면이라 여기 넣지 않음)
        const FEATURE_GROUPS = [
            {
                key: 'calendar',
                label: '📅 달력 & 활동기록',
                features: {
                    activityRecord: '📅 달력 & 활동기록'
                }
            },
            {
                key: 'category',
                label: '⚙️ 카테고리 관리',
                features: {
                    categoryManage: '⚙️ 카테고리 관리'
                }
            },
            {
                key: 'query',
                label: '🔍 검색 & 조회',
                features: {
                    keywordSearch: '🔎 통합 검색',
                    periodQuery: '📆 기간별 카테고리 조회'
                }
            },
            {
                key: 'notes',
                label: '📝 할일 & 메모',
                features: {
                    todoList: '✅ 해야 할 일',
                    freeNotes: '📝 메모장'
                }
            },
            {
                key: 'ai',
                label: '🤖 AI 도우미',
                features: {
                    dailySummary: '📝 일일 업무 요약',
                    weeklySummary: '🗓️ 이번주 업무 요약',
                    monthlyFeedback: '🤖 AI 월별 피드백',
                    goalSetting: '🎯 목표수립'
                }
            },
            {
                key: 'improvement',
                label: '💡 개선/절감 과제',
                features: {
                    savingsProjects: '💡 개선/절감 과제 관리'
                }
            },
            {
                key: 'trend',
                label: '📈 설비 데이터 분석',
                features: {
                    trendAnalysis: '📈 설비 데이터 경향 분석'
                }
            },
            {
                key: 'maintenance',
                label: '🔧 정비계획',
                features: {
                    maintenanceSchedule: '🔧 정비계획 관리'
                }
            },
            {
                key: 'teamReport',
                label: '📋 팀 보고',
                features: {
                    teamReport: '📋 팀 보고'
                }
            }
        ];
        // 위 그룹들을 { 키: 라벨 } 하나로 합친 조회용 맵
        const FEATURE_LABELS = FEATURE_GROUPS.reduce((acc, group) => Object.assign(acc, group.features), {});
        // 계정별 관리자 설정과 무관하게 코드 레벨에서 임시로 꺼두는 기능 키 목록.
        // 목표수립 임시 비활성화(관련 코드/UI는 그대로 두고 화면에서만 숨김) - 되살리려면 이 배열을 비우면 됨
        const FORCE_DISABLED_FEATURES = ['goalSetting'];
        // 관리자가 이 계정에서 꺼둔 세부 기능 키 목록 (서버에서 로그인 시 받아옴). 본인은 못 바꾸고 관리자만 조정 가능
        let disabledFeatures = [];
        // 이 계정이 관리자가 지정한 팀장인지 (서버에서 로그인 시 받아옴). true면 [팀 보고] 탭에서
        // 팀원들의 제출 현황을 모아볼 수 있음. 관리자 계정은 이 값과 무관하게 항상 볼 수 있음
        let isTeamLead = false;

        const DEFAULT_AI_TEMPLATE = `[월간 업무 피드백]

■ 잘한점(한일)

① 월 목표 (Objective)


② 핵심 결과 (KR, Key Result)


③ 실행 전략 및 노력 과정


④ 성과 및 결과


■ 개선/보완할 점(할일)

① 부족했던 점 (한계 인식)


② 개선·보완 계획
`;
        let aiTemplateContent = '';
        let savingsProjects = []; // [{id, title, month, targetAmount, actualAmount, status, note}] - 에너지/비용절감 과제 트래커
        let trendSubject = ''; // 설비·측정 항목 (매번 같은 값을 다시 적지 않도록 저장)
        let trendSpec = '';    // 관리 기준 (동일)
        let maintenanceSchedule = []; // [{id, equipment, area, item, sop, cycle, status, lastDone, nextDue, note, updatedAt}]
        let editingMaintenanceId = null;
        
        // 로그인 성공(자동 로그인 또는 직접 로그인) 후에만 호출됨. 로그인되기 전까지는
        // 이 함수가 아예 실행되지 않으므로, 화면에는 로그인 모달 외에 아무 데이터도 그려지지 않음
        // (이전에 이 브라우저에 남아있던 캐시 데이터가 로그인 전에 잠깐이라도 보이는 걸 방지)
        let appUIInitialized = false;
        async function initAppUI() {
            if (appUIInitialized) return;
            appUIInitialized = true;

            loadRecords();
            loadEvents();
            loadCategories();
            loadCategoryColors();
            loadCategoryBoxHeights();
            loadHiddenCategories();
            loadCollapsedUpcomingCards();
            loadTabOrder();
            loadDisabledTabIds();
            loadPersonalAiApiKey();
            loadDisabledFeatures();
            notesContent = localStorage.getItem('freeNotes') || '';
            currentUserName = localStorage.getItem('accountName') || '';
            currentUserDepartment = localStorage.getItem('accountDepartment') || '';
            loadTodoItems();
            aiTemplateContent = localStorage.getItem('aiTemplate') || DEFAULT_AI_TEMPLATE;
            const storedProjects = localStorage.getItem('savingsProjects');
            savingsProjects = storedProjects ? safeJsonParse(storedProjects, [], 'savingsProjects') : [];
            trendSubject = localStorage.getItem('trendSubject') || '';
            trendSpec = localStorage.getItem('trendSpec') || '';
            const storedMaintenance = localStorage.getItem('maintenanceSchedule');
            maintenanceSchedule = storedMaintenance ? safeJsonParse(storedMaintenance, [], 'maintenanceSchedule') : [];

            renderTabs();
            renderCategories();
            renderCategorySelector();
            renderColorPicker();
            renderCalendar();
            goToday();
            applyNotesContent();
            setupNotesAutosave();
            applyAITemplate();
            setupAITemplateAutosave();
            renderGoalAreas();
            renderSavingsProjects();
            applyTrendSettings();
            setupTrendSettingsAutosave();
            renderMaintenanceSchedule();
            renderSettingsTab();
            applyFeatureRestrictions();
            setupNotesSplitResizer();
            startLiveClock();

            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            document.getElementById('startDate').value = formatDate(firstDay);
            document.getElementById('endDate').value = formatDate(lastDay);
            document.getElementById('aiStartDate').value = formatDate(firstDay);
            document.getElementById('aiEndDate').value = formatDate(lastDay);
            document.getElementById('dailySummaryDate').value = formatDate(today);
            document.getElementById('goalRefStartDate').value = formatDate(firstDay);
            document.getElementById('goalRefEndDate').value = formatDate(today);
        }

        function init() {
            applyThemeButtonLabel(); // <head>의 조기 스크립트가 이미 dark-mode 클래스를 적용해뒀으므로 버튼 표시만 맞춰줌
            setupGlobalEditLockInterceptor();
            setupModalDismissHandlers();

            // 홈페이지에 접속하면 항상 로그아웃 상태로 시작: 로그인 모달만 띄워두고 홈페이지
            // 내용은 그리지 않음 (로그인/회원가입 성공 시 그 안에서 initAppUI/loadAllFromServer로 이어짐)
            resetToLoggedOutState();
        }
        
        // ===== 저장/로드 (로컬 캐시) =====
        // localStorage에 손상된 값이 하나 있어도 앱 전체 초기화가 멈추지 않도록
        // JSON.parse 실패 시 대체값을 반환한다.
        function safeJsonParse(str, fallback, label) {
            let parsed;
            try {
                parsed = JSON.parse(str);
            } catch (e) {
                console.warn('localStorage 데이터를 불러오지 못했습니다' + (label ? ` (${label})` : '') + ':', e);
                return fallback;
            }
            // 파싱은 성공했지만 기대한 것과 다른 형태(예: 배열이어야 하는데 객체/숫자 등)면
            // 호출부에서 .filter()/new Set() 등을 쓸 때 그대로 예외가 나서 초기화 전체가
            // 멈출 수 있으므로, fallback과 같은 형태(배열/객체)인지 확인 후 아니면 fallback으로 대체
            const expectArray = Array.isArray(fallback);
            const expectPlainObject = !expectArray && fallback && typeof fallback === 'object';
            const gotArray = Array.isArray(parsed);
            const gotPlainObject = !gotArray && parsed && typeof parsed === 'object';
            if ((expectArray && !gotArray) || (expectPlainObject && !gotPlainObject)) {
                console.warn('localStorage 데이터 형식이 올바르지 않습니다' + (label ? ` (${label})` : '') + ':', parsed);
                return fallback;
            }
            return parsed;
        }

        function loadRecords() {
            const stored = localStorage.getItem('activityRecords');
            records = stored ? safeJsonParse(stored, {}, 'activityRecords') : {};
        }

        function loadEvents() {
            const stored = localStorage.getItem('calendarEvents');
            events = stored ? safeJsonParse(stored, [], 'calendarEvents') : [];
        }

        function loadCategories() {
            const stored = localStorage.getItem('activityCategories');
            if (stored) categories = safeJsonParse(stored, categories, 'activityCategories');
        }

        function loadCategoryColors() {
            const stored = localStorage.getItem('categoryColors');
            categoryColors = stored ? safeJsonParse(stored, {}, 'categoryColors') : {};
            
            // 색상이 없는 카테고리는 팔레트에서 순서대로 배정
            let paletteIndex = 0;
            for (const category of categories) {
                if (!categoryColors[category]) {
                    categoryColors[category] = COLOR_PALETTE[paletteIndex % COLOR_PALETTE.length];
                    paletteIndex++;
                }
            }
        }
        
        function loadCategoryBoxHeights() {
            const stored = localStorage.getItem('categoryBoxHeights');
            categoryBoxHeights = stored ? safeJsonParse(stored, {}, 'categoryBoxHeights') : {};

            const storedDate = localStorage.getItem('dateCategoryBoxHeights');
            dateCategoryBoxHeights = storedDate ? safeJsonParse(storedDate, {}, 'dateCategoryBoxHeights') : {};
        }

        function loadHiddenCategories() {
            const stored = localStorage.getItem('hiddenCategoriesByDate');
            hiddenCategoriesByDate = stored ? safeJsonParse(stored, {}, 'hiddenCategoriesByDate') : {};

            const storedOrder = localStorage.getItem('dateCategoryOrder');
            dateCategoryOrder = storedOrder ? safeJsonParse(storedOrder, {}, 'dateCategoryOrder') : {};
        }

        function loadCollapsedUpcomingCards() {
            const stored = localStorage.getItem('collapsedUpcomingCardIds');
            collapsedUpcomingCardIds = new Set(stored ? safeJsonParse(stored, [], 'collapsedUpcomingCardIds') : []);
        }
        
        // 저장된 탭 순서에 모든 탭이 포함되어 있는지 확인하고 빠진 탭(예: 새로 추가된 AI 탭)을 채워 넣음
        function reconcileTabOrder(order) {
            const allTabs = Object.keys(TAB_LABELS);
            const valid = (order || []).filter(id => allTabs.includes(id));
            for (const id of allTabs) {
                if (!valid.includes(id)) valid.push(id);
            }
            return valid;
        }
        
        function loadTabOrder() {
            const stored = localStorage.getItem('tabOrder');
            if (stored) {
                tabOrder = reconcileTabOrder(safeJsonParse(stored, [], 'tabOrder'));
            }
        }

        function loadDisabledTabIds() {
            const stored = localStorage.getItem('disabledTabIds');
            disabledTabIds = stored ? safeJsonParse(stored, [], 'disabledTabIds').filter(id => id !== 'settings') : [];
        }

        function loadPersonalAiApiKey() {
            personalAiApiKey = localStorage.getItem('personalAiApiKey') || '';
        }

        function loadDisabledFeatures() {
            const stored = localStorage.getItem('disabledFeatures');
            disabledFeatures = stored ? safeJsonParse(stored, [], 'disabledFeatures') : [];
        }

        // 관리자가 계정별로 꺼둔 기능이거나, 코드 레벨에서 강제로 꺼둔(FORCE_DISABLED_FEATURES) 기능이면 true
        function isFeatureDisabled(key) {
            return disabledFeatures.includes(key) || FORCE_DISABLED_FEATURES.includes(key);
        }

        // 관리자가 꺼둔 세부 기능 블록들을 화면에서 숨기고, 탭별로 전부 꺼져있으면 안내 문구를 보여줌
        function applyFeatureRestrictions() {
            document.querySelectorAll('[data-feature]').forEach(el => {
                el.style.display = isFeatureDisabled(el.dataset.feature) ? 'none' : '';
            });

            FEATURE_GROUPS.forEach(group => {
                const keys = Object.keys(group.features);
                const allHidden = keys.every(key => isFeatureDisabled(key));
                const msgEl = document.querySelector(`[data-empty-message-group="${group.key}"]`);
                if (msgEl) msgEl.style.display = allHidden ? 'block' : 'none';
            });

            // 메모장 탭: 할일/메모 둘 다 보일 때만 사이 구분선을 표시
            const notesDivider = document.getElementById('notesSplitDivider');
            if (notesDivider) {
                const bothVisible = !disabledFeatures.includes('todoList') && !disabledFeatures.includes('freeNotes');
                notesDivider.style.display = bothVisible ? '' : 'none';
            }

            applyPersonalApiKeyGate();
        }

        // 공용 API 키가 없으므로, 개인 AI API 키를 설정하지 않았으면 AI 도우미(일일 업무 요약/
        // 월별 피드백 요약/목표수립)와 설비 데이터 분석 버튼을 전부 막고 환경설정에서 키를 넣으라는 안내를 보여줌
        function applyPersonalApiKeyGate() {
            const hasKey = !!personalAiApiKey;

            const aiMsgEl = document.getElementById('aiApiKeyMissingMsg');
            if (aiMsgEl) aiMsgEl.style.display = hasKey ? 'none' : 'block';

            const trendMsgEl = document.getElementById('trendApiKeyMissingMsg');
            if (trendMsgEl) trendMsgEl.style.display = hasKey ? 'none' : 'block';

            ['dailySummaryBtn', 'weeklySummaryBtn', 'aiGenerateBtn', 'aiReviseBtn', 'trendAnalyzeBtn', 'trendReviseBtn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.disabled = !hasKey;
            });

            ['dailySummaryDate', 'aiStartDate', 'aiEndDate', 'aiTemplateTextarea', 'goalRefStartDate', 'goalRefEndDate'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !hasKey;
            });

            document.querySelectorAll('.goal-generate-btn, .goal-revise-btn, .goal-note-textarea, .goal-revise-input').forEach(el => {
                el.disabled = !hasKey;
            });

            // 일일 업무 요약 / 이번주 업무 요약 / AI 월별 피드백 요약 / 목표수립 박스는 키가 없으면 화면 전체를 흐리게 표시
            document.querySelectorAll('[data-feature="dailySummary"], [data-feature="weeklySummary"], [data-feature="monthlyFeedback"], [data-feature="goalSetting"]').forEach(el => {
                el.classList.toggle('ai-feature-locked', !hasKey);
            });
        }

        function saveRecordsToStorage() {
            localStorage.setItem('activityRecords', JSON.stringify(records));
            queueSync();
        }
        
        function saveEventsToStorage() {
            localStorage.setItem('calendarEvents', JSON.stringify(events));
            queueSync();
        }
        
        function saveCategoriesToStorage() {
            localStorage.setItem('activityCategories', JSON.stringify(categories));
            queueSync();
        }
        
        function saveCategoryColorsToStorage() {
            localStorage.setItem('categoryColors', JSON.stringify(categoryColors));
            queueSync();
        }
        
        function saveCategoryBoxHeightsToStorage() {
            localStorage.setItem('categoryBoxHeights', JSON.stringify(categoryBoxHeights));
            queueSync();
        }
        
        function saveDateCategoryBoxHeightsToStorage() {
            localStorage.setItem('dateCategoryBoxHeights', JSON.stringify(dateCategoryBoxHeights));
            queueSync();
        }
        
        function saveHiddenCategoriesToStorage() {
            localStorage.setItem('hiddenCategoriesByDate', JSON.stringify(hiddenCategoriesByDate));
            queueSync();
        }
        
        function saveDateCategoryOrderToStorage() {
            localStorage.setItem('dateCategoryOrder', JSON.stringify(dateCategoryOrder));
            queueSync();
        }
        
        function saveTabOrderToStorage() {
            localStorage.setItem('tabOrder', JSON.stringify(tabOrder));
            queueSync();
        }

        function saveDisabledTabIdsToStorage() {
            localStorage.setItem('disabledTabIds', JSON.stringify(disabledTabIds));
            queueSync();
        }

        function savePersonalAiApiKeyToStorage() {
            localStorage.setItem('personalAiApiKey', personalAiApiKey);
            queueSync();
        }

        function saveCollapsedUpcomingCardsToStorage() {
            localStorage.setItem('collapsedUpcomingCardIds', JSON.stringify(Array.from(collapsedUpcomingCardIds)));
            queueSync();
        }
        
        // ===== Google Sheets 동기화 =====
        function getFullState() {
            return {
                employeeId: currentEmployeeId,
                passwordHash: currentPasswordHash,
                name: currentUserName,
                department: currentUserDepartment,
                records,
                events,
                categories,
                categoryColors,
                categoryBoxHeights,
                dateCategoryBoxHeights,
                hiddenCategoriesByDate,
                dateCategoryOrder,
                collapsedUpcomingCardIds: Array.from(collapsedUpcomingCardIds),
                tabOrder,
                disabledTabIds,
                aiApiKey: personalAiApiKey,
                disabledFeatures,
                notes: notesContent,
                todo: todoItems,
                aiTemplate: aiTemplateContent,
                savingsProjects,
                trendSubject,
                trendSpec,
                maintenanceSchedule
            };
        }

        function cacheAllToLocalStorage() {
            localStorage.setItem('activityRecords', JSON.stringify(records));
            localStorage.setItem('calendarEvents', JSON.stringify(events));
            localStorage.setItem('activityCategories', JSON.stringify(categories));
            localStorage.setItem('categoryColors', JSON.stringify(categoryColors));
            localStorage.setItem('categoryBoxHeights', JSON.stringify(categoryBoxHeights));
            localStorage.setItem('dateCategoryBoxHeights', JSON.stringify(dateCategoryBoxHeights));
            localStorage.setItem('hiddenCategoriesByDate', JSON.stringify(hiddenCategoriesByDate));
            localStorage.setItem('dateCategoryOrder', JSON.stringify(dateCategoryOrder));
            localStorage.setItem('collapsedUpcomingCardIds', JSON.stringify(Array.from(collapsedUpcomingCardIds)));
            localStorage.setItem('tabOrder', JSON.stringify(tabOrder));
            localStorage.setItem('disabledTabIds', JSON.stringify(disabledTabIds));
            localStorage.setItem('personalAiApiKey', personalAiApiKey);
            localStorage.setItem('disabledFeatures', JSON.stringify(disabledFeatures));
            localStorage.setItem('freeNotes', notesContent);
            localStorage.setItem('todoItems', JSON.stringify(todoItems));
            localStorage.setItem('aiTemplate', aiTemplateContent);
            localStorage.setItem('savingsProjects', JSON.stringify(savingsProjects));
            localStorage.setItem('trendSubject', trendSubject);
            localStorage.setItem('trendSpec', trendSpec);
            localStorage.setItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
            localStorage.setItem('accountName', currentUserName);
            localStorage.setItem('accountDepartment', currentUserDepartment);
        }

        // 이 기기가 서버에서 최신 데이터를 완전히 받아오기 전까지는 절대 로컬(오래됐을 수 있는) 데이터를
        // 서버로 올려보내지 않도록 막는 안전장치. 이게 없으면, 예를 들어 폰에서 앱을 열었을 때
        // "로컬 캐시 먼저 표시 → 서버 최신 데이터로 덮어쓰기" 사이의 짧은 순간에 뭔가 저장이 트리거되면
        // 폰의 오래된 데이터가 먼저 서버로 올라가서 다른 기기(PC 등)에서 방금 쓴 최신 내용을 덮어써버리는
        // 사고가 날 수 있음 (실제로 발생했던 데이터 유실 원인)
        let initialLoadDone = false;

        // 신규 가입 시 기본으로 채워주는 카테고리 3개(빨강/주황/파랑) - 사람마다 필요한 카테고리가
        // 다르므로 이름/색은 언제든 카테고리 관리 탭에서 자유롭게 바꾸거나 지울 수 있음
        const DEFAULT_CATEGORIES = ['카테고리1', '카테고리2', '카테고리3'];
        const DEFAULT_CATEGORY_COLORS = { '카테고리1': '#ff6b6b', '카테고리2': '#ff9f43', '카테고리3': '#54a0ff' };

        // 로드가 실패한 채로 끝나면 아래 finally에서 initialLoadDone이 true가 되어 저장이 풀리는데,
        // 이때 records가 로컬에 빈 상태([]/캐시 없음)로 남아있으면 다음 자동저장이 서버의 실제 기록을
        // 빈 값으로 덮어쓰려는 요청이 되어버릴 수 있음. 그런 일이 일시적인 네트워크 문제 때문에 생기지
        // 않도록, 저장 재시도(syncToServer)와 같은 방식으로 이 요청도 몇 번 재시도한 뒤에만 포기함
        const LOAD_RETRY_DELAYS_MS = [1000, 3000];
        async function fetchLoadDataWithRetry() {
            for (let attempt = 0; attempt <= LOAD_RETRY_DELAYS_MS.length; attempt++) {
                try {
                    const url = GOOGLE_APPS_SCRIPT_URL + '?action=load'
                        + '&employeeId=' + encodeURIComponent(currentEmployeeId)
                        + '&passwordHash=' + encodeURIComponent(currentPasswordHash)
                        + '&_=' + Date.now(); // 브라우저가 동일한 GET 요청 결과를 캐시해 예전 응답(예: "등록되지 않은 사번")을 계속 보여주는 걸 막기 위한 캐시버스터
                    const res = await fetch(url, { cache: 'no-store' });
                    if (!res.ok) throw new Error('응답 오류');
                    return await res.json();
                } catch (err) {
                    if (attempt === LOAD_RETRY_DELAYS_MS.length) throw err;
                    await new Promise(r => setTimeout(r, LOAD_RETRY_DELAYS_MS[attempt]));
                }
            }
        }

        // preloadedData가 있으면(예: 로그인 직후 이미 action=load 응답을 받아둔 경우) 네트워크
        // 요청을 또 보내지 않고 그 데이터를 그대로 씀. GAS 요청 자체가 느려서, 로그인 때 이미 받은
        // 데이터를 여기서 또 요청하면 로그인마다 똑같은 왕복을 두 번 하게 되어 체감 지연이 두 배가 됨.
        async function loadAllFromServer(preloadedData) {
            if (!currentEmployeeId || !currentPasswordHash) return; // 로그인 전에는 불러올 대상이 없음

            showSyncStatus('☁️ 불러오는 중...', 'syncing');
            try {
                const data = preloadedData ? preloadedData : await fetchLoadDataWithRetry();

                if (data && data.status === 'error') {
                    // 로그인이 만료됐거나 비밀번호가 서버에서 바뀐 경우 등 - 다시 로그인하도록 함
                    showSyncStatus('⚠️ ' + (data.message || '인증 오류'), 'error');
                    logout();
                    return;
                }

                // data가 유효한 객체면 그대로 반영. 신규 계정은 서버가 "{}"를 주므로 필드가 다 비어있을 수
                // 있는데, 이 경우 예전(다른 사람 것이었을 수도 있는) 로컬 캐시가 아니라 기본값으로 리셋해야 함
                if (data && typeof data === 'object') {
                    currentUserName = (typeof data.name === 'string') ? data.name : '';
                    currentUserDepartment = (typeof data.department === 'string') ? data.department : '';
                    records = data.records || {};
                    events = data.events || [];
                    // 서버에 카테고리가 하나도 없는 신규 계정일 때만 기본 카테고리+색을 함께 채움.
                    // 이미 카테고리가 있는 계정은 색 정보가 비어있어도 기본색으로 덮어쓰지 않음
                    const isBrandNewAccountCategories = !(data.categories && data.categories.length);
                    categories = isBrandNewAccountCategories ? DEFAULT_CATEGORIES.slice() : data.categories;
                    categoryColors = isBrandNewAccountCategories ? Object.assign({}, DEFAULT_CATEGORY_COLORS) : (data.categoryColors || {});
                    categoryBoxHeights = data.categoryBoxHeights || {};
                    dateCategoryBoxHeights = data.dateCategoryBoxHeights || {};
                    hiddenCategoriesByDate = data.hiddenCategoriesByDate || {};
                    dateCategoryOrder = data.dateCategoryOrder || {};
                    collapsedUpcomingCardIds = new Set(Array.isArray(data.collapsedUpcomingCardIds) ? data.collapsedUpcomingCardIds : []);
                    tabOrder = (data.tabOrder && data.tabOrder.length) ? reconcileTabOrder(data.tabOrder) : reconcileTabOrder([]);
                    disabledTabIds = Array.isArray(data.disabledTabIds) ? data.disabledTabIds.filter(id => id !== 'settings') : [];
                    personalAiApiKey = (typeof data.aiApiKey === 'string') ? data.aiApiKey : '';
                    disabledFeatures = Array.isArray(data.disabledFeatures) ? data.disabledFeatures : [];
                    isTeamLead = !!data.isTeamLead;
                    notesContent = (typeof data.notes === 'string') ? data.notes : '';
                    if (Array.isArray(data.todo)) {
                        todoItems = data.todo;
                    } else if (typeof data.todo === 'string' && data.todo) {
                        todoItems = migrateTodoTextToItems(data.todo); // 예전 버전(자유 텍스트 메모)과의 호환
                    } else {
                        todoItems = [];
                    }
                    aiTemplateContent = (typeof data.aiTemplate === 'string' && data.aiTemplate) ? data.aiTemplate : DEFAULT_AI_TEMPLATE;
                    savingsProjects = Array.isArray(data.savingsProjects) ? data.savingsProjects : [];
                    trendSubject = (typeof data.trendSubject === 'string') ? data.trendSubject : '';
                    trendSpec = (typeof data.trendSpec === 'string') ? data.trendSpec : '';
                    maintenanceSchedule = Array.isArray(data.maintenanceSchedule) ? data.maintenanceSchedule : [];

                    cacheAllToLocalStorage();

                    renderTabs();
                    renderCategories();
                    renderCategorySelector();
                    renderCalendar();
                    applyNotesContent();
                    applyAITemplate();
                    if (typeof renderSettingsTab === 'function') renderSettingsTab();
                    applyFeatureRestrictions();
                    if (selectedDate) renderRecordForm();
                    if (typeof renderSavingsProjects === 'function') renderSavingsProjects();
                    if (typeof applyTrendSettings === 'function') applyTrendSettings();
                    if (typeof renderMaintenanceSchedule === 'function') renderMaintenanceSchedule();
                    applyEditLockUI(); // 방금 받아온 이름을 상단 계정 표시에 반영
                }

                showSyncStatus('☁️ 동기화됨', 'ok');
            } catch (err) {
                console.error('서버에서 불러오기 실패:', err);
                showSyncStatus('⚠️ 서버 연결 실패 (로컬 데이터 사용 중)', 'error');
            } finally {
                // 성공하든 실패하든, 첫 로드 시도는 끝난 것이므로 이제부터는 저장을 허용함
                initialLoadDone = true;
            }
        }

        let syncTimeout = null;
        function queueSync() {
            if (!initialLoadDone) return; // 서버 최신 데이터를 아직 다 못 받아온 상태에서는 저장 자체를 하지 않음
            if (!currentEmployeeId) return; // 로그인 전에는 저장할 계정 자체가 없음
            clearTimeout(syncTimeout);
            showSyncStatus('☁️ 저장 대기 중...', 'syncing');
            syncTimeout = setTimeout(syncToServer, 800);
        }
        
        // 이번 세션에서 서버로부터 실제 기록이 있는 데이터를 한 번이라도 정상적으로 받아온 적이 있는지 여부.
        // 이게 true인 상태에서 갑자기 records가 텅 비어있다면, 진짜로 다 지운 게 아니라 뭔가 꼬인 것일
        // 가능성이 높으므로 서버로 그 빈 상태를 올려보내지 않음 (안전장치)
        let everHadRecords = false;
        
        // 다른 사람의 저장과 겹쳐서 서버 락 대기 시간(30초)을 넘겼거나 네트워크가 잠깐 끊긴
        // 경우처럼 "다시 시도하면 될 수도 있는" 실패만 재시도함. 몇 초 뒤 재시도, 그래도 안 되면
        // 조금 더 기다렸다가 마지막으로 한 번 더 시도(총 3번). 비밀번호 불일치나 빈 데이터
        // 안전장치처럼 다시 시도해도 똑같이 실패할 거부는 재시도하지 않고 바로 사용자에게 알림
        const SYNC_RETRY_DELAYS_MS = [3000, 8000];

        async function syncToServer() {
            for (let attempt = 0; attempt <= SYNC_RETRY_DELAYS_MS.length; attempt++) {
                const recordCount = Object.keys(records).length;
                if (recordCount > 0) everHadRecords = true;

                if (everHadRecords && recordCount === 0) {
                    console.warn('빈 상태로 저장하려는 시도를 안전장치가 막았습니다.');
                    showSyncStatus('⚠️ 저장 보류됨 (빈 데이터 감지, 새로고침 권장)', 'error');
                    return false;
                }

                showSyncStatus(attempt === 0 ? '☁️ 저장 중...' : `☁️ 저장 재시도 중... (${attempt}/${SYNC_RETRY_DELAYS_MS.length})`, 'syncing');
                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify(getFullState())
                    });
                    if (!res.ok) throw new Error('응답 오류');
                    const resultData = await res.json();
                    if (resultData && resultData.status === 'error') {
                        const isLockTimeout = (resultData.message || '').includes('다른 저장 요청이 진행 중');
                        if (isLockTimeout && attempt < SYNC_RETRY_DELAYS_MS.length) {
                            await new Promise(r => setTimeout(r, SYNC_RETRY_DELAYS_MS[attempt]));
                            continue;
                        }
                        console.error('서버가 저장을 거부함:', resultData.message);
                        showSyncStatus('⚠️ ' + (resultData.message || '저장 거부됨'), 'error');
                        return false;
                    }
                    showSyncStatus('☁️ 저장됨', 'ok');
                    return true;
                } catch (err) {
                    if (attempt < SYNC_RETRY_DELAYS_MS.length) {
                        console.warn('서버 저장 실패, 재시도 예정:', err);
                        await new Promise(r => setTimeout(r, SYNC_RETRY_DELAYS_MS[attempt]));
                        continue;
                    }
                    console.error('서버 저장 실패:', err);
                    showSyncStatus('⚠️ 저장 실패 (로컬에는 저장됨)', 'error');
                    return false;
                }
            }
        }
        
        let syncStatusHideTimeout = null;
        
        function showSyncStatus(text, state) {
            const el = document.getElementById('syncStatus');
            if (!el) return;
            
            clearTimeout(syncStatusHideTimeout);
            el.textContent = text;
            el.className = 'sync-status ' + (state || '');
            el.style.visibility = 'visible';
            el.style.opacity = '1';
        }
        
        // ===== 탭 렌더링 & 전환 =====
        // 관리자가 어떤 탭의 세부 기능을 전부 꺼뒀으면, 그 탭은 "안내 문구가 뜨는 빈 탭"이 아니라
        // 처음부터 없었던 것처럼 탭 목록에서 통째로 사라지게 함
        function getAdminFullyRestrictedTabIds() {
            return FEATURE_GROUPS
                .filter(group => Object.keys(group.features).every(key => isFeatureDisabled(key)))
                .map(group => group.key);
        }

        function renderTabs() {
            const container = document.getElementById('tabsContainer');
            const adminHiddenTabIds = getAdminFullyRestrictedTabIds();
            // 환경설정 탭은 잠겨서 없앨 수 없게 항상 표시하고, 나머지는 사용자가 꺼둔 탭 + 관리자가 전부 제한한 탭만 숨김
            const visibleTabOrder = tabOrder.filter(tabId => tabId === 'settings' || (!disabledTabIds.includes(tabId) && !adminHiddenTabIds.includes(tabId)));
            if (!visibleTabOrder.includes(activeTabId)) {
                activeTabId = visibleTabOrder[0] || 'settings';
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                const activeEl = document.getElementById(activeTabId);
                if (activeEl) activeEl.classList.add('active');
            }

            container.innerHTML = visibleTabOrder.map(tabId => {
                const activeClass = tabId === activeTabId ? ' active' : '';
                return `<div class="tab${activeClass}" data-tab-id="${tabId}" draggable="true">${TAB_LABELS[tabId]}</div>`;
            }).join('');

            container.querySelectorAll('.tab').forEach(tabEl => {
                const tabId = tabEl.dataset.tabId;
                
                tabEl.addEventListener('click', () => switchTab(tabId));
                
                tabEl.addEventListener('dragstart', (e) => {
                    if (!editUnlocked) { e.preventDefault(); return; }
                    draggedTabId = tabId;
                    tabEl.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                
                tabEl.addEventListener('dragend', () => {
                    tabEl.classList.remove('dragging');
                    container.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'));
                });
                
                tabEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (tabId !== draggedTabId) tabEl.classList.add('drag-over');
                });
                
                tabEl.addEventListener('dragleave', () => {
                    tabEl.classList.remove('drag-over');
                });
                
                tabEl.addEventListener('drop', (e) => {
                    e.preventDefault();
                    tabEl.classList.remove('drag-over');
                    if (!draggedTabId || draggedTabId === tabId) return;
                    
                    const fromIndex = tabOrder.indexOf(draggedTabId);
                    const toIndex = tabOrder.indexOf(tabId);
                    tabOrder.splice(fromIndex, 1);
                    tabOrder.splice(toIndex, 0, draggedTabId);

                    saveTabOrderToStorage();
                    renderTabs();
                    if (typeof renderSettingsTab === 'function') renderSettingsTab();
                });
            });
        }
        
        function switchTab(tabName, options) {
            options = options || {};
            activeTabId = tabName;
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            document.querySelectorAll('.tab').forEach(el => {
                el.classList.toggle('active', el.dataset.tabId === tabName);
            });

            // 메모장 탭은 숨겨져있던 동안엔 높이를 정확히 잴 수 없으므로, 보이게 된 직후에 다시 맞춤
            if (tabName === 'notes' && typeof autoGrowNotesContainer === 'function') {
                autoGrowNotesContainer();
            }

            if (tabName === 'teamReport' && typeof initTeamReportTab === 'function') {
                initTeamReportTab(options.skipTeamReportLoad);
            }
        }

        // ===== 팀 보고 (개인 카테고리 기록과 별개로, 팀장에게 보고할 내용만 따로 제출) =====
        // skipAutoLoad: fillTeamReportWithDailySummary처럼 호출하는 쪽에서 직접 loadTeamReportForDate를
        // 호출해 결과를 이어붙일 때, 여기서도 같은 날짜를 또 불러오면 두 요청이 경쟁해서 방금 채운
        // 내용이 뒤늦게 도착한 서버 응답으로 덮어써질 수 있음 - 그런 경우 자동 로드를 건너뜀
        function initTeamReportTab(skipAutoLoad) {
            const dateInput = document.getElementById('teamReportDateInput');
            const overviewDateInput = document.getElementById('teamOverviewDateInput');
            const overviewSection = document.getElementById('teamReportOverviewSection');
            const today = formatDate(new Date());

            if (dateInput && !dateInput.value) dateInput.value = today;
            if (overviewDateInput && !overviewDateInput.value) overviewDateInput.value = today;
            // 관리자가 이 계정의 "팀 보고" 기능 자체를 꺼뒀다면, 팀장이라도 팀원 제출 현황은 볼 수 없음
            // (applyFeatureRestrictions는 탭 전환 시 다시 실행되지 않아서 여기서도 같이 확인해야 함)
            const canSeeOverview = (isTeamLead || currentEmployeeId === ADMIN_EMPLOYEE_ID) && !disabledFeatures.includes('teamReport');
            if (overviewSection) {
                overviewSection.style.display = canSeeOverview ? '' : 'none';
            }

            if (!skipAutoLoad) loadTeamReportForDate(dateInput ? dateInput.value : today);
            loadMyTeamReportHistory();
            if (canSeeOverview) loadTeamReportOverview();
        }

        // "AI 일일 업무 요약"에서 만든 요약을 [팀 보고] 탭으로 그대로 옮겨줌(제출은 아직 안 함,
        // 사용자가 확인/수정 후 직접 제출 버튼을 눌러야 함). 그 날짜에 이미 써둔 내용이 있으면
        // 지우지 않고 아래에 이어붙임
        async function fillTeamReportWithDailySummary() {
            const dateStr = document.getElementById('dailySummaryDate').value;
            const summaryText = document.getElementById('dailySummaryResultTextarea').value.trim();
            if (!dateStr || !summaryText) return;

            const dateInput = document.getElementById('teamReportDateInput');
            if (dateInput) dateInput.value = dateStr;

            switchTab('teamReport', { skipTeamReportLoad: true });
            await loadTeamReportForDate(dateStr);

            const textarea = document.getElementById('teamReportTextarea');
            if (textarea) {
                textarea.value = textarea.value.trim() ? (textarea.value.trim() + '\n\n' + summaryText) : summaryText;
            }
        }

        function onTeamReportDateChange() {
            const dateInput = document.getElementById('teamReportDateInput');
            if (dateInput && dateInput.value) loadTeamReportForDate(dateInput.value);
        }

        async function loadTeamReportForDate(dateStr) {
            const textarea = document.getElementById('teamReportTextarea');
            const indicator = document.getElementById('teamReportSubmittedIndicator');
            const statusEl = document.getElementById('teamReportStatus');
            if (!textarea || !dateStr) return;

            textarea.value = '';
            indicator.style.display = 'none';
            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getMyTeamReport',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        date: dateStr
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    textarea.value = data.text || '';
                    if (data.submittedAt) {
                        indicator.style.display = '';
                        indicator.textContent = `✓ ${formatDateTimeKo(data.submittedAt)} 제출됨`;
                    }
                    statusEl.textContent = '';
                    statusEl.className = 'ai-status';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('팀 보고 불러오기 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        async function submitTeamReport() {
            if (!checkEditPermission()) return;
            const dateInput = document.getElementById('teamReportDateInput');
            const textarea = document.getElementById('teamReportTextarea');
            const indicator = document.getElementById('teamReportSubmittedIndicator');
            const statusEl = document.getElementById('teamReportStatus');
            const dateStr = dateInput ? dateInput.value : '';

            if (!dateStr) {
                statusEl.textContent = '⚠️ 날짜를 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            statusEl.textContent = '☁️ 제출하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'submitTeamReport',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        date: dateStr,
                        text: textarea.value
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    statusEl.textContent = '✅ 제출되었습니다';
                    statusEl.className = 'ai-status success';
                    indicator.style.display = '';
                    indicator.textContent = `✓ ${formatDateTimeKo(data.submittedAt)} 제출됨`;
                    loadMyTeamReportHistory();
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '제출에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('팀 보고 제출 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // [팀 보고] 탭에서 "내가 언제 뭘 제출했는지" 본인 제출 이력을 최신순으로 보여줌
        async function loadMyTeamReportHistory() {
            const statusEl = document.getElementById('myTeamReportHistoryStatus');
            const listEl = document.getElementById('myTeamReportHistoryList');
            if (!statusEl || !listEl) return;

            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';
            listEl.innerHTML = '';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getMyTeamReportHistory',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    const items = Array.isArray(data.items) ? data.items : [];
                    statusEl.textContent = '';
                    statusEl.className = 'ai-status';

                    if (items.length === 0) {
                        listEl.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">아직 제출한 보고가 없습니다.</p>';
                    } else {
                        listEl.innerHTML = items.map(item => `
                            <div class="result-item" style="margin-bottom:10px;">
                                <div style="white-space:pre-wrap; font-size:14px;">${escapeHtml(item.text)}</div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                                    <span style="color:#999; font-size:12px;">제출 : ${escapeHtml(formatTeamReportSubmittedAt(item.submittedAt))}</span>
                                    <button type="button" class="admin-action-btn danger" onclick="deleteMyTeamReport('${item.date}')">🗑️ 삭제</button>
                                </div>
                            </div>
                        `).join('');
                    }
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('내 팀 보고 내역 불러오기 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // "내 제출 내역"에서 실수로 제출한 건을 본인이 직접 지움 (브라우저 기본 confirm() 대신 앱 모달로 확인받음)
        let pendingDeleteTeamReportDate = null;

        function deleteMyTeamReport(dateStr) {
            if (!checkEditPermission()) return;
            pendingDeleteTeamReportDate = dateStr;
            document.getElementById('deleteTeamReportModalMsg').textContent = `${dateStr} 제출 내용을 삭제하시겠습니까? 되돌릴 수 없습니다.`;
            document.getElementById('deleteTeamReportModal').classList.add('active');
        }

        function closeDeleteTeamReportModal() {
            document.getElementById('deleteTeamReportModal').classList.remove('active');
            pendingDeleteTeamReportDate = null;
        }

        async function confirmDeleteMyTeamReport() {
            const dateStr = pendingDeleteTeamReportDate;
            closeDeleteTeamReportModal();
            if (!dateStr) return;

            const statusEl = document.getElementById('myTeamReportHistoryStatus');
            statusEl.textContent = '☁️ 삭제하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'deleteTeamReport',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        date: dateStr
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    // 지운 날짜가 지금 위에서 보고 있는 날짜와 같으면, 작성 칸도 같이 비워서 화면을 맞춤
                    const dateInput = document.getElementById('teamReportDateInput');
                    if (dateInput && dateInput.value === dateStr) {
                        loadTeamReportForDate(dateStr);
                    }
                    loadMyTeamReportHistory();
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '삭제에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('내 팀 보고 삭제 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        async function loadTeamReportOverview() {
            const dateInput = document.getElementById('teamOverviewDateInput');
            const statusEl = document.getElementById('teamOverviewStatus');
            const listEl = document.getElementById('teamOverviewList');
            const dateStr = dateInput ? dateInput.value : '';

            if (!dateStr) {
                statusEl.textContent = '⚠️ 날짜를 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';
            listEl.innerHTML = '';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'teamReportOverview',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        date: dateStr
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    const items = Array.isArray(data.items) ? data.items : [];
                    statusEl.textContent = `✅ ${dateStr} 제출 ${items.length}건`;
                    statusEl.className = 'ai-status success';

                    if (items.length === 0) {
                        listEl.innerHTML = '<p class="team-overview-empty" style="color:#999; text-align:center; padding:16px;">이 날짜에 제출된 보고가 없습니다.</p>';
                    } else {
                        listEl.innerHTML = items.map(item => `
                            <div class="result-item">
                                <div style="font-weight:600; margin-bottom:4px;">${escapeHtml(item.name || item.employeeId)} <span style="color:#999; font-weight:400; font-size:12px;">(${escapeHtml(item.department || '')} · ${escapeHtml(item.employeeId)})</span></div>
                                <div style="white-space:pre-wrap; font-size:14px;">${escapeHtml(item.text)}</div>
                            </div>
                        `).join('');
                    }
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('팀 보고 현황 불러오기 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // ===== 환경설정 (개인 AI API 키 / 탭 활성화·비활성화) =====
        function renderSettingsTab() {
            const keyInput = document.getElementById('settingsApiKeyInput');
            if (keyInput && document.activeElement !== keyInput) {
                keyInput.value = personalAiApiKey;
            }

            const listEl = document.getElementById('settingsTabToggleList');
            if (listEl) {
                const adminHiddenTabIds = getAdminFullyRestrictedTabIds();
                // 위쪽 탭 목록과 같은 순서로 보여줘서, 드래그로 탭 순서를 바꾸면 여기도 그대로 따라오게 함.
                // 관리자가 전부 제한한 탭은 어차피 못 쓰니 이 목록에도 아예 안 보여줌
                listEl.innerHTML = tabOrder
                    .filter(id => id !== 'settings' && !adminHiddenTabIds.includes(id))
                    .map(id => {
                        const enabled = !disabledTabIds.includes(id);
                        return `<button type="button" class="category-select-btn${enabled ? ' selected' : ''}" onclick="toggleTabDisabled('${id}')">${enabled ? '✅' : '⬜'} ${TAB_LABELS[id]}</button>`;
                    }).join('');
            }
        }

        function toggleTabDisabled(tabId) {
            if (!checkEditPermission()) return;
            if (tabId === 'settings' || !TAB_LABELS[tabId]) return;

            if (disabledTabIds.includes(tabId)) {
                disabledTabIds = disabledTabIds.filter(id => id !== tabId);
            } else {
                disabledTabIds.push(tabId);
            }

            saveDisabledTabIdsToStorage();
            renderTabs();
            renderSettingsTab();
        }

        function saveSettingsApiKey() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('settingsApiKeyInput');
            const statusEl = document.getElementById('settingsApiKeyStatus');
            personalAiApiKey = input.value.trim();
            savePersonalAiApiKeyToStorage();
            applyPersonalApiKeyGate();

            statusEl.textContent = personalAiApiKey
                ? '✅ 개인 API 키가 저장되었습니다. 지금부터 AI 도우미 기능을 사용할 수 있습니다.'
                : '☁️ 빈 값으로 저장했습니다. AI 도우미 기능은 키를 입력해야 사용할 수 있습니다.';
            statusEl.className = 'ai-status success';
        }

        function clearSettingsApiKey() {
            if (!checkEditPermission()) return;
            personalAiApiKey = '';
            const input = document.getElementById('settingsApiKeyInput');
            if (input) input.value = '';
            savePersonalAiApiKeyToStorage();
            applyPersonalApiKeyGate();

            const statusEl = document.getElementById('settingsApiKeyStatus');
            statusEl.textContent = '🗑️ 개인 API 키가 삭제되었습니다. AI 도우미 기능은 키를 다시 입력해야 사용할 수 있습니다.';
            statusEl.className = 'ai-status success';
        }

        // ===== 자동 백업 조회/복구 =====
        let myBackupList = [];

        async function loadMyBackups() {
            const statusEl = document.getElementById('backupListStatus');
            const table = document.getElementById('backupListTable');
            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';
            table.style.display = 'none';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getMyBackups',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status !== 'success') {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                    return;
                }

                myBackupList = data.backups || [];
                if (myBackupList.length === 0) {
                    statusEl.textContent = '표시할 백업이 없습니다 (다른 사람들의 저장으로 밀려났을 수 있습니다)';
                    statusEl.className = 'ai-status';
                    return;
                }

                statusEl.textContent = '';
                statusEl.className = 'ai-status';
                document.getElementById('backupListTableBody').innerHTML = myBackupList.map((b, idx) => `
                    <tr>
                        <td>${escapeHtml(b.savedAt)}</td>
                        <td>${b.dateCount}일치</td>
                        <td class="admin-actions-cell"><button class="admin-action-btn danger" onclick="restoreMyBackup(${idx})">♻️ 이 시점으로 되돌리기</button></td>
                    </tr>
                `).join('');
                table.style.display = '';
            } catch (err) {
                console.error('백업 목록 조회 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        function restoreMyBackup(idx) {
            if (!checkEditPermission()) return;
            const backup = myBackupList[idx];
            if (!backup) return;

            confirmModal(`${backup.savedAt} 시점(${backup.dateCount}일치)으로 되돌릴까요?\n지금 상태도 백업으로 남으니, 되돌린 뒤에도 다시 취소할 수 있습니다.`, async () => {
                const statusEl = document.getElementById('backupListStatus');
                statusEl.textContent = '☁️ 되돌리는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'restoreFromBackup',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            rowIndex: backup.rowIndex
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = `✅ ${data.restoredDateCount || 0}일치를 되돌렸습니다. 화면을 새로고침합니다...`;
                        statusEl.className = 'ai-status success';
                        await loadAllFromServer(); // 되돌린 내용을 화면에 반영
                        loadMyBackups(); // 방금 만들어진 "되돌리기 전" 백업이 목록에 보이도록 새로고침
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '복구에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('백업 복구 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        // ===== 카테고리 관리 =====
        function addCategory() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('newCategoryInput');
            const name = input.value.trim();
            
            if (!name) { alert('카테고리 이름을 입력해주세요'); return; }
            if (categories.includes(name)) { alert('이미 존재하는 카테고리입니다'); return; }
            
            categories.push(name);
            categoryColors[name] = COLOR_PALETTE[categories.length % COLOR_PALETTE.length];
            saveCategoriesToStorage();
            saveCategoryColorsToStorage();
            input.value = '';
            renderCategories();
            renderCategorySelector();
            if (selectedDate) renderRecordForm();
        }
        
        function deleteCategory(name) {
            if (!checkEditPermission()) return;

            // 카테고리 하나만 지우는 것처럼 보이지만 실제로는 이 카테고리로 기록된 모든 날짜의
            // 내용이 함께 영구 삭제되므로, 확인창에 그 파급력을 숨기지 않고 정직하게 알려줌
            const affectedDateCount = Object.keys(records).filter(date => {
                const val = records[date] && records[date][name];
                return val && val.toString().trim() !== '';
            }).length;
            const message = affectedDateCount > 0
                ? `'${name}' 카테고리를 삭제하시겠습니까?\n\n이 카테고리로 기록된 ${affectedDateCount}일치 내용이 함께 영구 삭제됩니다.`
                : `'${name}' 카테고리를 삭제하시겠습니까?`;

            confirmModal(message, () => {
                categories = categories.filter(c => c !== name);
                delete categoryColors[name];
                selectedCategoriesForQuery.delete(name);
                for (const key in categoryCollapseOverride) {
                    if (key.endsWith('::' + name)) delete categoryCollapseOverride[key];
                }
                for (const date in records) delete records[date][name];
                for (const date in hiddenCategoriesByDate) {
                    hiddenCategoriesByDate[date] = hiddenCategoriesByDate[date].filter(c => c !== name);
                }
                for (const date in dateCategoryOrder) {
                    dateCategoryOrder[date] = dateCategoryOrder[date].filter(c => c !== name);
                }

                saveCategoriesToStorage();
                saveCategoryColorsToStorage();
                saveRecordsToStorage();
                saveHiddenCategoriesToStorage();
                saveDateCategoryOrderToStorage();
                renderCategories();
                renderCategorySelector();
                if (selectedDate) renderRecordForm();
            });
        }
        
        function changeCategoryColor(name, color) {
            if (!checkEditPermission()) { renderCategories(); return; }
            categoryColors[name] = color;
            saveCategoryColorsToStorage();
            if (selectedDate) renderRecordForm();
        }

        // 카테고리 이름은 여러 곳(색상/박스높이/실제 기록/날짜별 숨김·순서/조회탭 선택/접기상태)에
        // 키로 쓰이고 있어서, 이름 하나 바꿀 때 그 흔적을 전부 옛 이름 → 새 이름으로 옮겨줘야 함
        function renameCategory(oldName) {
            if (!checkEditPermission()) return;
            const input = prompt('새 카테고리 이름을 입력하세요', oldName);
            if (input === null) return; // 취소

            const newName = input.trim();
            if (!newName) { alert('카테고리 이름을 입력해주세요'); return; }
            if (newName === oldName) return;
            if (categories.includes(newName)) { alert('이미 존재하는 카테고리입니다'); return; }

            const idx = categories.indexOf(oldName);
            if (idx === -1) return;
            categories[idx] = newName;

            if (Object.prototype.hasOwnProperty.call(categoryColors, oldName)) {
                categoryColors[newName] = categoryColors[oldName];
                delete categoryColors[oldName];
            }

            if (Object.prototype.hasOwnProperty.call(categoryBoxHeights, oldName)) {
                categoryBoxHeights[newName] = categoryBoxHeights[oldName];
                delete categoryBoxHeights[oldName];
            }

            for (const date in dateCategoryBoxHeights) {
                const dayHeights = dateCategoryBoxHeights[date];
                if (dayHeights && Object.prototype.hasOwnProperty.call(dayHeights, oldName)) {
                    dayHeights[newName] = dayHeights[oldName];
                    delete dayHeights[oldName];
                }
            }

            for (const date in records) {
                if (records[date] && Object.prototype.hasOwnProperty.call(records[date], oldName)) {
                    records[date][newName] = records[date][oldName];
                    delete records[date][oldName];
                }
            }

            for (const date in hiddenCategoriesByDate) {
                hiddenCategoriesByDate[date] = hiddenCategoriesByDate[date].map(c => c === oldName ? newName : c);
            }
            for (const date in dateCategoryOrder) {
                dateCategoryOrder[date] = dateCategoryOrder[date].map(c => c === oldName ? newName : c);
            }

            if (selectedCategoriesForQuery.has(oldName)) {
                selectedCategoriesForQuery.delete(oldName);
                selectedCategoriesForQuery.add(newName);
            }

            const oldSuffix = '::' + oldName;
            for (const key of Object.keys(categoryCollapseOverride)) {
                if (key.endsWith(oldSuffix)) {
                    const newKey = key.slice(0, -oldSuffix.length) + '::' + newName;
                    categoryCollapseOverride[newKey] = categoryCollapseOverride[key];
                    delete categoryCollapseOverride[key];
                }
            }

            saveCategoriesToStorage();
            saveCategoryColorsToStorage();
            saveCategoryBoxHeightsToStorage();
            saveDateCategoryBoxHeightsToStorage();
            saveRecordsToStorage();
            saveHiddenCategoriesToStorage();
            saveDateCategoryOrderToStorage();

            renderCategories();
            renderCategorySelector();
            if (selectedDate) renderRecordForm();
            renderCalendar();
        }

        function renderCategories() {
            const container = document.getElementById('categoriesList');
            container.innerHTML = categories.map(category => `
                <div class="category-tag">
                    <span class="category-tag-name">${escapeHtml(category)}</span>
                    <div class="category-tag-actions">
                        <input type="color" class="category-color-input" value="${categoryColors[category] || '#667eea'}"
                            onchange="changeCategoryColor('${escapeForOnclickArg(category)}', this.value)" title="박스 색상 설정">
                        <button class="category-tag-edit" onclick="renameCategory('${escapeForOnclickArg(category)}')" title="이름 수정">✏️</button>
                        <button class="category-tag-delete" onclick="deleteCategory('${escapeForOnclickArg(category)}')" aria-label="${escapeHtml(category)} 카테고리 삭제">✕</button>
                    </div>
                </div>
            `).join('');

            if (typeof applyFormLockState === 'function') applyFormLockState();
        }
        
        function renderCategorySelector() {
            const container = document.getElementById('categorySelector');
            container.innerHTML = categories.map(category => `
                <button class="category-select-btn" data-category="${escapeHtml(category)}" onclick="selectCategoryForQuery('${escapeForOnclickArg(category)}')">${escapeHtml(category)}</button>
            `).join('');
        }
        
        function selectCategoryForQuery(category) {
            if (selectedCategoriesForQuery.has(category)) {
                selectedCategoriesForQuery.delete(category);
            } else {
                selectedCategoriesForQuery.add(category);
            }
            
            document.querySelectorAll('.category-select-btn').forEach(btn => {
                btn.classList.toggle('selected', selectedCategoriesForQuery.has(btn.dataset.category));
            });
            
            queryRecords();
        }
        
        function updateDateRange() {
            queryRecords();
        }
        
        // ===== 키워드 통합 검색 (전체 기간 × 전체 카테고리 × 예정작업) =====
        let lastSearchResults = []; // 인라인 수정에서 인덱스로 참조하기 위해 마지막 검색 결과를 보관
        
        function performKeywordSearch() {
            const input = document.getElementById('searchKeywordInput');
            const keyword = input.value.trim();
            const resultsEl = document.getElementById('searchResults');
            
            if (!keyword) {
                resultsEl.innerHTML = '<div class="no-result">검색어를 입력해주세요</div>';
                return;
            }
            
            const kwLower = keyword.toLowerCase();
            const results = [];
            
            // 활동기록(카테고리별 내용) 검색
            for (const dateStr in records) {
                const rec = records[dateStr];
                for (const category of categories) {
                    const content = rec[category];
                    if (content && content.toLowerCase().includes(kwLower)) {
                        results.push({ date: dateStr, tag: category, content });
                    }
                }
            }
            
            // 예정작업(제목) 검색
            for (const ev of events) {
                if (ev.title && ev.title.toLowerCase().includes(kwLower)) {
                    results.push({ date: ev.start, tag: '예정작업', content: ev.title });
                }
            }
            
            results.sort((a, b) => b.date.localeCompare(a.date)); // 최근 날짜부터
            
            if (results.length === 0) {
                resultsEl.innerHTML = `<div class="no-result">'${escapeHtml(keyword)}'에 대한 검색 결과가 없습니다</div>`;
                return;
            }
            
            lastSearchResults = results; // 인라인 수정에서 참조하기 위해 결과를 보관
            
            resultsEl.innerHTML = results.map((r, idx) => {
                const dateObj = new Date(r.date);
                const dateLabel = dateObj.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
                const snippet = highlightKeyword(escapeHtml(r.content), keyword);
                
                // 예정작업은 제목만 있어서 여기서 바로 고치기 애매하므로, 활동기록만 인라인 수정을 제공
                const editable = r.tag !== '예정작업';
                
                return `
                    <div class="result-item" data-result-idx="${idx}">
                        <div class="result-top">
                            <div class="result-date">📅 ${dateLabel} <span class="search-result-tag">[${escapeHtml(r.tag)}]</span></div>
                            <div class="result-actions">
                                ${editable ? `<button class="result-action-btn" onclick="startInlineEdit(${idx})">✏️ 수정</button>` : ''}
                                <button class="result-action-btn" onclick="jumpToSearchResult('${r.date}')">📅 이 날짜 열기</button>
                            </div>
                        </div>
                        <div class="result-content" id="resultContent-${idx}">${snippet}</div>
                    </div>
                `;
            }).join('');
        }
        
        // 검색 결과 카드 안에서 바로 내용을 고칠 수 있게 입력창으로 전환.
        // (달력 탭으로 이동하지 않고도 오타 수정 같은 가벼운 편집을 끝낼 수 있게 함)
        // 카테고리명에 따옴표 등이 들어가도 문제가 없도록, 값을 직접 넘기지 않고 인덱스로만 참조함
        function startInlineEdit(idx) {
            if (!checkEditPermission()) return;
            
            const r = lastSearchResults[idx];
            if (!r) return;
            
            const contentEl = document.getElementById(`resultContent-${idx}`);
            if (!contentEl || contentEl.dataset.editing === 'true') return;
            
            const currentText = (records[r.date] && records[r.date][r.tag]) || '';
            contentEl.dataset.editing = 'true';
            contentEl.innerHTML = `
                <textarea class="result-edit-textarea" id="resultEdit-${idx}"></textarea>
                <div class="result-edit-actions">
                    <button class="result-action-btn primary" onclick="saveInlineEdit(${idx})">저장</button>
                    <button class="result-action-btn" onclick="performKeywordSearch()">취소</button>
                </div>
            `;
            
            const ta = document.getElementById(`resultEdit-${idx}`);
            ta.value = currentText; // innerHTML로 넣으면 특수문자가 깨질 수 있어 value로 직접 대입
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            ta.focus();
        }
        
        function saveInlineEdit(idx) {
            if (!checkEditPermission()) return;
            
            const r = lastSearchResults[idx];
            const ta = document.getElementById(`resultEdit-${idx}`);
            if (!r || !ta) return;
            
            if (!records[r.date]) records[r.date] = {};
            records[r.date][r.tag] = ta.value.trim();
            saveRecordsToStorage();
            
            // 지금 달력에서 보고 있는 날짜를 고친 경우, 그쪽 화면도 같이 최신화
            if (selectedDate === r.date) renderRecordForm();
            renderCalendar();
            
            performKeywordSearch(); // 수정된 내용으로 검색 결과 다시 그리기
        }
        
        // 검색 결과 안에서 키워드 부분만 강조 표시 (내용은 이미 escapeHtml 처리된 상태로 전달됨)
        function highlightKeyword(escapedText, keyword) {
            // escapedText는 이미 escapeHtml을 거친 상태라 keyword도 똑같이 escapeHtml을 거쳐야
            // 매칭됨 (안 그러면 검색어에 &/</> 같은 문자가 있을 때 강조 표시가 안 됨)
            const escapedKeyword = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(escapedKeyword, 'gi');
            return escapedText.replace(re, match => `<mark style="background:#fff3a3; padding:0 2px; border-radius:2px;">${match}</mark>`);
        }
        
        // 검색 결과 클릭 시 달력 탭의 해당 날짜로 이동
        function jumpToSearchResult(dateStr) {
            const d = new Date(dateStr);
            currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
            switchTab('calendar');
            selectDate(dateStr);
        }
        
        // CSV 내보내기에서 화면에 보이는 조회 결과와 똑같은 내용을 받아쓸 수 있도록 마지막 조회 결과를 보관
        let lastQueryResults = [];

        function queryRecords() {
            if (selectedCategoriesForQuery.size === 0) {
                document.getElementById('queryResults').innerHTML = '<div class="no-result">카테고리를 선택해주세요</div>';
                lastQueryResults = []; // 화면엔 결과가 없는데 CSV 내보내기가 예전 검색 결과를 그대로 받아쓰지 않도록 비움
                return;
            }
            
            queryStartDate = new Date(document.getElementById('startDate').value);
            queryEndDate = new Date(document.getElementById('endDate').value);
            
            // 날짜별로 선택된 카테고리들의 내용을 모음
            const results = [];
            for (const dateStr in records) {
                const date = new Date(dateStr);
                if (date >= queryStartDate && date <= queryEndDate) {
                    const categoryContents = [];
                    for (const category of categories) {
                        if (!selectedCategoriesForQuery.has(category)) continue;
                        const content = records[dateStr][category];
                        if (content) categoryContents.push({ category, content });
                    }
                    if (categoryContents.length > 0) {
                        results.push({ date: dateStr, categoryContents });
                    }
                }
            }
            
            results.sort((a, b) => new Date(b.date) - new Date(a.date));
            lastQueryResults = results;

            if (results.length === 0) {
                document.getElementById('queryResults').innerHTML = '<div class="no-result">해당 기간에 기록이 없습니다</div>';
                return;
            }
            
            const html = results.map(item => {
                const date = new Date(item.date);
                const dateLabel = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
                
                const categoriesHtml = item.categoryContents.map(cc => `
                    <div class="result-category-block">
                        <div class="result-category-name">${cc.category}</div>
                        <div class="result-content">${cc.content}</div>
                    </div>
                `).join('');
                
                return `
                    <div class="result-item">
                        <div class="result-date">📅 ${dateLabel}</div>
                        ${categoriesHtml}
                    </div>
                `;
            }).join('');
            
            document.getElementById('queryResults').innerHTML = html;
        }

        // CSV 내보내기 기능 임시 비활성화 (버튼도 index.html에서 주석 처리됨). 재활성화 시 아래 주석 해제
        /*
        function csvEscapeField(value) {
            const text = (value === null || value === undefined) ? '' : String(value);
            return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        }

        // "기간별 카테고리 조회" 결과를 CSV로 내려받음 - 화면에 지금 떠있는 조회 결과(lastQueryResults) 기준
        function downloadQueryResultsCsv() {
            if (lastQueryResults.length === 0) return;

            const rows = [['날짜', '카테고리', '내용']];
            for (const item of lastQueryResults) {
                for (const cc of item.categoryContents) {
                    rows.push([item.date, cc.category, cc.content]);
                }
            }

            // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙임
            const csvContent = '\uFEFF' + rows.map(row => row.map(csvEscapeField).join(',')).join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `활동기록_${document.getElementById('startDate').value}_${document.getElementById('endDate').value}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        */
        
        // ===== 캘린더 렌더링 =====
        function renderCalendar() {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
            document.getElementById('monthYear').textContent = `${year}년 ${monthNames[month]}`;
            
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const firstWeekday = firstDay.getDay();
            const lastDate = lastDay.getDate();
            
            let html = '';
            
            for (let i = 0; i < firstWeekday; i++) {
                html += '<div class="day other-month"></div>';
            }
            
            const today = new Date();
            for (let d = 1; d <= lastDate; d++) {
                const dateObj = new Date(year, month, d);
                const dateStr = formatDate(dateObj);
                const isToday = dateObj.toDateString() === today.toDateString();
                const isSelected = dateStr === selectedDate;
                const isInHighlightedRange = highlightedEventRange &&
                    dateStr >= highlightedEventRange.start && dateStr <= highlightedEventRange.end;
                const dayOfWeek = dateObj.getDay(); // 0=일, 6=토
                const holidayName = KR_HOLIDAYS[dateStr];
                
                let classes = 'day';
                if (isToday) classes += ' today';
                if (isSelected) classes += ' selected';
                if (isInHighlightedRange) classes += ' range-highlight';
                
                // 날짜 숫자 색상 클래스 결정 (공휴일 > 일요일 > 토요일 순 우선)
                let numClass = '';
                if (holidayName || dayOfWeek === 0) {
                    numClass = holidayName ? 'holiday-num' : 'sunday-num';
                } else if (dayOfWeek === 6) {
                    numClass = 'saturday-num';
                }
                
                // 이 날짜에 해당하는 이벤트 찾기
                const dayEvents = events.filter(ev => dateStr >= ev.start && dateStr <= ev.end)
                    .sort((a, b) => a.start.localeCompare(b.start));
                
                let planHtml = '<div class="day-plan-list">';
                
                if (holidayName) {
                    planHtml += `<div class="day-holiday-name" title="${holidayName}">${holidayName}</div>`;
                }
                
                const visibleEvents = dayEvents.slice(0, 5);
                for (const ev of visibleEvents) {
                    planHtml += `<div class="day-plan-item" style="background:${ev.color}" title="${escapeHtml(ev.title)}" onclick="event.stopPropagation(); openEventModal('${ev.id}')">${escapeHtml(ev.title)}</div>`;
                }
                
                if (dayEvents.length > 5) {
                    planHtml += `<div class="day-plan-more" onclick="event.stopPropagation(); selectDate('${dateStr}')">+${dayEvents.length - 5}개</div>`;
                }
                
                planHtml += '</div>';
                
                html += `
                    <div class="${classes}" onclick="selectDate('${dateStr}')">
                        <button class="day-plus-btn" onclick="event.stopPropagation(); openEventModal(null, '${dateStr}')">+</button>
                        <div class="day-top">
                            <div class="day-number ${numClass}">${d}</div>
                            <div class="day-record-dots">${buildRecordDots(dateStr)}</div>
                        </div>
                        ${planHtml}
                    </div>
                `;
            }
            
            const remainingDays = 42 - (firstWeekday + lastDate);
            for (let i = 0; i < remainingDays; i++) {
                html += '<div class="day other-month"></div>';
            }
            
            document.getElementById('daysContainer').innerHTML = html;
            renderUpcomingWidget();
            setupCalendarSwipe();
        }

        // 캘린더 영역을 좌우로 드래그(마우스)/스와이프(터치)하면 이전달·다음달로 이동
        function setupCalendarSwipe() {
            const calendarEl = document.querySelector('#calendar .calendar');
            if (!calendarEl || calendarEl.dataset.swipeBound) return;
            calendarEl.dataset.swipeBound = 'true';
            
            let startX = 0;
            let startY = 0;
            let dragging = false;
            
            calendarEl.addEventListener('pointerdown', (e) => {
                // 로그인 모달/회원가입 모달 등이 떠 있는 동안에는 그 위에서의 드래그가
                // 뒤에 깔린 달력의 월 이동으로 이어지면 안 되므로 무시함
                if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
                startX = e.clientX;
                startY = e.clientY;
                dragging = true;
            });

            calendarEl.addEventListener('pointerup', (e) => {
                if (!dragging) return;
                dragging = false;
                if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                // 가로로 충분히 움직였고, 세로 움직임보다 가로 움직임이 뚜렷할 때만 스와이프로 인식
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    // 스와이프 직후 이어지는 클릭이 날짜 선택으로 잘못 이어지지 않도록 한 번만 차단
                    calendarEl.addEventListener('click', function suppressClick(ev) {
                        ev.stopPropagation();
                    }, { capture: true, once: true });
                    
                    if (dx > 0) {
                        previousMonth();
                    } else {
                        nextMonth();
                    }
                }
            });
            
            calendarEl.addEventListener('pointercancel', () => {
                dragging = false;
            });
        }
        
        // 오늘 기준으로 아직 끝나지 않은 예정 작업들을 D-day와 함께 가로 스크롤 카드로 표시
        let collapsedUpcomingCardIds = new Set(); // 접어둔 카드의 예정작업 id 목록 - 저장되어 창을 닫았다 열어도 유지됨
        let highlightedEventRange = null; // { start, end } - 다가오는 일정 카드 클릭 시 캘린더에서 강조할 기간
        
        function renderUpcomingWidget() {
            const widget = document.getElementById('upcomingWidget');
            const toggleBtn = document.getElementById('upcomingToggleBtn');
            if (!widget) return;
            
            const isVisible = localStorage.getItem('upcomingWidgetVisible') !== 'false';
            
            if (toggleBtn) toggleBtn.textContent = isVisible ? '숨기기' : '보이기';
            
            if (!isVisible) {
                widget.style.display = 'none';
                return;
            }
            widget.style.display = 'flex';
            
            const todayStr = formatDate(new Date());
            
            const upcoming = events
                .filter(ev => ev.end >= todayStr)
                .sort((a, b) => a.start.localeCompare(b.start))
                .slice(0, 10);
            
            if (upcoming.length === 0) {
                widget.innerHTML = '<div class="upcoming-empty">📌 다가오는 일정이 없습니다</div>';
                return;
            }
            
            widget.innerHTML = upcoming.map(ev => {
                const ddayInfo = calcDDay(todayStr, ev.start, ev.end);
                
                // 개별적으로 접힌 카드는 색상 막대만 표시, 클릭하면 다시 펼쳐짐 (툴팁으로 제목/D-day 확인 가능)
                if (collapsedUpcomingCardIds.has(ev.id)) {
                    return `
                        <div class="upcoming-card-mini" style="background:${ev.color}" onclick="expandUpcomingCard('${ev.id}')" title="${escapeHtml(ev.title)} (${ddayInfo})"></div>
                    `;
                }
                
                const dateLabel = ev.start === ev.end
                    ? formatDateLabelShort(ev.start)
                    : `${formatDateLabelShort(ev.start)} ~ ${formatDateLabelShort(ev.end)}`;
                
                return `
                    <div class="upcoming-card" style="border-left-color:${ev.color}" onclick="jumpToUpcomingDate('${ev.start}','${ev.end}')">
                        <button class="upcoming-card-collapse-btn" onclick="event.stopPropagation(); collapseUpcomingCard('${ev.id}')" title="작게 접기">−</button>
                        <span class="upcoming-card-dday" style="background:${ev.color}">${ddayInfo}</span>
                        <div class="upcoming-card-title" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>
                        <div class="upcoming-card-date">${dateLabel}</div>
                    </div>
                `;
            }).join('');
        }
        
        // 다가오는 일정 카드를 클릭하면 예정 작업 수정창을 열지 않고, 그 날짜로 이동하면서
        // 예정 작업이 걸쳐 있는 전체 기간을 캘린더에서 강조 표시함
        function jumpToUpcomingDate(startStr, endStr) {
            highlightedEventRange = { start: startStr, end: endStr || startStr };
            
            const d = new Date(startStr);
            currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
            renderCalendar();
            selectDate(startStr, true); // true = 지금 설정한 기간 강조를 유지한 채로 날짜만 선택
        }
        
        function collapseUpcomingCard(eventId) {
            if (!checkEditPermission()) return;
            collapsedUpcomingCardIds.add(eventId);
            saveCollapsedUpcomingCardsToStorage();
            renderUpcomingWidget();
        }
        
        function expandUpcomingCard(eventId) {
            if (!checkEditPermission()) return;
            collapsedUpcomingCardIds.delete(eventId);
            saveCollapsedUpcomingCardsToStorage();
            renderUpcomingWidget();
        }
        
        function toggleUpcomingWidget() {
            if (!checkEditPermission()) return;
            const isVisible = localStorage.getItem('upcomingWidgetVisible') !== 'false';
            localStorage.setItem('upcomingWidgetVisible', (!isVisible).toString());
            renderUpcomingWidget();
        }
        
        // D-Day 문자열 계산: 시작 전이면 D-n, 기간 중이면 D-DAY(진행중이면 남은 종료일 기준 D-n도 함께)
        function calcDDay(todayStr, startStr, endStr) {
            const oneDay = 24 * 60 * 60 * 1000;
            const today = new Date(todayStr);
            const start = new Date(startStr);
            const end = new Date(endStr);
            
            if (todayStr < startStr) {
                const diff = Math.round((start - today) / oneDay);
                return `D-${diff}`;
            }
            if (todayStr > endStr) {
                return '종료';
            }
            // 오늘이 기간 안에 포함된 경우
            if (startStr === endStr || todayStr === startStr) {
                return 'D-DAY';
            }
            // 여러 날짜에 걸친 일정이 이미 시작된 경우: 종료일까지 며칠 남았는지 표시
            const diffToEnd = Math.round((end - today) / oneDay);
            return diffToEnd === 0 ? 'D-DAY' : `종료 D-${diffToEnd}`;
        }
        
        function formatDateLabelShort(dateStr) {
            const d = new Date(dateStr);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        }
        
        // 이 날짜 이전에 해당 카테고리를 마지막으로 작성했던 날을 찾음 (없으면 null).
        // 일상점검처럼 매일 비슷한 내용을 반복 입력하는 경우, 전날 내용을 가져와 수정하는 용도
        function findPreviousRecord(dateStr, category) {
            if (!dateStr) return null;
            
            const prevDates = Object.keys(records)
                .filter(d => d < dateStr && records[d][category] && records[d][category].trim() !== '')
                .sort();
            
            if (prevDates.length === 0) return null;
            
            const latest = prevDates[prevDates.length - 1];
            return { date: latest, content: records[latest][category] };
        }
        
        function loadPreviousRecord(category) {
            if (!checkEditPermission()) return;
            
            const prev = findPreviousRecord(selectedDate, category);
            if (!prev) return;
            
            // 화면 입력창에만 값을 넣으면, 자동저장(0.8초 지연)이 실행되기 전에 renderRecordForm()이
            // 화면을 다시 그리면서 값이 사라짐. 그래서 records에 먼저 확정 저장한 뒤 화면을 갱신함
            if (!records[selectedDate]) records[selectedDate] = {};
            records[selectedDate][category] = prev.content;
            saveRecordsToStorage();
            
            renderRecordForm();
            renderCalendar();
            
            const d = new Date(prev.date);
            showStatus(`${d.getMonth() + 1}/${d.getDate()} 기록을 불러왔습니다`, 'success');
        }
        
        // 그 날짜에 어떤 카테고리를 기록했는지 캘린더 칸에 작은 색상 점으로 표시.
        // 체크(✓) 하나만 있을 때는 "뭔가 썼다"만 알 수 있었는데, 이제 어느 카테고리가 비었는지도 한눈에 보임
        function buildRecordDots(dateStr) {
            const rec = records[dateStr];
            if (!rec) return '';
            
            return categories
                .filter(c => rec[c] && rec[c].trim() !== '')
                .map(c => `<span class="record-dot" style="background:${categoryColors[c] || '#667eea'}" title="${escapeHtml(c)}"></span>`)
                .join('');
        }
        
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // 인라인 onclick="fn('...')" 인자로 안전하게 넣기 위한 이스케이프.
        // JS 문자열 리터럴의 작은따옴표부터 먼저 이스케이프한 뒤(HTML 엔티티 디코딩이
        // JS 파싱보다 먼저 일어나므로), 그 결과를 이중따옴표 속성값으로도 안전하게 이스케이프한다.
        function escapeForOnclickArg(str) {
            const jsSafe = String(str)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(new RegExp('\u2028', 'g'), '\\u2028')
                .replace(new RegExp('\u2029', 'g'), '\\u2029');
            return jsSafe.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        }
        
        // ===== 날짜 선택 & 활동기록 =====
        function selectDate(dateStr, keepRangeHighlight) {
            // 다른 날짜로 넘어가기 전에 지금까지 입력한 내용 자동 저장
            if (selectedDate && selectedDate !== dateStr) {
                captureCurrentFormToRecords();
            }
            
            // 일반적인 날짜 클릭(다가오는 일정 카드를 통한 이동이 아닌 경우)에는
            // 이전에 남아있을 수 있는 기간 강조 표시를 지움
            if (!keepRangeHighlight) highlightedEventRange = null;
            
            selectedDate = dateStr;
            const date = new Date(dateStr);
            const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
            document.getElementById('selectedDate').textContent = date.toLocaleDateString('ko-KR', options);
            
            renderCalendar();
            renderRecordForm();
        }
        
        // 워드의 자동 번호 매기기처럼, 텍스트 안의 "숫자. " 로 시작하는 줄들을 등장 순서대로 1부터 다시 매김.
        // 앞의 줄이 지워지면 뒤의 줄들이 자동으로 번호가 당겨지고, 커서 위치는 최대한 그대로 유지함
        function renumberListLines(textarea) {
            const value = textarea.value;
            const cursorPos = textarea.selectionStart;
            const lines = value.split('\n');

            // 커서가 몇 번째 줄의 몇 번째 칸에 있는지 계산
            let pos = 0;
            let cursorLine = lines.length - 1;
            let cursorCol = lines[lines.length - 1].length;
            for (let i = 0; i < lines.length; i++) {
                const lineLen = lines[i].length;
                if (cursorPos <= pos + lineLen) {
                    cursorLine = i;
                    cursorCol = cursorPos - pos;
                    break;
                }
                pos += lineLen + 1;
            }

            let expected = 1;
            let changed = false;
            let newCursorCol = cursorCol;

            const newLines = lines.map((line, i) => {
                const m = line.match(/^(\d+)(\.\s?)(.*)$/);
                if (!m) return line;

                const oldPrefixLen = m[1].length + m[2].length;
                const newPrefix = expected + '. ';
                expected++;

                if (i === cursorLine) {
                    newCursorCol = cursorCol <= oldPrefixLen
                        ? newPrefix.length
                        : cursorCol - oldPrefixLen + newPrefix.length;
                }

                if (newPrefix === m[1] + m[2]) return line;
                changed = true;
                return newPrefix + m[3];
            });

            if (!changed) return;

            textarea.value = newLines.join('\n');

            let newPos = 0;
            for (let i = 0; i < cursorLine; i++) newPos += newLines[i].length + 1;
            newPos += newCursorCol;
            textarea.selectionStart = textarea.selectionEnd = newPos;
        }

        // 현재 화면에 입력된 내용을 records에 반영 (날짜 이동/저장 공용)
        function captureCurrentFormToRecords() {
            if (!selectedDate) return false;
            if (!records[selectedDate]) records[selectedDate] = {};
            
            let changed = false;
            for (const category of categories) {
                const textarea = document.getElementById(`category-${category}`);
                // textarea가 없는 경우(그 날짜에서 숨겨둔 카테고리)는 건드리지 않음.
                // 예전에는 이때 값이 빈 문자열로 덮어써져서, 카테고리를 숨기면 그 안에 적어둔 내용이
                // 영구적으로 사라지는 버그가 있었음
                if (!textarea) continue;
                
                const val = textarea.value.trim();
                if (records[selectedDate][category] !== val) {
                    records[selectedDate][category] = val;
                    changed = true;
                }
            }
            
            if (changed) saveRecordsToStorage();
            return changed;
        }
        
        function renderRecordForm() {
            const container = document.getElementById('recordContent');
            
            if (!selectedDate) {
                container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">날짜를 선택해주세요</div>';
                return;
            }
            
            if (!records[selectedDate]) records[selectedDate] = {};
            
            let html = '';
            
            // 해당 날짜의 예정 작업 미리보기
            const dayEvents = events.filter(ev => selectedDate >= ev.start && selectedDate <= ev.end);
            if (dayEvents.length > 0) {
                html += '<div class="day-events-preview"><h4>📌 이 날의 일정</h4>';
                for (const ev of dayEvents) {
                    html += `
                        <div class="preview-event-item" style="background:${ev.color}" onclick="openEventModal('${ev.id}')">
                            <span>${escapeHtml(ev.title)}</span>
                            <span class="edit-hint">수정 ✏️</span>
                        </div>
                    `;
                }
                html += '</div>';
            }
            
            // 카테고리별 활동 기록 (이 날짜에서 숨긴 카테고리는 건너뜀, 이 날짜만의 순서 적용)
            const hiddenList = hiddenCategoriesByDate[selectedDate] || [];
            const orderedCategories = getCategoryOrderForDate(selectedDate);
            const visibleCategories = orderedCategories.filter(c => !hiddenList.includes(c));
            const hiddenCategories = orderedCategories.filter(c => hiddenList.includes(c));
            
            for (const category of visibleCategories) {
                const content = records[selectedDate][category] || '';
                const color = categoryColors[category] || '#667eea';
                const isCollapsed = isCategoryCollapsed(selectedDate, category);
                // 이 날짜에 개별 지정된 높이가 있으면 우선, 없으면 카테고리 기본값 사용
                const dateHeight = dateCategoryBoxHeights[selectedDate] && dateCategoryBoxHeights[selectedDate][category];
                const savedHeight = dateHeight || categoryBoxHeights[category];
                const heightStyle = (savedHeight && !isCollapsed) ? `height:${savedHeight}px;` : '';
                const collapsedClass = isCollapsed ? ' collapsed' : '';
                const categoryHtml = escapeHtml(category);
                const categoryArg = escapeForOnclickArg(category);
                html += `
                    <div class="category-record${collapsedClass}" data-category="${categoryHtml}" style="border-left-color:${color};${heightStyle}"${isCollapsed ? ` onclick="toggleCategoryCollapse('${categoryArg}')" title="클릭해서 펼치기"` : ''}>
                        <div class="category-record-header" draggable="true">
                            <span class="category-drag-handle" title="드래그해서 순서 변경">⠿</span>
                            <div class="category-name" style="color:${color}">${categoryHtml}</div>
                            <div class="category-header-actions">
                                ${(!content && findPreviousRecord(selectedDate, category)) ? `<button class="category-prev-btn" draggable="false" onclick="loadPreviousRecord('${categoryArg}')" title="이전에 작성한 기록 불러오기">↓ 이전 기록</button>` : ''}
                                <button class="category-collapse-btn" draggable="false" onclick="toggleCategoryCollapse('${categoryArg}')" title="접기/펼치기">${isCollapsed ? '▸' : '▾'}</button>
                                <button class="category-hide-btn" draggable="false" onclick="hideCategoryForDate('${categoryArg}')" title="이 날짜에서 숨기기" aria-label="이 날짜에서 숨기기">✕</button>
                            </div>
                        </div>
                        <textarea id="category-${categoryHtml}" data-category="${categoryHtml}" placeholder="활동 내용을 입력하세요...">${escapeHtml(content)}</textarea>
                    </div>
                `;
            }

            if (hiddenCategories.length > 0) {
                html += '<div class="hidden-categories-row">';
                html += '<span class="hidden-categories-label">이 날짜에서 숨김:</span>';
                for (const category of hiddenCategories) {
                    html += `<button class="hidden-category-chip" onclick="showCategoryForDate('${escapeForOnclickArg(category)}')">+ ${escapeHtml(category)}</button>`;
                }
                html += '</div>';
            }
            
            container.innerHTML = html;
            
            // 박스 크기 조절 시 이 날짜에 한해서만 자동 저장 (카테고리 기본값은 건드리지 않음)
            const dateForResize = selectedDate;
            container.querySelectorAll('.category-record').forEach(box => {
                const category = box.dataset.category;
                const observer = new ResizeObserver(() => {
                    if (box.classList.contains('collapsed')) return;
                    // offsetHeight(테두리 포함 전체 높이)를 사용해야
                    // 저장/복원 시 적용하는 style height와 기준이 일치함
                    const h = Math.round(box.offsetHeight);
                    if (!dateCategoryBoxHeights[dateForResize]) dateCategoryBoxHeights[dateForResize] = {};
                    if (dateCategoryBoxHeights[dateForResize][category] !== h) {
                        dateCategoryBoxHeights[dateForResize][category] = h;
                        queueCategoryHeightSave();
                    }
                    
                    // 박스 크기가 어떤 이유로든 바뀔 때마다(수동 드래그 포함) textarea가 그 공간을 채우도록 함.
                    // mouseup 이벤트만으로는 브라우저에 따라 놓치는 경우가 있어 ResizeObserver로 이중 보강
                    fillTextareaToFitBox(box, category);
                });
                observer.observe(box);
                
                // 날짜를 열었을 때 내용에 딱 맞게 박스 크기를 맞춤 (접힌 카테고리는 건너뜀)
                autoGrowCategoryBox(category);
                
                // 우측 하단을 드래그해서 박스를 손으로 크게 늘렸을 때, 그 남는 공간만큼 textarea도 같이 채워줌
                box.addEventListener('mouseup', () => {
                    fillTextareaToFitBox(box, category);
                });
                
                setupCategoryDragAndDrop(box);
            });
            
            // 활동 내용 입력 중에도 자동으로 임시 저장 + 박스 높이 자동 조절 (다른 날짜/새로고침 대비)
            container.querySelectorAll('.category-record textarea').forEach(textarea => {
                textarea.addEventListener('input', () => {
                    // 워드 자동 번호 매기기처럼, 줄이 추가/삭제될 때마다 번호를 항상 1부터 순서대로 다시 매김
                    renumberListLines(textarea);

                    clearTimeout(recordAutosaveTimeout);
                    recordAutosaveTimeout = setTimeout(() => {
                        captureCurrentFormToRecords();
                    }, 800);

                    autoGrowCategoryBox(textarea.dataset.category || textarea.id.replace('category-', ''));
                });

                // 빈 박스를 처음 클릭했을 때 "1. " 자동 생성
                textarea.addEventListener('focus', () => {
                    if (textarea.value === '') {
                        textarea.value = '1. ';
                        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });

                // 포커스 때 자동 생성됐던 "1. "에 아무 내용도 입력하지 않고 다른 곳을 클릭하면,
                // 빈 박스였던 것처럼 다시 비워줌 (내용 없이 번호만 저장되는 것을 방지)
                textarea.addEventListener('blur', () => {
                    if (/^\d+\.\s?$/.test(textarea.value)) {
                        textarea.value = '';
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });

                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        // Enter 입력 시 다음 번호를 이어서 자동 생성 (번호만 있는 빈 줄에서 Enter를 누르면 번호 매기기 종료)
                        const value = textarea.value;
                        const cursorPos = textarea.selectionStart;
                        const beforeCursor = value.substring(0, cursorPos);
                        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
                        const currentLine = beforeCursor.substring(lineStart);

                        const match = currentLine.match(/^(\d+)\.\s?(.*)$/);
                        if (!match) return; // 번호로 시작하는 줄이 아니면 기본 동작(그냥 줄바꿈) 그대로 둠

                        e.preventDefault();

                        const num = parseInt(match[1], 10);
                        const restOfLine = match[2];

                        if (restOfLine.trim() === '') {
                            // 번호만 있고 내용이 없는 줄에서 Enter → 번호 매기기를 멈추고 그냥 줄바꿈
                            textarea.value = value.substring(0, lineStart) + value.substring(cursorPos);
                            textarea.selectionStart = textarea.selectionEnd = lineStart;
                        } else {
                            const insertText = '\n' + (num + 1) + '. ';
                            textarea.value = value.substring(0, cursorPos) + insertText + value.substring(cursorPos);
                            textarea.selectionStart = textarea.selectionEnd = cursorPos + insertText.length;
                        }

                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    } else if (e.key === 'Backspace' && textarea.selectionStart === textarea.selectionEnd) {
                        // 커서가 "숫자. " 번호 바로 뒤에 있을 때 Backspace를 누르면, 번호 전체를 한 번에 지움
                        // (워드에서 자동 번호 매기기를 지울 때와 동일한 동작)
                        const value = textarea.value;
                        const cursorPos = textarea.selectionStart;
                        const beforeCursor = value.substring(0, cursorPos);
                        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
                        const prefix = value.substring(lineStart, cursorPos);

                        if (!/^\d+\.\s?$/.test(prefix)) return;

                        e.preventDefault();
                        textarea.value = value.substring(0, lineStart) + value.substring(cursorPos);
                        textarea.selectionStart = textarea.selectionEnd = lineStart;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            });
            
            // 새로 그려진 카테고리 textarea들에도 현재 편집 잠금 상태를 반영
            document.querySelectorAll('.category-record textarea').forEach(ta => {
                ta.readOnly = !editUnlocked;
            });
        }
        
        // 이 날짜에 저장된 순서가 있으면 그걸 쓰고, 없으면 기본 카테고리 순서를 씀.
        // 새로 추가된 카테고리가 저장된 순서에 없으면 맨 뒤에 자동으로 붙여줌
        function getCategoryOrderForDate(dateStr) {
            // 사용자가 직접 드래그로 순서를 바꾼 적이 있으면 그게 항상 우선
            const savedOrder = dateCategoryOrder[dateStr];
            if (savedOrder && savedOrder.length > 0) {
                const valid = savedOrder.filter(c => categories.includes(c));
                for (const c of categories) {
                    if (!valid.includes(c)) valid.push(c);
                }
                return valid;
            }
            
            // 지난 날짜(오늘 이전)는 작성된 카테고리를 위로, 안 쓴 카테고리를 아래로 자동 정렬
            const todayStr = formatDate(new Date());
            if (dateStr < todayStr) {
                const rec = records[dateStr] || {};
                const written = categories.filter(c => rec[c] && rec[c].trim() !== '');
                const empty = categories.filter(c => !(rec[c] && rec[c].trim() !== ''));
                return written.concat(empty);
            }
            
            return categories.slice();
        }
        
        // 이 카테고리가 지금 접혀야 하는지 판단
        // - 사용자가 직접 접기/펼치기 버튼을 클릭한 적이 있으면 그 선택이 항상 우선
        // - 그게 없으면: 지난 날짜인데 그 카테고리에 작성된 내용이 없으면 자동으로 접힘
        function isCategoryCollapsed(dateStr, category) {
            const key = dateStr + '::' + category;
            if (Object.prototype.hasOwnProperty.call(categoryCollapseOverride, key)) {
                return categoryCollapseOverride[key];
            }
            
            const todayStr = formatDate(new Date());
            if (dateStr >= todayStr) return false;
            
            const content = (records[dateStr] && records[dateStr][category]) || '';
            return content.trim() === '';
        }
        
        // 카테고리 박스 접기/펼치기 (제목만 남기기) - 이 날짜에서 사용자가 직접 선택한 상태로 기억됨 (세션 동안만)
        function toggleCategoryCollapse(category) {
            if (!checkEditPermission()) return;
            const key = selectedDate + '::' + category;
            const current = isCategoryCollapsed(selectedDate, category);
            categoryCollapseOverride[key] = !current;
            renderRecordForm();
        }
        
        // ===== 카테고리 박스 드래그앤드롭 순서 변경 (이 날짜에만 적용) =====
        function setupCategoryDragAndDrop(box) {
            const header = box.querySelector('.category-record-header');
            const category = box.dataset.category;
            
            header.addEventListener('dragstart', (e) => {
                if (!editUnlocked) { e.preventDefault(); return; }
                draggedCategoryId = category;
                box.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            header.addEventListener('dragend', () => {
                box.classList.remove('dragging');
                document.querySelectorAll('.category-record').forEach(b => b.classList.remove('drag-over'));
            });
            
            box.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (category !== draggedCategoryId) box.classList.add('drag-over');
            });
            
            box.addEventListener('dragleave', () => {
                box.classList.remove('drag-over');
            });
            
            box.addEventListener('drop', (e) => {
                e.preventDefault();
                box.classList.remove('drag-over');
                if (!draggedCategoryId || draggedCategoryId === category) return;
                
                const currentOrder = getCategoryOrderForDate(selectedDate);
                const fromIndex = currentOrder.indexOf(draggedCategoryId);
                const toIndex = currentOrder.indexOf(category);
                if (fromIndex === -1 || toIndex === -1) return;
                
                currentOrder.splice(fromIndex, 1);
                currentOrder.splice(toIndex, 0, draggedCategoryId);
                
                dateCategoryOrder[selectedDate] = currentOrder;
                saveDateCategoryOrderToStorage();
                renderRecordForm();
            });
        }
        
        // 카테고리 박스를 내용에 딱 맞게 조절 (늘리기/줄이기 모두) - 수동으로 늘려둔 박스도 내용을 지우면 다시 최소화됨
        function autoGrowCategoryBox(category) {
            const box = document.querySelector(`.category-record[data-category="${cssEscape(category)}"]`);
            const textarea = document.getElementById(`category-${category}`);
            if (!box || !textarea || box.classList.contains('collapsed')) return;
            
            // 바깥 박스의 높이를 직접 계산하지 않고, textarea 자체를 내용에 맞게 늘림.
            // 박스는 이제 flex 레이아웃상 이 textarea를 그냥 감싸기만 하면 되므로(더 이상 flex:1로
            // 늘어나지 않음) 브라우저가 알아서 딱 맞는 높이로 계산해줌 - 계산 누락으로 인한 오차 원인 자체를 제거함
            box.style.height = '';
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }
        
        // 박스를 손으로 크게 늘렸을 때(우측 하단 드래그), 그 남는 공간만큼 textarea도 채워서
        // "박스는 커졌는데 안에 입력창은 그대로"인 상황을 방지함
        function fillTextareaToFitBox(box, category) {
            const textarea = document.getElementById(`category-${category}`);
            if (!box || !textarea || box.classList.contains('collapsed')) return;
            
            const headerEl = box.querySelector('.category-record-header');
            const style = getComputedStyle(box);
            const paddingTop = parseFloat(style.paddingTop) || 0;
            const paddingBottom = parseFloat(style.paddingBottom) || 0;
            const headerHeight = headerEl ? headerEl.offsetHeight + 10 : 0; // 10 = margin-bottom
            
            const available = box.clientHeight - paddingTop - paddingBottom - headerHeight;
            
            // textarea 자신의 실제 필요한 콘텐츠 높이를 먼저 정확히 측정
            textarea.style.height = 'auto';
            const contentHeight = textarea.scrollHeight;
            
            // 박스에 남는 공간이 있으면(수동으로 크게 늘린 경우) 그 공간만큼 채우고,
            // 그렇지 않으면(내용이 더 크면) 내용 크기 그대로 유지
            const finalHeight = Math.max(contentHeight, available);
            textarea.style.height = finalHeight + 'px';
        }
        
        // CSS.escape 미지원 환경 대비 간단한 안전장치
        function cssEscape(str) {
            if (window.CSS && CSS.escape) return CSS.escape(str);
            return String(str).replace(/["\\]/g, '\\$&');
        }
        
        let recordAutosaveTimeout = null;
        let categoryHeightSaveTimeout = null;
        
        function queueCategoryHeightSave() {
            clearTimeout(categoryHeightSaveTimeout);
            categoryHeightSaveTimeout = setTimeout(() => {
                saveDateCategoryBoxHeightsToStorage();
            }, 500);
        }
        
        // 이 날짜에서만 특정 카테고리를 숨김 (전체 카테고리 목록/다른 날짜 기록에는 영향 없음)
        function hideCategoryForDate(category) {
            if (!checkEditPermission()) return;
            if (!selectedDate) return;
            
            // 숨기기 전에 지금까지 입력한 내용은 먼저 저장
            captureCurrentFormToRecords();
            
            if (!hiddenCategoriesByDate[selectedDate]) hiddenCategoriesByDate[selectedDate] = [];
            if (!hiddenCategoriesByDate[selectedDate].includes(category)) {
                hiddenCategoriesByDate[selectedDate].push(category);
            }
            saveHiddenCategoriesToStorage();
            renderRecordForm();
        }
        
        function showCategoryForDate(category) {
            if (!checkEditPermission()) return;
            if (!selectedDate) return;
            
            if (hiddenCategoriesByDate[selectedDate]) {
                hiddenCategoriesByDate[selectedDate] = hiddenCategoriesByDate[selectedDate].filter(c => c !== category);
            }
            saveHiddenCategoriesToStorage();
            renderRecordForm();
        }
        
        // 예전에는 로컬에 반영하자마자 무조건 "저장되었습니다"를 띄웠는데, 실제 서버 저장은 그 뒤
        // 800ms 디바운스를 거쳐 비동기로 진행되는 거라 그 사이 실패해도 사용자는 이미 성공했다고
        // 믿고 있는 상태였음. 여기서는 디바운스를 건너뛰고 바로 동기화한 뒤, 그 실제 결과를 보여줌
        async function saveAllRecords() {
            if (!selectedDate) { showStatus('날짜를 선택해주세요', 'error'); return; }

            const changed = captureCurrentFormToRecords();
            renderCalendar();

            if (!changed) {
                showStatus('변경된 내용이 없습니다', 'success');
                return;
            }

            clearTimeout(syncTimeout); // 곧 이어서 직접 동기화하므로, 뒤늦게 또 도는 디바운스 자동저장은 취소함
            showStatus('💾 저장 중...', 'success');
            const ok = await syncToServer();
            showStatus(ok ? '✅ 저장되었습니다!' : '⚠️ 서버 저장에 실패했습니다. 다시 시도해주세요.', ok ? 'success' : 'error');
        }
        
        function showStatus(message, type) {
            const statusEl = document.getElementById('statusMessage');
            statusEl.textContent = message;
            statusEl.className = `status-message ${type}`;
            setTimeout(() => { statusEl.className = 'status-message'; }, 3000);
        }
        
        // ===== 일정 모달 (Google 캘린더 스타일) =====
        // 당직/연차/휴가처럼 매번 같은 내용으로 반복 등록하는 일정을 버튼 한 번으로 채워주는 빠른 선택 목록.
        // 내용을 직접 입력하지 않아도 기간만 정하고 저장하면 캘린더에 기록이 남도록 하기 위함
        const QUICK_EVENT_PRESETS = {
            '당직': '#5f27cd',
            '연차': '#54a0ff',
            '휴가': '#54a0ff'
        };

        function renderColorPicker() {
            const container = document.getElementById('colorPicker');
            container.innerHTML = COLOR_PALETTE.map(color => `
                <div class="color-swatch" style="background:${color}" data-color="${color}" onclick="pickColor('${color}')"></div>
            `).join('') + `
                <div class="custom-color-swatch" id="customColorWrapper" title="직접 색상 선택">
                    <input type="color" class="custom-color-input" id="customColorInput"
                        oninput="pickColor(this.value)" onchange="pickColor(this.value)">
                </div>
            `;
        }

        // 팔레트 스와치 + 커스텀 색상 입력 중, 현재 선택된 색상에 맞는 것만 하이라이트
        function syncColorSwatchSelection(color) {
            document.querySelectorAll('.color-swatch').forEach(sw => {
                sw.classList.toggle('selected', sw.dataset.color === color);
            });
            const customWrapper = document.getElementById('customColorWrapper');
            const customInput = document.getElementById('customColorInput');
            if (customWrapper && customInput) {
                const isPaletteColor = COLOR_PALETTE.includes(color);
                customWrapper.classList.toggle('selected', !isPaletteColor);
                if (!isPaletteColor) customInput.value = color;
            }
        }

        function pickColor(color) {
            selectedColor = color;
            syncColorSwatchSelection(color);
        }

        // 빠른 선택 버튼(당직/연차/휴가) 클릭 시 내용/색상을 자동으로 채워서,
        // 이후 기간만 정하고 저장하면 되도록 함
        function applyQuickPreset(name) {
            document.getElementById('eventTitleInput').value = name;
            pickColor(QUICK_EVENT_PRESETS[name]);
            syncQuickPresetSelection(name);
        }

        function syncQuickPresetSelection(title) {
            document.querySelectorAll('.quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.preset === title);
            });
        }

        function openEventModal(eventId, defaultDateStr) {
            if (!checkEditPermission()) return;
            editingEventId = eventId;
            const modal = document.getElementById('eventModal');
            const deleteBtn = document.getElementById('deleteEventBtn');

            if (eventId) {
                // 수정 모드
                const ev = events.find(e => e.id === eventId);
                if (!ev) return;

                document.getElementById('modalTitle').textContent = '📌 일정 수정';
                document.getElementById('eventTitleInput').value = ev.title;
                document.getElementById('eventStartInput').value = ev.start;
                document.getElementById('eventEndInput').value = ev.end;
                selectedColor = ev.color;
                deleteBtn.style.display = 'block';
            } else {
                // 추가 모드
                const dateStr = defaultDateStr || formatDate(new Date());
                document.getElementById('modalTitle').textContent = '📌 일정 추가';
                document.getElementById('eventTitleInput').value = '';
                document.getElementById('eventStartInput').value = dateStr;
                document.getElementById('eventEndInput').value = dateStr;
                selectedColor = COLOR_PALETTE[0];
                deleteBtn.style.display = 'none';
            }

            syncColorSwatchSelection(selectedColor);
            syncQuickPresetSelection(eventId ? document.getElementById('eventTitleInput').value : '');

            modal.classList.add('active');
        }
        
        function closeEventModal() {
            document.getElementById('eventModal').classList.remove('active');
            editingEventId = null;
        }
        
        function saveEvent() {
            if (!checkEditPermission()) return;
            const title = document.getElementById('eventTitleInput').value.trim();
            const start = document.getElementById('eventStartInput').value;
            const end = document.getElementById('eventEndInput').value;
            
            if (!title) { alert('내용을 입력해주세요'); return; }
            if (!start || !end) { alert('기간을 설정해주세요'); return; }
            if (start > end) { alert('종료일은 시작일보다 빠를 수 없습니다'); return; }
            
            if (editingEventId) {
                const ev = events.find(e => e.id === editingEventId);
                if (ev) {
                    ev.title = title;
                    ev.start = start;
                    ev.end = end;
                    ev.color = selectedColor;
                }
            } else {
                events.push({
                    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    title, start, end, color: selectedColor
                });
            }
            
            saveEventsToStorage();
            closeEventModal();
            renderCalendar();
            if (selectedDate) renderRecordForm();
            showStatus('✅ 일정이 저장되었습니다!', 'success');
        }
        
        function deleteEvent() {
            if (!checkEditPermission()) return;
            if (!editingEventId) return;
            confirmModal('이 일정을 삭제하시겠습니까?', () => {
                events = events.filter(e => e.id !== editingEventId);
                if (collapsedUpcomingCardIds.has(editingEventId)) {
                    collapsedUpcomingCardIds.delete(editingEventId);
                    saveCollapsedUpcomingCardsToStorage();
                }
                saveEventsToStorage();
                closeEventModal();
                renderCalendar();
                if (selectedDate) renderRecordForm();
                showStatus('🗑️ 삭제되었습니다', 'success');
            });
        }
        
        // ===== 달력 네비게이션 =====
        // 로그인/회원가입 모달 등이 떠 있는 동안에는 그 위에서 일어나는 드래그가 어떤
        // 경로로든 뒤에 깔린 달력의 월 이동으로 이어지면 안 되므로, 진입점(스와이프/버튼)에
        // 상관없이 여기서 한 번 더 막음
        function previousMonth() {
            if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
            renderCalendar();
        }

        function nextMonth() {
            if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
            renderCalendar();
        }
        
        // 캘린더 상단 "연 월" 표시를 눌렀을 때: 화살표로 한 달씩 이동하는 대신 원하는 연/월로 바로 이동
        function openMonthJumpModal() {
            if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;

            const yearSelect = document.getElementById('monthJumpYearSelect');
            const monthSelect = document.getElementById('monthJumpMonthSelect');
            const currentYear = currentDate.getFullYear();

            yearSelect.innerHTML = '';
            for (let y = currentYear - 10; y <= currentYear + 2; y++) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y + '년';
                if (y === currentYear) opt.selected = true;
                yearSelect.appendChild(opt);
            }
            monthSelect.value = currentDate.getMonth();

            document.getElementById('monthJumpModal').classList.add('active');
        }

        function confirmMonthJump() {
            const year = Number(document.getElementById('monthJumpYearSelect').value);
            const month = Number(document.getElementById('monthJumpMonthSelect').value);
            currentDate = new Date(year, month, 1);
            renderCalendar();
            closeModalById('monthJumpModal');
        }

        function goToday() {
            currentDate = new Date();
            renderCalendar();
            selectDate(formatDate(new Date()));
        }
        
        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // 상단 실시간 시계: 1초마다 현재 날짜/시각을 갱신
        function startLiveClock() {
            const dateEl = document.getElementById('liveClockDate');
            const timeEl = document.getElementById('liveClockTime');
            if (!dateEl || !timeEl) return;

            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

            function tick() {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const weekday = weekdays[now.getDay()];
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');

                dateEl.textContent = `${year}년 ${month}월 ${day}일 (${weekday})`;
                timeEl.textContent = `${hours}:${minutes}:${seconds}`;
            }

            tick();
            setInterval(tick, 1000);
        }

        // ===== 메모장 (날짜와 무관한 자유 메모) =====
        function applyNotesContent() {
            document.getElementById('notesTextarea').value = notesContent;
            renderTodoList();
        }

        function setupNotesAutosave() {
            const textarea = document.getElementById('notesTextarea');
            const indicator = document.getElementById('notesSaveIndicator');
            let saveTimeout = null;

            textarea.addEventListener('input', () => {
                autoGrowNotesContainer();
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    notesContent = textarea.value;
                    localStorage.setItem('freeNotes', notesContent);
                    queueSync();
                    indicator.classList.add('show');
                    setTimeout(() => indicator.classList.remove('show'), 1500);
                }, 500);
            });
        }

        // ===== 해야 할 일 (체크박스로 추가/수정/삭제/완료 표시하는 할일 목록) =====
        function loadTodoItems() {
            const stored = localStorage.getItem('todoItems');
            if (stored) {
                todoItems = safeJsonParse(stored, [], 'todoItems');
                return;
            }
            // 예전 버전(자유 텍스트 textarea)에서 넘어온 사용자를 위한 1회성 마이그레이션
            const legacyText = localStorage.getItem('todoNotes');
            todoItems = legacyText ? migrateTodoTextToItems(legacyText) : [];
        }

        function migrateTodoTextToItems(text) {
            return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => ({
                id: 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                text: line,
                done: false,
                memo: ''
            }));
        }

        function saveTodoItems() {
            localStorage.setItem('todoItems', JSON.stringify(todoItems));
            queueSync();
            const indicator = document.getElementById('todoSaveIndicator');
            if (indicator) {
                indicator.classList.add('show');
                setTimeout(() => indicator.classList.remove('show'), 1500);
            }
        }

        function buildTodoItemRow(item) {
            const wrap = document.createElement('div');
            wrap.className = 'todo-item-wrap';
            wrap.dataset.id = item.id;

            const row = document.createElement('div');
            row.className = 'todo-item' + (item.done ? ' done' : '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'todo-checkbox';
            checkbox.checked = !!item.done;
            checkbox.addEventListener('change', () => toggleTodoItem(item.id));

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'todo-text-input';
            textInput.value = item.text;
            textInput.addEventListener('blur', () => updateTodoItemText(item.id, textInput.value));
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') textInput.blur();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'todo-delete-btn';
            deleteBtn.title = '삭제';
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', () => deleteTodoItem(item.id));

            row.appendChild(checkbox);
            row.appendChild(textInput);
            row.appendChild(deleteBtn);

            const memoInput = document.createElement('textarea');
            memoInput.className = 'todo-memo-input';
            memoInput.rows = 1;
            memoInput.placeholder = '메모 추가...';
            memoInput.value = item.memo || '';
            memoInput.addEventListener('blur', () => updateTodoItemMemo(item.id, memoInput.value));
            memoInput.addEventListener('input', () => {
                memoInput.style.height = 'auto';
                memoInput.style.height = memoInput.scrollHeight + 'px';
                autoGrowNotesContainer();
            });

            wrap.appendChild(row);
            wrap.appendChild(memoInput);
            return wrap;
        }

        function renderTodoList() {
            const activeContainer = document.getElementById('todoList');
            const doneContainer = document.getElementById('todoDoneList');
            if (!activeContainer || !doneContainer) return;
            activeContainer.innerHTML = '';
            doneContainer.innerHTML = '';

            const activeItems = todoItems.filter(item => !item.done);
            const doneItems = todoItems.filter(item => item.done);

            if (activeItems.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'todo-empty';
                empty.textContent = '할 일이 없습니다. 위에서 추가해보세요.';
                activeContainer.appendChild(empty);
            } else {
                activeItems.forEach(item => activeContainer.appendChild(buildTodoItemRow(item)));
            }

            if (doneItems.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'todo-empty';
                empty.textContent = '완료된 항목이 없습니다.';
                doneContainer.appendChild(empty);
            } else {
                doneItems.forEach(item => doneContainer.appendChild(buildTodoItemRow(item)));
            }

            [activeContainer, doneContainer].forEach(c => {
                c.querySelectorAll('.todo-memo-input').forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
            });

            applyFormLockState();
            autoGrowNotesContainer();
        }

        function addTodoItem() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('todoNewInput');
            const text = input.value.trim();
            if (!text) return;

            todoItems.push({
                id: 'todo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                text,
                done: false,
                memo: ''
            });
            input.value = '';
            saveTodoItems();
            renderTodoList();
            document.getElementById('todoNewInput').focus();
        }

        function toggleTodoItem(id) {
            if (!checkEditPermission()) { renderTodoList(); return; }
            const item = todoItems.find(t => t.id === id);
            if (!item) return;
            item.done = !item.done;
            saveTodoItems();
            renderTodoList();
        }

        function updateTodoItemText(id, value) {
            const item = todoItems.find(t => t.id === id);
            if (!item) return;
            const trimmed = value.trim();
            if (!trimmed || trimmed === item.text) {
                renderTodoList(); // 빈 값으로 바꾸려 했거나 변경이 없으면 원래 내용으로 되돌림
                return;
            }
            item.text = trimmed;
            saveTodoItems();
        }

        function updateTodoItemMemo(id, value) {
            const item = todoItems.find(t => t.id === id);
            if (!item) return;
            const trimmed = value.trim();
            if (trimmed === (item.memo || '')) return;
            item.memo = trimmed;
            saveTodoItems();
        }

        function deleteTodoItem(id) {
            if (!checkEditPermission()) return;
            todoItems = todoItems.filter(t => t.id !== id);
            saveTodoItems();
            renderTodoList();
        }

        // 할일 목록/메모장 중 더 긴 내용에 맞춰 전체 영역(notesSplitContainer) 높이를 자동 조절.
        // (활동기록 카테고리 박스와 동일한 방식: 우선 리셋해서 정확히 잰 뒤 필요한 만큼만 늘림/줄임)
        function autoGrowNotesContainer() {
            const container = document.getElementById('notesSplitContainer');
            const todoSections = document.querySelector('#todoPane .todo-sections');
            const notesTextarea = document.getElementById('notesTextarea');
            const todoPane = document.getElementById('todoPane');
            const memoPane = document.getElementById('memoPane');
            if (!container || !todoSections || !notesTextarea || !todoPane || !memoPane) return;
            if (container.offsetParent === null) return; // 탭이 안 보이는 상태면 측정이 부정확하므로 건너뜀

            container.style.height = '';

            // 메모장 textarea는 잠시 auto로 풀어서 실제 필요한 높이를 정확히 측정
            // (todoList는 일반 div라서 overflow:hidden이어도 scrollHeight가 항상 실제 내용 높이를 그대로 반영함)
            notesTextarea.style.height = 'auto';

            const todoStyle = getComputedStyle(todoPane);
            const todoPad = (parseFloat(todoStyle.paddingTop) || 0) + (parseFloat(todoStyle.paddingBottom) || 0);
            const todoOverhead = Array.from(todoPane.children).reduce((sum, el) => {
                if (el === todoSections) return sum;
                return sum + el.offsetHeight + 12;
            }, 0);

            // 해야 할 일/완료 두 칸(todo-section) 각각의 제목+목록 높이를 합산
            const sectionsStyle = getComputedStyle(todoSections);
            const sectionsGap = parseFloat(sectionsStyle.rowGap || sectionsStyle.gap) || 0;
            const sections = Array.from(todoSections.querySelectorAll('.todo-section'));
            let sectionsNeeded = sectionsGap * Math.max(sections.length - 1, 0);
            sections.forEach(section => {
                const list = section.querySelector('.todo-list');
                const title = section.querySelector('.todo-section-title');
                const sectionStyle = getComputedStyle(section);
                const sectionPad = (parseFloat(sectionStyle.paddingTop) || 0) + (parseFloat(sectionStyle.paddingBottom) || 0) + (parseFloat(sectionStyle.borderTopWidth) || 0);
                const titleHeight = title ? title.offsetHeight + (parseFloat(getComputedStyle(title).marginBottom) || 0) : 0;
                sectionsNeeded += sectionPad + titleHeight + (list ? list.scrollHeight : 0);
            });

            const todoNeededTotal = todoPad + todoOverhead + sectionsNeeded + 4;

            const memoStyle = getComputedStyle(memoPane);
            const memoPad = (parseFloat(memoStyle.paddingTop) || 0) + (parseFloat(memoStyle.paddingBottom) || 0);
            const memoHeaderEl = memoPane.querySelector('.notes-header');
            const memoDescEl = memoPane.querySelector('p');
            const memoOverhead = (memoHeaderEl ? memoHeaderEl.offsetHeight + 15 : 0) + (memoDescEl ? memoDescEl.offsetHeight + 12 : 0);
            const memoNeededTotal = memoPad + memoOverhead + notesTextarea.scrollHeight + 4;

            let neededHeight = Math.ceil(Math.max(todoNeededTotal, memoNeededTotal));
            if (neededHeight < 300) neededHeight = 300; // 너무 작아지지 않도록 최소 높이 유지

            container.style.height = neededHeight + 'px';

            // flex:1이 새 컨테이너 높이에 맞춰 다시 채우도록, 측정용으로 임시로 줬던 인라인 높이는 원복
            notesTextarea.style.height = '';
        }
        
        // 할일/메모장 사이 경계를 드래그해서 두 칸의 너비 비율을 자유롭게 조절
        function setupNotesSplitResizer() {
            const container = document.getElementById('notesSplitContainer');
            const divider = document.getElementById('notesSplitDivider');
            const todoPane = document.getElementById('todoPane');
            if (!container || !divider || !todoPane) return;
            
            // 저장된 비율이 있으면 복원
            const savedPercent = parseFloat(localStorage.getItem('notesSplitPercent'));
            if (!isNaN(savedPercent) && savedPercent >= 15 && savedPercent <= 85) {
                todoPane.style.flex = `0 0 ${savedPercent}%`;
            }
            
            let dragging = false;
            
            divider.addEventListener('pointerdown', (e) => {
                dragging = true;
                divider.classList.add('dragging');
                divider.setPointerCapture(e.pointerId);
            });
            
            divider.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                const rect = container.getBoundingClientRect();
                let percent = ((e.clientX - rect.left) / rect.width) * 100;
                percent = Math.min(85, Math.max(15, percent)); // 너무 극단적으로 좁아지지 않게 최소/최대 제한
                todoPane.style.flex = `0 0 ${percent}%`;
            });
            
            divider.addEventListener('pointerup', (e) => {
                if (!dragging) return;
                dragging = false;
                divider.classList.remove('dragging');
                divider.releasePointerCapture(e.pointerId);
                
                // 최종 비율 저장
                const rect = container.getBoundingClientRect();
                const todoRect = todoPane.getBoundingClientRect();
                const percent = (todoRect.width / rect.width) * 100;
                localStorage.setItem('notesSplitPercent', percent.toFixed(1));
            });
        }
        
        // 페이지를 닫거나 새로고침할 때도 입력 중이던 내용 저장 시도
        window.addEventListener('beforeunload', () => {
            captureCurrentFormToRecords();
            try {
                const blob = new Blob([JSON.stringify(getFullState())], { type: 'text/plain' });
                navigator.sendBeacon(GOOGLE_APPS_SCRIPT_URL, blob);
            } catch (e) { /* 무시 */ }
        });
        
        // ===== 개선/절감 과제 트래커 =====
        function renderSavingsProjects() {
            const container = document.getElementById('projectsList');
            if (!container) return;
            
            if (savingsProjects.length === 0) {
                container.innerHTML = '<div class="no-projects">아직 등록된 과제가 없습니다. "새 과제 추가"로 시작해보세요.</div>';
                return;
            }
            
            // 최근 수정된 순으로 표시
            const sorted = savingsProjects.slice().sort((a, b) => (b.updatedMonth || '').localeCompare(a.updatedMonth || ''));
            
            container.innerHTML = sorted.map(p => `
                <div class="project-card" onclick="openProjectModal('${p.id}')">
                    <div class="project-card-top">
                        <div class="project-card-title">${escapeHtml(p.title)}</div>
                        <span class="project-badge status-${p.status}">${p.status}</span>
                    </div>
                    <div class="project-card-category">${p.category}</div>
                    ${p.target ? `<div class="project-card-row"><b>목표:</b> ${escapeHtml(p.target)}</div>` : ''}
                    ${p.actual ? `<div class="project-card-row"><b>실제:</b> ${escapeHtml(p.actual)}</div>` : ''}
                    <div class="project-card-date">등록: ${p.createdMonth} · 최근 수정: ${p.updatedMonth}</div>
                </div>
            `).join('');
        }
        
        function openProjectModal(projectId) {
            if (!checkEditPermission()) return;
            editingProjectId = projectId;
            const modal = document.getElementById('projectModal');
            const title = document.getElementById('projectModalTitle');
            const deleteBtn = document.getElementById('deleteProjectBtn');
            
            if (projectId) {
                const p = savingsProjects.find(x => x.id === projectId);
                if (!p) return;
                title.textContent = '💡 개선/절감 과제 수정';
                document.getElementById('projectTitleInput').value = p.title;
                document.getElementById('projectCategoryInput').value = p.category;
                document.getElementById('projectStatusInput').value = p.status;
                document.getElementById('projectTargetInput').value = p.target || '';
                document.getElementById('projectActualInput').value = p.actual || '';
                deleteBtn.style.display = 'inline-block';
            } else {
                title.textContent = '💡 개선/절감 과제 추가';
                document.getElementById('projectTitleInput').value = '';
                document.getElementById('projectCategoryInput').value = '에너지절감';
                document.getElementById('projectStatusInput').value = '계획중';
                document.getElementById('projectTargetInput').value = '';
                document.getElementById('projectActualInput').value = '';
                deleteBtn.style.display = 'none';
            }
            
            modal.classList.add('active');
        }
        
        function closeProjectModal() {
            document.getElementById('projectModal').classList.remove('active');
            editingProjectId = null;
        }
        
        function saveProject() {
            if (!checkEditPermission()) return;
            const title = document.getElementById('projectTitleInput').value.trim();
            if (!title) {
                alert('과제명을 입력해주세요');
                return;
            }
            
            const category = document.getElementById('projectCategoryInput').value;
            const status = document.getElementById('projectStatusInput').value;
            const target = document.getElementById('projectTargetInput').value.trim();
            const actual = document.getElementById('projectActualInput').value.trim();
            const thisMonth = formatDate(new Date()).slice(0, 7); // YYYY-MM
            
            if (editingProjectId) {
                const p = savingsProjects.find(x => x.id === editingProjectId);
                if (p) {
                    p.title = title;
                    p.category = category;
                    p.status = status;
                    p.target = target;
                    p.actual = actual;
                    p.updatedMonth = thisMonth;
                }
            } else {
                savingsProjects.push({
                    id: 'proj_' + Date.now(),
                    title, category, status, target, actual,
                    createdMonth: thisMonth,
                    updatedMonth: thisMonth
                });
            }
            
            localStorage.setItem('savingsProjects', JSON.stringify(savingsProjects));
            queueSync();
            closeProjectModal();
            renderSavingsProjects();
        }
        
        function deleteProject() {
            if (!checkEditPermission()) return;
            if (!editingProjectId) return;
            confirmModal('이 과제를 삭제하시겠습니까?', () => {
                savingsProjects = savingsProjects.filter(p => p.id !== editingProjectId);
                localStorage.setItem('savingsProjects', JSON.stringify(savingsProjects));
                queueSync();
                closeProjectModal();
                renderSavingsProjects();
            });
        }
        
        // 등록된 절감 과제들을 AI 프롬프트에 넣기 좋은 텍스트로 요약 (월별 피드백/목표수립 KPI에서 사용)
        function buildSavingsProjectsSummaryText() {
            if (savingsProjects.length === 0) return '';
            return savingsProjects.map(p => {
                const parts = [`- [${p.category}/${p.status}] ${p.title}`];
                if (p.target) parts.push(`목표: ${p.target}`);
                if (p.actual) parts.push(`실제: ${p.actual}`);
                parts.push(`(등록 ${p.createdMonth}, 최근 수정 ${p.updatedMonth})`);
                return parts.join(' / ');
            }).join('\n');
        }

        // ===== 정비계획 =====
        // "차기 점검 예정"(YYYY-MM)을 년/월 라벨로 변환 (예: "2026-08" → "2026년 8월")
        function formatMonthLabel(yyyyMM) {
            const [y, mo] = yyyyMM.split('-');
            return `${y}년 ${parseInt(mo, 10)}월`;
        }

        // 여러 건이 쌓이면 한눈에 확인하기 어려우므로, 차기 점검 예정월을 기준으로 묶어서 표시함.
        // 예정월을 아직 안 정했거나(빈 값) 형식이 다른 과거 데이터는 맨 아래 "예정일 미정" 그룹으로 모음
        function renderMaintenanceSchedule() {
            const container = document.getElementById('maintenanceList');
            if (!container) return;

            if (maintenanceSchedule.length === 0) {
                container.innerHTML = '<div class="no-projects">아직 등록된 정비계획이 없습니다. "새 일정 추가"로 시작해보세요.</div>';
                return;
            }

            const groups = {};
            for (const m of maintenanceSchedule) {
                const key = /^\d{4}-\d{2}$/.test(m.nextDue || '') ? m.nextDue : '';
                if (!groups[key]) groups[key] = [];
                groups[key].push(m);
            }

            const currentMonthKey = formatDate(new Date()).slice(0, 7);
            const monthKeys = Object.keys(groups).filter(k => k !== '').sort();
            if (groups['']) monthKeys.push(''); // 미정 그룹은 항상 맨 뒤

            container.innerHTML = monthKeys.map(key => {
                const items = groups[key].slice().sort((a, b) => (a.equipment || '').localeCompare(b.equipment || ''));
                const headerLabel = key
                    ? formatMonthLabel(key) + (key === currentMonthKey ? ' · 이번 달' : '')
                    : '📌 예정일 미정';

                const cardsHtml = items.map(m => `
                    <div class="project-card" onclick="openMaintenanceModal('${m.id}')">
                        <div class="project-card-top">
                            <div class="project-card-title">${escapeHtml(m.equipment)}${m.item ? ' · ' + escapeHtml(m.item) : ''}</div>
                            <span class="project-badge status-${maintenanceStatusClass(m.status)}">${m.status}</span>
                        </div>
                        ${m.area ? `<div class="project-card-category">${escapeHtml(m.area)}</div>` : ''}
                        ${m.sop ? `<div class="project-card-row"><b>SOP:</b> ${escapeHtml(m.sop)}</div>` : ''}
                        ${m.cycle ? `<div class="project-card-row"><b>주기:</b> ${escapeHtml(m.cycle)}</div>` : ''}
                        ${m.lastDone ? `<div class="project-card-row"><b>이전 완료:</b> ${escapeHtml(m.lastDone)}</div>` : ''}
                    </div>
                `).join('');

                return `
                    <div class="maintenance-month-group" style="margin-bottom:24px;">
                        <div class="result-date">${headerLabel}</div>
                        ${cardsHtml}
                    </div>
                `;
            }).join('');
        }

        // 정비계획 상태값은 개선/절감 과제와 이름이 달라서, 배지 색상 클래스(status-계획중/완료/보류)에 맞춰 매핑함
        function maintenanceStatusClass(status) {
            if (status === '완료') return '완료';
            if (status === '보류') return '보류';
            return '계획중'; // 예정
        }

        function openMaintenanceModal(itemId) {
            if (!checkEditPermission()) return;
            editingMaintenanceId = itemId;
            const modal = document.getElementById('maintenanceModal');
            const title = document.getElementById('maintenanceModalTitle');
            const deleteBtn = document.getElementById('deleteMaintenanceBtn');

            if (itemId) {
                const m = maintenanceSchedule.find(x => x.id === itemId);
                if (!m) return;
                title.textContent = '🔧 정비계획 수정';
                document.getElementById('maintEquipmentInput').value = m.equipment || '';
                document.getElementById('maintAreaInput').value = m.area || '';
                document.getElementById('maintItemInput').value = m.item || '';
                document.getElementById('maintSopInput').value = m.sop || '';
                document.getElementById('maintCycleInput').value = m.cycle || '';
                document.getElementById('maintStatusInput').value = m.status || '예정';
                document.getElementById('maintLastDoneInput').value = m.lastDone || '';
                document.getElementById('maintNextDueInput').value = m.nextDue || '';
                document.getElementById('maintNoteInput').value = m.note || '';
                deleteBtn.style.display = 'inline-block';
            } else {
                title.textContent = '🔧 정비계획 추가';
                document.getElementById('maintEquipmentInput').value = '';
                document.getElementById('maintAreaInput').value = '';
                document.getElementById('maintItemInput').value = '';
                document.getElementById('maintSopInput').value = '';
                document.getElementById('maintCycleInput').value = '';
                document.getElementById('maintStatusInput').value = '예정';
                document.getElementById('maintLastDoneInput').value = '';
                document.getElementById('maintNextDueInput').value = '';
                document.getElementById('maintNoteInput').value = '';
                deleteBtn.style.display = 'none';
            }

            modal.classList.add('active');
            applyFormLockState(); // 위 각 input.value 설정 뒤에도 잠금 상태(readOnly)가 유지되도록 재적용
        }

        function closeMaintenanceModal() {
            document.getElementById('maintenanceModal').classList.remove('active');
            editingMaintenanceId = null;
        }

        function saveMaintenanceItem() {
            if (!checkEditPermission()) return;

            const equipment = document.getElementById('maintEquipmentInput').value.trim();
            if (!equipment) {
                alert('설비명을 입력해주세요');
                return;
            }

            const area = document.getElementById('maintAreaInput').value.trim();
            const item = document.getElementById('maintItemInput').value.trim();
            const sop = document.getElementById('maintSopInput').value.trim();
            const cycle = document.getElementById('maintCycleInput').value.trim();
            const status = document.getElementById('maintStatusInput').value;
            const lastDone = document.getElementById('maintLastDoneInput').value.trim();
            const nextDue = document.getElementById('maintNextDueInput').value.trim();
            const note = document.getElementById('maintNoteInput').value.trim();
            const nowStr = formatDate(new Date());

            if (editingMaintenanceId) {
                const m = maintenanceSchedule.find(x => x.id === editingMaintenanceId);
                if (m) {
                    m.equipment = equipment; m.area = area; m.item = item; m.sop = sop;
                    m.cycle = cycle; m.status = status; m.lastDone = lastDone; m.nextDue = nextDue;
                    m.note = note; m.updatedAt = nowStr;
                }
            } else {
                maintenanceSchedule.push({
                    id: 'maint_' + Date.now(),
                    equipment, area, item, sop, cycle, status, lastDone, nextDue, note,
                    createdAt: nowStr, updatedAt: nowStr
                });
            }

            localStorage.setItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
            queueSync();
            closeMaintenanceModal();
            renderMaintenanceSchedule();
        }

        function deleteMaintenanceItem() {
            if (!checkEditPermission()) return;
            if (!editingMaintenanceId) return;
            confirmModal('이 정비계획 항목을 삭제하시겠습니까?', () => {
                maintenanceSchedule = maintenanceSchedule.filter(m => m.id !== editingMaintenanceId);
                localStorage.setItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
                queueSync();
                closeMaintenanceModal();
                renderMaintenanceSchedule();
            });
        }

        // ===== AI 월별 피드백 요약 =====
        function applyAITemplate() {
            document.getElementById('aiTemplateTextarea').value = aiTemplateContent;
        }
        
        function setupAITemplateAutosave() {
            const textarea = document.getElementById('aiTemplateTextarea');
            let saveTimeout = null;
            
            textarea.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    aiTemplateContent = textarea.value;
                    localStorage.setItem('aiTemplate', aiTemplateContent);
                    queueSync();
                }, 500);
            });
        }
        
        // 선택한 기간의 활동기록 + 예정작업을 하나의 텍스트로 정리
        function buildLogTextForRange(startStr, endStr) {
            const dates = Object.keys(records)
                .filter(d => d >= startStr && d <= endStr)
                .sort();
            
            let text = '';
            for (const dateStr of dates) {
                const rec = records[dateStr];
                const parts = [];
                for (const category of categories) {
                    if (rec[category] && rec[category].trim() !== '') {
                        parts.push(`  [${category}] ${rec[category].trim()}`);
                    }
                }
                
                const dayEvents = events.filter(ev => dateStr >= ev.start && dateStr <= ev.end);
                if (dayEvents.length > 0) {
                    parts.push(`  [예정작업] ${dayEvents.map(ev => ev.title).join(', ')}`);
                }
                
                if (parts.length > 0) {
                    text += `\n${dateStr}\n` + parts.join('\n') + '\n';
                }
            }
            return text.trim();
        }
        
        // ===== 일일 업무 요약 (퇴근 전 보고용) =====
        // 일일 업무 요약 로딩 중 보여줄 가짜 진행률 - 실제 API는 진행률을 안 주므로,
        // 남은 구간을 매번 조금씩 채워가며 90%에서 멈춰있다가 응답이 오면 100%로 채움
        let dailySummaryProgressTimer = null;
        const DAILY_SUMMARY_LOADING_MESSAGES = ['오늘 업무를 정리하는 중입니다', '항목을 다듬는 중입니다', '거의 다 됐습니다'];

        function startDailySummaryProgress() {
            const msgEl = document.getElementById('dailySummaryLoadingMsg');
            const percentEl = document.getElementById('dailySummaryLoadingPercent');
            const barEl = document.getElementById('dailySummaryLoadingBar');
            let percent = 0;
            let msgIndex = 0;
            if (msgEl) msgEl.textContent = DAILY_SUMMARY_LOADING_MESSAGES[0];
            if (percentEl) percentEl.textContent = '0%';
            if (barEl) barEl.style.width = '0%';

            dailySummaryProgressTimer = setInterval(() => {
                percent = Math.min(90, percent + (90 - percent) * 0.15 + 1);
                if (percentEl) percentEl.textContent = Math.round(percent) + '%';
                if (barEl) barEl.style.width = percent + '%';

                const nextMsgIndex = percent > 65 ? 2 : (percent > 25 ? 1 : 0);
                if (nextMsgIndex !== msgIndex) {
                    msgIndex = nextMsgIndex;
                    if (msgEl) msgEl.textContent = DAILY_SUMMARY_LOADING_MESSAGES[msgIndex];
                }
            }, 350);
        }

        function stopDailySummaryProgress(success) {
            clearInterval(dailySummaryProgressTimer);
            dailySummaryProgressTimer = null;
            const percentEl = document.getElementById('dailySummaryLoadingPercent');
            const barEl = document.getElementById('dailySummaryLoadingBar');
            if (success) {
                if (percentEl) percentEl.textContent = '100%';
                if (barEl) barEl.style.width = '100%';
            }
        }

        async function generateDailySummary() {
            const dateStr = document.getElementById('dailySummaryDate').value;
            const btn = document.getElementById('dailySummaryBtn');
            const loading = document.getElementById('dailySummaryLoading');
            const statusEl = document.getElementById('dailySummaryStatus');
            const resultBlock = document.getElementById('dailySummaryResultBlock');
            
            if (!dateStr) {
                statusEl.textContent = '날짜를 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            const logText = buildLogTextForRange(dateStr, dateStr);
            if (!logText) {
                statusEl.textContent = '이 날짜에 작성된 활동기록이 없습니다';
                statusEl.className = 'ai-status error';
                return;
            }
            
            const dateObj = new Date(dateStr);
            const dateLabel = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
            
            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';
            startDailySummaryProgress();

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'dailySummary',
                        employeeId: currentEmployeeId,
                        date: dateStr,
                        dateLabel: dateLabel,
                        logText: logText,
                        itemCount: document.getElementById('dailySummaryItemCount').value,
                        userApiKey: personalAiApiKey
                    })
                });

                const data = await res.json();

                if (data.status === 'success' && data.summary) {
                    stopDailySummaryProgress(true);
                    document.getElementById('dailySummaryResultTextarea').value = data.summary;
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 오늘 업무 요약이 생성되었습니다';
                    statusEl.className = 'ai-status success';
                } else {
                    stopDailySummaryProgress(false);
                    statusEl.textContent = '⚠️ ' + (data.message || '요약 생성에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('일일 업무 요약 오류:', err);
                stopDailySummaryProgress(false);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다. Apps Script 설정을 확인해주세요.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        function copyDailySummaryResult() {
            const textarea = document.getElementById('dailySummaryResultTextarea');
            textarea.select();
            document.execCommand('copy');

            const statusEl = document.getElementById('dailySummaryStatus');
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }

        // ===== 이번주 업무 요약 =====
        // 오늘이 속한 주의 월요일~일요일 범위를 구함 (일요일은 getDay()가 0이라 따로 처리)
        function getThisWeekRange() {
            const today = new Date();
            const day = today.getDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            const monday = new Date(today);
            monday.setDate(today.getDate() + diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { start: formatDate(monday), end: formatDate(sunday) };
        }

        let weeklySummaryProgressTimer = null;
        const WEEKLY_SUMMARY_LOADING_MESSAGES = ['이번 주 업무를 정리하는 중입니다', '카테고리별로 묶는 중입니다', '거의 다 됐습니다'];

        function startWeeklySummaryProgress() {
            const msgEl = document.getElementById('weeklySummaryLoadingMsg');
            const percentEl = document.getElementById('weeklySummaryLoadingPercent');
            const barEl = document.getElementById('weeklySummaryLoadingBar');
            let percent = 0;
            let msgIndex = 0;
            if (msgEl) msgEl.textContent = WEEKLY_SUMMARY_LOADING_MESSAGES[0];
            if (percentEl) percentEl.textContent = '0%';
            if (barEl) barEl.style.width = '0%';

            weeklySummaryProgressTimer = setInterval(() => {
                percent = Math.min(90, percent + (90 - percent) * 0.15 + 1);
                if (percentEl) percentEl.textContent = Math.round(percent) + '%';
                if (barEl) barEl.style.width = percent + '%';

                const nextMsgIndex = percent > 65 ? 2 : (percent > 25 ? 1 : 0);
                if (nextMsgIndex !== msgIndex) {
                    msgIndex = nextMsgIndex;
                    if (msgEl) msgEl.textContent = WEEKLY_SUMMARY_LOADING_MESSAGES[msgIndex];
                }
            }, 350);
        }

        function stopWeeklySummaryProgress(success) {
            clearInterval(weeklySummaryProgressTimer);
            weeklySummaryProgressTimer = null;
            const percentEl = document.getElementById('weeklySummaryLoadingPercent');
            const barEl = document.getElementById('weeklySummaryLoadingBar');
            if (success) {
                if (percentEl) percentEl.textContent = '100%';
                if (barEl) barEl.style.width = '100%';
            }
        }

        async function generateWeeklySummary() {
            const btn = document.getElementById('weeklySummaryBtn');
            const loading = document.getElementById('weeklySummaryLoading');
            const statusEl = document.getElementById('weeklySummaryStatus');
            const resultBlock = document.getElementById('weeklySummaryResultBlock');

            const { start, end } = getThisWeekRange();
            const logText = buildLogTextForRange(start, end);
            if (!logText) {
                statusEl.textContent = '이번 주에 작성된 활동기록이 없습니다';
                statusEl.className = 'ai-status error';
                return;
            }

            const startLabel = new Date(start).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
            const endLabel = new Date(end).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
            const periodLabel = `${startLabel} ~ ${endLabel}`;

            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';
            startWeeklySummaryProgress();

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'weeklySummary',
                        periodLabel: periodLabel,
                        logText: logText,
                        userApiKey: personalAiApiKey
                    })
                });

                const data = await res.json();

                if (data.status === 'success' && data.summary) {
                    stopWeeklySummaryProgress(true);
                    document.getElementById('weeklySummaryResultTextarea').value = data.summary;
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 이번주 업무 요약이 생성되었습니다';
                    statusEl.className = 'ai-status success';
                } else {
                    stopWeeklySummaryProgress(false);
                    statusEl.textContent = '⚠️ ' + (data.message || '요약 생성에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('이번주 업무 요약 오류:', err);
                stopWeeklySummaryProgress(false);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다. Apps Script 설정을 확인해주세요.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }

        function copyWeeklySummaryResult() {
            const textarea = document.getElementById('weeklySummaryResultTextarea');
            textarea.select();
            document.execCommand('copy');

            const statusEl = document.getElementById('weeklySummaryStatus');
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }

        let aiConversationHistory = []; // [{role:'user'|'model', text:'...'}] - raw(JSON원문)을 저장해 맥락 유지

        // "생성하기"는 대화로 다듬어온 내용(aiConversationHistory)을 확인 없이 통째로 덮어썼음.
        // 최초 생성 직후엔 history가 정확히 2개(사용자 프롬프트+모델 응답)이고, 다듬기(revise)를
        // 한 번 할 때마다 2개씩 늘어나므로, 2개 초과면 다듬은 내용이 있다는 뜻 - 그럴 때만 확인받음
        async function generateAISummary() {
            if (aiConversationHistory.length > 2) {
                confirmModal('지금까지 대화로 다듬은 내용이 있습니다. 새로 생성하면 그 내용이 사라지고 처음부터 다시 만들어집니다. 계속할까요?', () => {
                    doGenerateAISummary();
                });
                return;
            }
            doGenerateAISummary();
        }

        async function doGenerateAISummary() {
            const startStr = document.getElementById('aiStartDate').value;
            const endStr = document.getElementById('aiEndDate').value;
            const template = document.getElementById('aiTemplateTextarea').value;
            const btn = document.getElementById('aiGenerateBtn');
            const reviseBtn = document.getElementById('aiReviseBtn');
            const loading = document.getElementById('aiLoading');
            const statusEl = document.getElementById('aiStatus');
            const resultBlock = document.getElementById('aiResultBlock');

            if (!startStr || !endStr) {
                statusEl.textContent = '기간을 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            let logText = buildLogTextForRange(startStr, endStr);
            if (!logText) {
                statusEl.textContent = '해당 기간에 작성된 활동기록이 없습니다';
                statusEl.className = 'ai-status error';
                return;
            }
            
            const projectsSummary = buildSavingsProjectsSummaryText();
            if (projectsSummary) {
                logText += `\n\n[등록된 개선/절감 과제 현황]\n${projectsSummary}`;
            }
            
            btn.disabled = true;
            reviseBtn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';

            const periodLabel = `${startStr} ~ ${endStr}`;
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'summarize',
                        template: template,
                        logText: logText,
                        periodLabel: periodLabel,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success') {
                    document.getElementById('aiGoodTextarea').value = data.good || '';
                    document.getElementById('aiImproveTextarea').value = data.improve || '';
                    document.getElementById('aiReviseInput').value = '';
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 요약이 생성되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    // 새로운 요약을 생성했으니 대화 히스토리도 새로 시작
                    // (서버가 자기 응답 그대로를 model 턴으로 기억해야 다음 수정 요청에서 형식을 유지함)
                    const userPromptText = `[기간] ${periodLabel}\n\n[양식]\n${template}\n\n[일일 기록 원본]\n${logText}`;
                    aiConversationHistory = [
                        { role: 'user', text: userPromptText },
                        { role: 'model', text: data.raw || JSON.stringify({ good: data.good, improve: data.improve }) }
                    ];
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || 'AI 요약 생성에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('AI 요약 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다. Apps Script 설정을 확인해주세요.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                reviseBtn.disabled = false;
                loading.style.display = 'none';
            }
        }

        async function reviseAISummary() {
            const instructionInput = document.getElementById('aiReviseInput');
            const instruction = instructionInput.value.trim();
            const reviseBtn = document.getElementById('aiReviseBtn');
            const generateBtn = document.getElementById('aiGenerateBtn');
            const loading = document.getElementById('aiLoading');
            const statusEl = document.getElementById('aiStatus');

            if (!instruction) {
                statusEl.textContent = '수정 요청 내용을 입력해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            if (aiConversationHistory.length === 0) {
                statusEl.textContent = '먼저 요약을 생성해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            reviseBtn.disabled = true;
            generateBtn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'revise',
                        history: aiConversationHistory,
                        instruction: instruction,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success') {
                    document.getElementById('aiGoodTextarea').value = data.good || '';
                    document.getElementById('aiImproveTextarea').value = data.improve || '';
                    statusEl.textContent = '✅ 수정 내용이 반영되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    aiConversationHistory.push({ role: 'user', text: instruction });
                    aiConversationHistory.push({ role: 'model', text: data.raw || JSON.stringify({ good: data.good, improve: data.improve }) });
                    instructionInput.value = '';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '수정 반영에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('AI 수정 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                reviseBtn.disabled = false;
                generateBtn.disabled = false;
                loading.style.display = 'none';
            }
        }

        function copyGoodResult() {
            const textarea = document.getElementById('aiGoodTextarea');
            textarea.select();
            document.execCommand('copy');
            const statusEl = document.getElementById('aiStatus');
            statusEl.textContent = '📋 잘한점(한일)이 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }
        
        function copyImproveResult() {
            const textarea = document.getElementById('aiImproveTextarea');
            textarea.select();
            document.execCommand('copy');
            const statusEl = document.getElementById('aiStatus');
            statusEl.textContent = '📋 개선/보완할 점(할일)이 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }
        
        // ===== 목표수립 (KPI/핵심역량/성장계획/핵심가치/기타) - 전체 내용 한 번에 입력, 체크한 항목만 생성/개별 수정 =====
        const GOAL_AREAS = [
            { id: 'kpi', label: 'KPI', hint: '성과달성을 위한 주요 본질 업무' },
            { id: 'competency', label: '핵심역량', hint: '본질업무를 효율적·효과적으로 수행하기 위한 활동' },
            { id: 'growth', label: '인재육성/성장계획', hint: '본인 성장계획 (아래 체크 시 후배사원 육성계획도 함께)' },
            { id: 'corevalue', label: '핵심가치', hint: '대웅 인사주요제도 내재화 계획' },
            { id: 'etc', label: '기타', hint: '수명업무/TF활동 등' }
        ];

        let goalConversationHistories = {}; // { kpi: [...], competency: [...], ... }
        let goalAreaOptions = {}; // 생성 시점의 영역별 추가 옵션 (예: growth 영역의 includeTalentDev), 수정요청 때도 동일하게 재사용

        function loadGoalGrowthIncludeTalentDev() {
            return localStorage.getItem('goalGrowthIncludeTalentDev') === 'true';
        }

        function saveGoalGrowthIncludeTalentDev(checked) {
            localStorage.setItem('goalGrowthIncludeTalentDev', checked ? 'true' : 'false');
        }

        // 항목 체크 상태는 기본적으로 전부 선택된 상태로 시작 (한 번 바꾸면 다음에도 그대로 기억)
        function loadGoalAreaChecked(areaId) {
            const saved = localStorage.getItem(`goalAreaChecked_${areaId}`);
            return saved === null ? true : saved === 'true';
        }

        function saveGoalAreaChecked(areaId, checked) {
            localStorage.setItem(`goalAreaChecked_${areaId}`, checked ? 'true' : 'false');
        }

        function renderGoalAreaCheckRow() {
            const row = document.getElementById('goalAreaCheckRow');
            if (!row) return;
            row.innerHTML = GOAL_AREAS.map(area => `
                <label class="goal-area-check-item">
                    <input type="checkbox" id="goalAreaCheck-${area.id}" ${loadGoalAreaChecked(area.id) ? 'checked' : ''} onchange="saveGoalAreaChecked('${area.id}', this.checked)">
                    ${area.label}
                </label>
            `).join('') + `
                <label class="goal-growth-scope-toggle">
                    <input type="checkbox" id="goalGrowthIncludeTalentDev" ${loadGoalGrowthIncludeTalentDev() ? 'checked' : ''} onchange="saveGoalGrowthIncludeTalentDev(this.checked)">
                    (인재육성/성장계획 체크 시) 후배/파트원 육성계획도 함께 작성 - 팀장/파트장 등 육성 책임이 있는 경우 체크
                </label>
            `;
        }

        function renderGoalAreas() {
            renderGoalAreaCheckRow();
            const container = document.getElementById('goalAreasContainer');
            container.innerHTML = GOAL_AREAS.map(area => `
                <div class="goal-area-block" data-area="${area.id}">
                    <div class="goal-area-header">
                        <span class="goal-area-title">${area.label}</span>
                        <span class="goal-area-hint">${area.hint}</span>
                    </div>
                    <div class="ai-loading" id="goalLoading-${area.id}" style="display:none;">🤖 작성 중...</div>

                    <div class="goal-result-block" id="goalResultBlock-${area.id}" style="display:none;">
                        <div class="ai-block-label-row">
                            <label class="ai-block-label">✅ 생성된 초안</label>
                            <button class="ai-copy-btn" onclick="copyGoalResult('${area.id}')">📋 복사</button>
                        </div>
                        <textarea class="goal-result-textarea" id="goalResult-${area.id}"></textarea>

                        <div class="goal-revise-row">
                            <input type="text" class="goal-revise-input" id="goalReviseInput-${area.id}" placeholder="이 항목만 수정 요청 (예: 좀 더 구체적으로)">
                            <button class="goal-revise-btn" id="goalReviseBtn-${area.id}" onclick="reviseGoalDraft('${area.id}')">🔄 수정 반영</button>
                        </div>
                    </div>

                    <div class="goal-status" id="goalStatus-${area.id}"></div>
                </div>
            `).join('');
        }

        function goalRefLogText() {
            const startStr = document.getElementById('goalRefStartDate').value;
            const endStr = document.getElementById('goalRefEndDate').value;
            if (!startStr || !endStr) return '';
            return buildLogTextForRange(startStr, endStr);
        }

        // 체크한 항목들을 한 번의 AI 호출로 함께 생성 - 전체 내용을 하나로 보내면 모델이 각 항목
        // 가이드에 맞게 알맞은 항목 하나에만 배치해서, 같은 내용이 여러 항목에 겹쳐 쓰이지 않게 함
        async function generateAllGoalDrafts() {
            const checkedAreas = GOAL_AREAS.filter(area => document.getElementById(`goalAreaCheck-${area.id}`)?.checked);
            const globalStatusEl = document.getElementById('goalGlobalStatus');
            const globalLoading = document.getElementById('goalGlobalLoading');
            const globalBtn = document.getElementById('goalGenerateAllBtn');

            if (checkedAreas.length === 0) {
                globalStatusEl.textContent = '작성할 항목을 하나 이상 선택해주세요';
                globalStatusEl.className = 'goal-status error';
                return;
            }

            const note = document.getElementById('goalGlobalNote').value.trim();
            let logText = goalRefLogText();

            // KPI가 체크되어 있으면 절감 과제 트래커에 기록해둔 실제 목표/실적 수치를 근거로 함께 활용
            if (checkedAreas.some(area => area.id === 'kpi')) {
                const projectsSummary = buildSavingsProjectsSummaryText();
                if (projectsSummary) {
                    logText += `\n\n[등록된 개선/절감 과제 현황]\n${projectsSummary}`;
                }
            }

            // growth 영역은 후배/파트원 육성계획 포함 여부에 따라 안내문이 달라짐 - 생성 시점 선택을 이후 수정요청에도 동일하게 재사용
            const includeTalentDev = document.getElementById('goalGrowthIncludeTalentDev')?.checked || false;
            goalAreaOptions.growth = { includeTalentDev };

            globalBtn.disabled = true;
            globalLoading.style.display = 'block';
            globalStatusEl.textContent = '';
            globalStatusEl.className = 'goal-status';

            checkedAreas.forEach(area => {
                document.getElementById(`goalLoading-${area.id}`).style.display = 'block';
                document.getElementById(`goalResultBlock-${area.id}`).style.display = 'none';
                const statusEl = document.getElementById(`goalStatus-${area.id}`);
                statusEl.textContent = '';
                statusEl.className = 'goal-status';
            });

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'goalDraftAll',
                        areas: checkedAreas.map(area => area.id),
                        note: note,
                        logText: logText,
                        includeTalentDev: includeTalentDev,
                        userApiKey: personalAiApiKey
                    })
                });

                const data = await res.json();

                if (data.status === 'success' && data.drafts) {
                    const userPromptText =
                        `[참고 자료 - 현 수준 평가용 과거 활동 기록 (그대로 요약하지 말 것)]\n${logText || '(제공된 활동 기록 없음)'}\n\n` +
                        `[본인이 적은 전체 방향성/메모 - 이 항목에 알맞은 부분만 반영됨]\n${note || '(작성한 메모 없음)'}`;

                    let missingCount = 0;
                    checkedAreas.forEach(area => {
                        const draftText = data.drafts[area.id];
                        const statusEl = document.getElementById(`goalStatus-${area.id}`);
                        if (draftText) {
                            document.getElementById(`goalResult-${area.id}`).value = draftText;
                            document.getElementById(`goalReviseInput-${area.id}`).value = '';
                            document.getElementById(`goalResultBlock-${area.id}`).style.display = 'block';
                            statusEl.textContent = '✅ 초안이 생성되었습니다';
                            statusEl.className = 'goal-status success';
                            goalConversationHistories[area.id] = [
                                { role: 'user', text: userPromptText },
                                { role: 'model', text: draftText }
                            ];
                        } else {
                            missingCount++;
                            statusEl.textContent = '⚠️ 이 항목의 생성 결과를 받지 못했습니다. 다시 시도해주세요.';
                            statusEl.className = 'goal-status error';
                        }
                    });

                    if (missingCount === 0) {
                        globalStatusEl.textContent = `✅ ${checkedAreas.length}개 항목 초안이 생성되었습니다`;
                        globalStatusEl.className = 'goal-status success';
                    } else {
                        globalStatusEl.textContent = `⚠️ ${checkedAreas.length - missingCount}개 성공, ${missingCount}개 실패했습니다 (아래 항목별 상태 확인)`;
                        globalStatusEl.className = 'goal-status error';
                    }
                } else {
                    const message = '⚠️ ' + (data.message || '초안 생성에 실패했습니다');
                    globalStatusEl.textContent = message;
                    globalStatusEl.className = 'goal-status error';
                    checkedAreas.forEach(area => {
                        const statusEl = document.getElementById(`goalStatus-${area.id}`);
                        statusEl.textContent = message;
                        statusEl.className = 'goal-status error';
                    });
                }
            } catch (err) {
                console.error('목표수립 초안 생성 오류:', err);
                const message = '⚠️ 서버 연결에 실패했습니다.';
                globalStatusEl.textContent = message;
                globalStatusEl.className = 'goal-status error';
                checkedAreas.forEach(area => {
                    const statusEl = document.getElementById(`goalStatus-${area.id}`);
                    statusEl.textContent = message;
                    statusEl.className = 'goal-status error';
                });
            } finally {
                globalBtn.disabled = false;
                globalLoading.style.display = 'none';
                checkedAreas.forEach(area => {
                    document.getElementById(`goalLoading-${area.id}`).style.display = 'none';
                });
            }
        }
        
        async function reviseGoalDraft(areaId) {
            const instructionInput = document.getElementById(`goalReviseInput-${areaId}`);
            const instruction = instructionInput.value.trim();
            const reviseBtn = document.getElementById(`goalReviseBtn-${areaId}`);
            const loading = document.getElementById(`goalLoading-${areaId}`);
            const statusEl = document.getElementById(`goalStatus-${areaId}`);
            
            if (!instruction) {
                statusEl.textContent = '수정 요청 내용을 입력해주세요';
                statusEl.className = 'goal-status error';
                return;
            }
            
            if (!goalConversationHistories[areaId] || goalConversationHistories[areaId].length === 0) {
                statusEl.textContent = '먼저 초안을 생성해주세요';
                statusEl.className = 'goal-status error';
                return;
            }
            
            reviseBtn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'goal-status';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'goalRevise',
                        area: areaId,
                        history: goalConversationHistories[areaId],
                        instruction: instruction,
                        includeTalentDev: goalAreaOptions[areaId]?.includeTalentDev || false,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success' && data.summary) {
                    document.getElementById(`goalResult-${areaId}`).value = data.summary;
                    statusEl.textContent = '✅ 수정 내용이 반영되었습니다';
                    statusEl.className = 'goal-status success';
                    
                    goalConversationHistories[areaId].push({ role: 'user', text: instruction });
                    goalConversationHistories[areaId].push({ role: 'model', text: data.summary });
                    instructionInput.value = '';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '수정 반영에 실패했습니다');
                    statusEl.className = 'goal-status error';
                }
            } catch (err) {
                console.error('목표수립 수정 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'goal-status error';
            } finally {
                reviseBtn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        // ===== 설비 데이터 경향 분석 =====
        let trendConversationHistory = [];
        
        // 설비·측정 항목과 관리 기준은 매번 같은 값을 다시 입력하지 않도록 저장해두고 다음에 복원함.
        // (측정 데이터 자체는 매번 새로 붙여넣는 것이라 저장하지 않음)
        function applyTrendSettings() {
            const subjectEl = document.getElementById('trendSubjectInput');
            const specEl = document.getElementById('trendSpecInput');
            if (subjectEl) subjectEl.value = trendSubject;
            if (specEl) specEl.value = trendSpec;
        }
        
        function setupTrendSettingsAutosave() {
            const subjectEl = document.getElementById('trendSubjectInput');
            const specEl = document.getElementById('trendSpecInput');
            if (!subjectEl || !specEl) return;
            
            let t1 = null, t2 = null;
            
            subjectEl.addEventListener('input', () => {
                clearTimeout(t1);
                t1 = setTimeout(() => {
                    trendSubject = subjectEl.value;
                    localStorage.setItem('trendSubject', trendSubject);
                    queueSync();
                }, 500);
            });
            
            specEl.addEventListener('input', () => {
                clearTimeout(t2);
                t2 = setTimeout(() => {
                    trendSpec = specEl.value;
                    localStorage.setItem('trendSpec', trendSpec);
                    queueSync();
                }, 500);
            });
        }
        
        async function analyzeTrendData() {
            const subject = document.getElementById('trendSubjectInput').value.trim();
            const data = document.getElementById('trendDataInput').value.trim();
            const spec = document.getElementById('trendSpecInput').value.trim();
            const btn = document.getElementById('trendAnalyzeBtn');
            const loading = document.getElementById('trendLoading');
            const statusEl = document.getElementById('trendStatus');
            const resultBlock = document.getElementById('trendResultBlock');
            
            if (!data) {
                statusEl.textContent = '분석할 측정값을 붙여넣어주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';
            
            const userPrompt =
                `[설비/측정 항목]\n${subject || '(지정하지 않음)'}\n\n` +
                `[관리 기준]\n${spec || '(제공되지 않음)'}\n\n` +
                `[측정 데이터]\n${data}`;
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'trendAnalysis', prompt: userPrompt, userApiKey: personalAiApiKey })
                });
                
                const result = await res.json();
                
                if (result.status === 'success' && result.summary) {
                    document.getElementById('trendResultTextarea').value = result.summary;
                    document.getElementById('trendReviseInput').value = '';
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 분석이 완료되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    trendConversationHistory = [
                        { role: 'user', text: userPrompt },
                        { role: 'model', text: result.summary }
                    ];
                } else {
                    statusEl.textContent = '⚠️ ' + (result.message || '분석에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('경향 분석 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        async function reviseTrendAnalysis() {
            const input = document.getElementById('trendReviseInput');
            const instruction = input.value.trim();
            const btn = document.getElementById('trendReviseBtn');
            const loading = document.getElementById('trendLoading');
            const statusEl = document.getElementById('trendStatus');
            
            if (!instruction) {
                statusEl.textContent = '질문 내용을 입력해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            if (trendConversationHistory.length === 0) {
                statusEl.textContent = '먼저 분석을 실행해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'trendRevise',
                        history: trendConversationHistory,
                        instruction: instruction,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const result = await res.json();
                
                if (result.status === 'success' && result.summary) {
                    document.getElementById('trendResultTextarea').value = result.summary;
                    statusEl.textContent = '✅ 답변이 반영되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    trendConversationHistory.push({ role: 'user', text: instruction });
                    trendConversationHistory.push({ role: 'model', text: result.summary });
                    input.value = '';
                } else {
                    statusEl.textContent = '⚠️ ' + (result.message || '처리에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('경향 분석 추가 질문 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        function copyTrendResult() {
            const textarea = document.getElementById('trendResultTextarea');
            textarea.select();
            document.execCommand('copy');
            
            const statusEl = document.getElementById('trendStatus');
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }
        
        function copyGoalResult(areaId) {
            const textarea = document.getElementById(`goalResult-${areaId}`);
            textarea.select();
            document.execCommand('copy');
            
            const statusEl = document.getElementById(`goalStatus-${areaId}`);
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'goal-status success';
        }
        
        // ===== 다크모드 =====
        function toggleTheme() {
            if (!checkEditPermission()) return;
            const isDark = document.documentElement.classList.toggle('dark-mode');
            try {
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            } catch (e) { /* 저장 실패해도 화면 전환 자체는 계속 동작하게 무시 */ }
            applyThemeButtonLabel();
        }
        
        function applyThemeButtonLabel() {
            const btn = document.getElementById('themeToggleBtn');
            if (!btn) return;
            const isDark = document.documentElement.classList.contains('dark-mode');
            btn.textContent = isDark ? '☀️ 라이트모드' : '🌙 다크모드';
        }
        
        // ===== 사번별 로그인 =====
        // 참고: 비밀번호는 평문으로 서버에 보내지 않고 SHA-256으로 해시해서 보냅니다.
        // 다만 별도 솔트(사번 결합) 정도만 적용한 가벼운 방식이라, 회사 인증 시스템 수준의
        // 보안은 아니라는 점은 감안해주세요.

        async function sha256Hex(text) {
            const enc = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // 홈페이지에 접속하면 항상 기본은 로그아웃 상태로 시작해서 로그인 모달을 띄워둠.
        // 이전에는 브라우저에 저장된 사번/비밀번호로 자동 로그인을 시도했지만, 매번 직접
        // 로그인하도록 그 기능을 없앰
        function resetToLoggedOutState() {
            editUnlocked = false;
            currentEmployeeId = '';
            currentPasswordHash = '';
            applyEditLockUI();
            openLoginModal(true); // true = 로그인 전까지 닫을 수 없는 강제 모드
        }

        // forced=true면 로그인하기 전까지 ESC/배경클릭/취소 버튼으로 닫을 수 없게 함
        // (로그인 안 한 상태에서 뒤에 아무 데이터도 없는 빈 화면이 노출되는 걸 막기 위함)
        function openLoginModal(forced) {
            document.getElementById('loginErrorMsg').style.display = 'none';
            document.getElementById('loginCapsLockWarning').style.display = 'none';
            document.getElementById('loginCancelBtn').style.display = forced ? 'none' : 'inline-block';
            document.getElementById('loginModal').dataset.forced = forced ? 'true' : 'false';
            document.getElementById('loginModal').classList.add('active');
            setTimeout(() => document.getElementById('loginEmployeeIdInput').focus(), 50);
        }

        function closeLoginModal() {
            document.getElementById('loginModal').classList.remove('active');
            document.getElementById('loginCapsLockWarning').style.display = 'none';
        }

        // 비밀번호 입력칸에서 Caps Lock이 켜져 있으면 안내 문구를 보여줌
        function checkLoginCapsLock(e) {
            const warningEl = document.getElementById('loginCapsLockWarning');
            if (!warningEl) return;
            const isOn = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
            warningEl.style.display = isOn ? 'block' : 'none';
        }

        function toggleLoginPasswordVisibility() {
            const input = document.getElementById('loginPasswordInput');
            const btn = document.getElementById('loginPasswordToggleBtn');
            const willShow = input.type === 'password';
            input.type = willShow ? 'text' : 'password';
            btn.textContent = willShow ? '🙈' : '👀';
            btn.title = willShow ? '비밀번호 숨기기' : '비밀번호 보기';
        }

        async function attemptLogin() {
            const idInput = document.getElementById('loginEmployeeIdInput');
            const pwInput = document.getElementById('loginPasswordInput');
            const errEl = document.getElementById('loginErrorMsg');
            const btn = document.getElementById('loginSubmitBtn');

            const employeeId = idInput.value.trim();
            const password = pwInput.value;

            errEl.style.display = 'none';
            if (!employeeId) { errEl.textContent = '사번을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!password) { errEl.textContent = '비밀번호를 입력해주세요'; errEl.style.display = 'block'; return; }

            btn.disabled = true;
            btn.textContent = '확인 중...';

            try {
                const passwordHash = await sha256Hex(password + ':' + employeeId);
                // action=login이 아니라 action=load로 인증함: 등록된 사번+비밀번호가 정확히
                // 일치할 때만 통과되고, 없는 사번을 입력하면 그 자리에서 계정이 만들어지지
                // 않고 "등록되지 않은 사번입니다"로 거부됨 (회원가입을 먼저 해야만 로그인 가능)
                const url = GOOGLE_APPS_SCRIPT_URL + '?action=load'
                    + '&employeeId=' + encodeURIComponent(employeeId)
                    + '&passwordHash=' + encodeURIComponent(passwordHash)
                    + '&_=' + Date.now(); // 브라우저가 동일한 GET 요청 결과를 캐시해 예전 응답(예: "등록되지 않은 사번")을 계속 보여주는 걸 막기 위한 캐시버스터
                const res = await fetch(url, { cache: 'no-store' });
                const result = await res.json();

                if (!(result && result.status === 'error')) {
                    currentEmployeeId = employeeId;
                    currentPasswordHash = passwordHash;
                    editUnlocked = true;

                    closeLoginModal();
                    applyEditLockUI();

                    if (employeeId === ADMIN_EMPLOYEE_ID) {
                        enterAdminMode();
                    } else {
                        // 로그인에 성공한 지금에서야 처음으로 홈페이지 내용을 그림(아직 안 그려졌다면).
                        // 로그인 전에 화면/캐시에 있던 데이터는 이 계정 것이 아닐 수 있으므로,
                        // 방금 로그인 확인(action=load)에서 이미 받아온 이 계정의 데이터로 덮어씀
                        // (여기서 서버를 또 호출하면 느린 GAS 왕복을 로그인마다 불필요하게 두 번 하게 됨)
                        await initAppUI();
                        await loadAllFromServer(result);
                    }
                } else {
                    errEl.textContent = result.message || '로그인에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (e) {
                errEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
                errEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '🔓 로그인';
            }
        }

        // forced=true면(로그인 전 강제 모드) 취소해도 다시 로그인 모달로 돌아가야 빈 화면이 안 남음
        // 소속 select의 "직접입력"을 고르면 옆에 텍스트 입력칸을 보여주고, 아니면 숨김
        function toggleDepartmentCustomInput(which) {
            const select = document.getElementById(which + 'DepartmentInput');
            const customInput = document.getElementById(which + 'DepartmentCustomInput');
            const isCustom = select.value === '__custom__';
            customInput.style.display = isCustom ? 'block' : 'none';
            if (isCustom) customInput.focus();
        }

        // 저장된 소속 값을 select+직접입력 칸에 되돌려 채움. 목록에 없는 값(직접입력으로
        // 저장했던 값 등)이면 자동으로 "직접입력"을 선택하고 그 칸에 채워줌
        function setDepartmentFieldValue(which, value) {
            const select = document.getElementById(which + 'DepartmentInput');
            const customInput = document.getElementById(which + 'DepartmentCustomInput');
            const fixedValues = Array.from(select.options).map(o => o.value).filter(v => v !== '__custom__');

            if (value && !fixedValues.includes(value)) {
                select.value = '__custom__';
                customInput.value = value;
                customInput.style.display = 'block';
            } else {
                select.value = value || fixedValues[0];
                customInput.value = '';
                customInput.style.display = 'none';
            }
        }

        // select가 "직접입력"이면 옆 텍스트 칸의 값을, 아니면 select 값을 그대로 반환
        function getDepartmentValue(which) {
            const select = document.getElementById(which + 'DepartmentInput');
            if (select.value === '__custom__') {
                return document.getElementById(which + 'DepartmentCustomInput').value.trim();
            }
            return select.value;
        }

        function openSignupModal() {
            const wasForced = document.getElementById('loginModal').dataset.forced === 'true';
            closeLoginModal();
            document.getElementById('signupModal').dataset.returnForced = wasForced ? 'true' : 'false';

            document.getElementById('signupErrorMsg').style.display = 'none';
            document.getElementById('signupEmployeeIdInput').value = '';
            document.getElementById('signupNameInput').value = '';
            setDepartmentFieldValue('signup', '');
            document.getElementById('signupPasswordInput').value = '';
            document.getElementById('signupPasswordConfirmInput').value = '';

            document.getElementById('signupModal').classList.add('active');
            setTimeout(() => document.getElementById('signupEmployeeIdInput').focus(), 50);
        }

        function closeSignupModal() {
            document.getElementById('signupModal').classList.remove('active');
            // 로그인이 안 된 상태에서 취소한 거라면, 화면이 빈 채로 남지 않도록 로그인 모달로 돌아감
            if (!editUnlocked) {
                const wasForced = document.getElementById('signupModal').dataset.returnForced === 'true';
                openLoginModal(wasForced);
            }
        }

        // 비밀번호를 잊었을 때, 로그인 정보 없이 사번만으로 관리자에게 재설정을 요청함
        // (실제 초기화는 여전히 관리자만 할 수 있고, 이건 그 요청을 관리자 화면에 표시해줄 뿐임)
        function openPasswordResetRequestModal() {
            document.getElementById('passwordResetRequestEmployeeIdInput').value = '';
            const errEl = document.getElementById('passwordResetRequestErrorMsg');
            errEl.style.display = 'none';
            errEl.className = 'goal-status error';
            document.getElementById('passwordResetRequestModal').classList.add('active');
            // 이 모달을 열어도 로그인 모달의 입력창이 그대로 포커스를 쥐고 있어서, 옮겨주지
            // 않으면 타이핑이 뒤에 깔린(안 보이는) 로그인 입력창으로 들어감
            setTimeout(() => document.getElementById('passwordResetRequestEmployeeIdInput').focus(), 50);
        }

        async function submitPasswordResetRequest() {
            const input = document.getElementById('passwordResetRequestEmployeeIdInput');
            const errEl = document.getElementById('passwordResetRequestErrorMsg');
            const employeeId = input.value.trim();

            if (!EMPLOYEE_ID_PATTERN.test(employeeId)) {
                errEl.textContent = EMPLOYEE_ID_INVALID_MSG;
                errEl.style.display = 'block';
                return;
            }

            errEl.style.display = 'none';
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'requestPasswordReset', employeeId: employeeId })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    // 다른 확인 동작들과 달리 브라우저 기본 alert() 대신, 모달을 바로 닫지 않고
                    // 같은 자리에 성공 메시지를 보여준 뒤 사용자가 직접 닫게 함
                    errEl.textContent = '✅ 요청이 접수되었습니다. 관리자가 확인 후 비밀번호를 초기화해드립니다.';
                    errEl.className = 'goal-status success';
                    errEl.style.display = 'block';
                    input.value = '';
                } else {
                    errEl.textContent = data.message || '요청에 실패했습니다';
                    errEl.className = 'goal-status error';
                    errEl.style.display = 'block';
                }
            } catch (err) {
                console.error('비밀번호 재설정 요청 오류:', err);
                errEl.textContent = '서버 연결에 실패했습니다.';
                errEl.style.display = 'block';
            }
        }

        async function attemptSignup() {
            const idInput = document.getElementById('signupEmployeeIdInput');
            const nameInput = document.getElementById('signupNameInput');
            const pwInput = document.getElementById('signupPasswordInput');
            const pwConfirmInput = document.getElementById('signupPasswordConfirmInput');
            const errEl = document.getElementById('signupErrorMsg');
            const btn = document.getElementById('signupSubmitBtn');

            const employeeId = idInput.value.trim();
            const name = nameInput.value.trim();
            const department = getDepartmentValue('signup');
            const password = pwInput.value;
            const passwordConfirm = pwConfirmInput.value;

            errEl.style.display = 'none';
            if (!EMPLOYEE_ID_PATTERN.test(employeeId)) { errEl.textContent = EMPLOYEE_ID_INVALID_MSG; errEl.style.display = 'block'; return; }
            if (!name) { errEl.textContent = '이름을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!department) { errEl.textContent = '소속을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!password) { errEl.textContent = '비밀번호를 입력해주세요'; errEl.style.display = 'block'; return; }
            if (password !== passwordConfirm) { errEl.textContent = '비밀번호가 서로 일치하지 않습니다'; errEl.style.display = 'block'; return; }

            btn.disabled = true;
            btn.textContent = '가입 중...';

            try {
                const passwordHash = await sha256Hex(password + ':' + employeeId);
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'signup', employeeId, passwordHash, name, department })
                });
                const result = await res.json();

                if (result.status === 'success') {
                    currentEmployeeId = employeeId;
                    currentPasswordHash = passwordHash;
                    currentUserName = name;
                    currentUserDepartment = department;
                    localStorage.setItem('accountName', name);
                    localStorage.setItem('accountDepartment', department);
                    editUnlocked = true;

                    closeSignupModal(); // editUnlocked가 이미 true라 로그인 모달로 되돌아가지 않음
                    applyEditLockUI();

                    if (employeeId === ADMIN_EMPLOYEE_ID) {
                        enterAdminMode();
                    } else {
                        await initAppUI();
                        await loadAllFromServer();
                        showStatus('👋 회원가입이 완료되었습니다. 환영합니다!', 'success');
                    }
                } else {
                    errEl.textContent = result.message || '회원가입에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (e) {
                errEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
                errEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '📝 회원가입';
            }
        }

        // ===== 관리자 전용 화면 (계정 관리) =====
        let adminUserList = [];
        let adminTrashList = [];
        let adminDefaultDisabledFeatures = [];
        let adminSortKey = 'employeeId';
        let adminSortDir = 'desc';

        function enterAdminMode() {
            document.body.classList.add('admin-mode');
            loadAdminUserList();
        }

        async function loadAdminUserList() {
            const statusEl = document.getElementById('adminStatus');
            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminListUsers',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    adminUserList = Array.isArray(data.users) ? data.users : [];
                    adminTrashList = Array.isArray(data.trash) ? data.trash : [];
                    adminDefaultDisabledFeatures = Array.isArray(data.defaultDisabledFeatures) ? data.defaultDisabledFeatures : [];
                    renderAdminUserTable();
                    renderAdminTrashTable();
                    renderAdminDefaultFeatureChecklist();
                    statusEl.textContent = `✅ 총 ${adminUserList.length}개 계정 (휴지통 ${adminTrashList.length}개)`;
                    statusEl.className = 'ai-status success';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '목록을 불러오지 못했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('관리자 계정 목록 조회 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        function formatDisabledFeaturesSummary(disabledList) {
            const totalCount = Object.keys(FEATURE_LABELS).length;
            const disabledCount = Array.isArray(disabledList) ? disabledList.length : 0;
            if (disabledCount === 0) return '전체 사용';
            if (disabledCount >= totalCount) return '전체 제한';
            return '일부 제한';
        }

        function openAdminApiKeyViewModal(targetEmployeeId) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            if (!target || !target.aiApiKey) return;

            document.getElementById('adminApiKeyViewEmployeeId').value = targetEmployeeId;
            document.getElementById('adminApiKeyViewValue').value = target.aiApiKey;
            document.getElementById('adminApiKeyViewModal').classList.add('active');
        }

        function closeAdminApiKeyViewModal() {
            document.getElementById('adminApiKeyViewModal').classList.remove('active');
        }

        // 그룹별 체크박스 목록 HTML을 만듦. disabledList: 체크 해제(꺼짐) 상태로 표시할 키 배열
        function buildFeatureChecklistHtml(disabledList) {
            return FEATURE_GROUPS.map(group => `
                <div class="admin-feature-group">
                    <div class="admin-feature-group-title">${group.label}</div>
                    <div class="admin-feature-checklist">
                        ${Object.keys(group.features).map(key => `
                            <label class="admin-feature-checkbox-row">
                                <input type="checkbox" data-feature-key="${key}" ${disabledList.includes(key) ? '' : 'checked'}>
                                ${group.features[key]}
                            </label>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }

        // 체크 해제된(꺼진) 기능 키만 뽑아서 배열로 돌려줌
        function readDisabledFeaturesFromChecklist(containerId) {
            const checkboxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
            return Array.from(checkboxes).filter(cb => !cb.checked).map(cb => cb.dataset.featureKey);
        }

        function setAdminSort(key) {
            if (adminSortKey === key) {
                adminSortDir = adminSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                adminSortKey = key;
                adminSortDir = 'asc';
            }
            renderAdminUserTable();
        }

        function renderAdminUserTable() {
            const tbody = document.getElementById('adminUserTableBody');
            if (!tbody) return;

            const keyword = (document.getElementById('adminSearchInput').value || '').trim().toLowerCase();

            let list = adminUserList.filter(u => {
                if (!keyword) return true;
                return (u.employeeId || '').toLowerCase().includes(keyword)
                    || (u.name || '').toLowerCase().includes(keyword)
                    || (u.department || '').toLowerCase().includes(keyword);
            });

            list = list.slice().sort((a, b) => {
                let result;
                switch (adminSortKey) {
                    case 'recordCount':
                        result = (a.recordCount || 0) - (b.recordCount || 0);
                        break;
                    case 'disabledFeatures':
                        result = (a.disabledFeatures ? a.disabledFeatures.length : 0) - (b.disabledFeatures ? b.disabledFeatures.length : 0);
                        break;
                    case 'name':
                    case 'department':
                        result = (a[adminSortKey] || '').localeCompare(b[adminSortKey] || '', 'ko');
                        break;
                    default:
                        result = (a[adminSortKey] || '').localeCompare(b[adminSortKey] || '');
                }
                return adminSortDir === 'asc' ? result : -result;
            });

            // 관리자 계정은 정렬 기준과 무관하게 항상 맨 위에 고정 (Array.sort는 안정 정렬이라 나머지 순서는 그대로 유지됨)
            list.sort((a, b) => {
                if (a.employeeId === ADMIN_EMPLOYEE_ID) return -1;
                if (b.employeeId === ADMIN_EMPLOYEE_ID) return 1;
                return 0;
            });

            document.querySelectorAll('.admin-sort-indicator').forEach(el => {
                el.textContent = el.dataset.sortKey === adminSortKey ? (adminSortDir === 'asc' ? ' ▲' : ' ▼') : '';
            });

            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999; padding:20px;">계정이 없습니다</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(u => `
                <tr>
                    <td>${u.disabled ? '🚫 ' : ''}${escapeHtml(u.employeeId)}</td>
                    <td>${u.isTeamLead ? '👔 ' : ''}${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.department)}</td>
                    <td>${u.recordCount}</td>
                    <td>${escapeHtml(formatDisabledFeaturesSummary(u.disabledFeatures))}</td>
                    <td>${u.aiApiKey ? `
                        <span>입력됨</span>
                        <button type="button" class="admin-action-btn" style="padding:3px 7px; font-size:11px;" onclick="openAdminApiKeyViewModal('${u.employeeId}')">확인</button>
                        ${u.duplicateApiKey ? '<div class="admin-apikey-dup">⚠️ 다른 계정과 중복</div>' : ''}
                    ` : '<span style="color:#999;">미입력</span>'}</td>
                    <td>${escapeHtml(u.lastSaved)}</td>
                    <td class="admin-actions-cell">${u.employeeId === ADMIN_EMPLOYEE_ID ? '<span style="color:#999;">관리자 계정</span>' : `
                        <button class="admin-action-btn" onclick="openAdminEditUserModal('${u.employeeId}')">✏️ 정보수정</button>
                        <button class="admin-action-btn" onclick="openAdminFeatureModal('${u.employeeId}')">🔧 기능 설정</button>
                        <button class="admin-action-btn${u.isTeamLead ? ' danger' : ''}" onclick="adminToggleTeamLead('${u.employeeId}', ${u.isTeamLead ? 'false' : 'true'})">${u.isTeamLead ? '👔 팀장 해제' : '👔 팀장 지정'}</button>
                        <button class="admin-action-btn${u.passwordResetRequestedAt ? ' danger' : ''}" onclick="adminResetPassword('${u.employeeId}')">🔑 비밀번호 초기화${u.passwordResetRequestedAt ? ' 🔴요청됨' : ''}</button>
                        <button class="admin-action-btn${u.disabled ? '' : ' danger'}" onclick="adminToggleUserDisabled('${u.employeeId}', ${u.disabled ? 'false' : 'true'})">${u.disabled ? '✅ 활성화' : '🚫 비활성화'}</button>
                        <button class="admin-action-btn danger" onclick="adminDeleteUser('${u.employeeId}')">🗑️ 삭제</button>`}
                    </td>
                </tr>
            `).join('');
        }

        function renderAdminDefaultFeatureChecklist() {
            const container = document.getElementById('adminDefaultFeatureChecklist');
            if (container) container.innerHTML = buildFeatureChecklistHtml(adminDefaultDisabledFeatures);
        }

        async function saveAdminDefaultFeatures() {
            const disabled = readDisabledFeaturesFromChecklist('adminDefaultFeatureChecklist');
            const statusEl = document.getElementById('adminDefaultFeatureStatus');
            statusEl.textContent = '☁️ 저장하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminSetDefaultFeatures',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        disabledFeatures: disabled
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    adminDefaultDisabledFeatures = disabled;
                    statusEl.textContent = '✅ 기본값이 저장되었습니다. 앞으로 새로 가입하는 계정부터 적용됩니다.';
                    statusEl.className = 'ai-status success';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '저장에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('관리자 기본값 저장 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        function adminDeleteUser(targetEmployeeId) {
            if (targetEmployeeId === ADMIN_EMPLOYEE_ID) {
                alert('관리자 계정 자신은 삭제할 수 없습니다.');
                return;
            }
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            confirmModal(`${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 삭제할까요?\n휴지통으로 이동되며, 7일 안에는 복구할 수 있고 그 이후 자동으로 완전히 삭제됩니다.`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 휴지통으로 옮기는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminDeleteUser',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = '✅ 휴지통으로 이동되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '삭제에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 삭제 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        function renderAdminTrashTable() {
            const tbody = document.getElementById('adminTrashTableBody');
            if (!tbody) return;

            if (adminTrashList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999; padding:20px;">휴지통이 비어있습니다</td></tr>';
                return;
            }

            tbody.innerHTML = adminTrashList.map(u => `
                <tr>
                    <td>${escapeHtml(u.employeeId)}</td>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.department)}</td>
                    <td>${u.recordCount}</td>
                    <td>${escapeHtml(formatDisabledFeaturesSummary(u.disabledFeatures))}</td>
                    <td>${escapeHtml(formatDateTimeKo(u.deletedAt))}</td>
                    <td>${u.daysRemaining}일 후</td>
                    <td class="admin-actions-cell">
                        <button class="admin-action-btn" onclick="adminRestoreUser('${u.employeeId}')">♻️ 복구</button>
                        <button class="admin-action-btn danger" onclick="adminPurgeUser('${u.employeeId}')">💀 즉시 삭제</button>
                    </td>
                </tr>
            `).join('');
        }

        // [팀 보고] 내 제출 내역에서 제출시각 하나로 날짜+시간을 함께 보여주기 위한 전용 포맷 (yyyy.mm.dd. PM HH:MM)
        function formatTeamReportSubmittedAt(isoString) {
            if (!isoString) return '';
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return isoString;
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const ampm = d.getHours() < 12 ? 'AM' : 'PM';
            const hh = String(d.getHours() % 12 || 12).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${yyyy}.${mm}.${dd}. ${ampm} ${hh}:${min}`;
        }

        // 서버가 ISO 문자열(예: 2026-08-29T12:34:56.000Z)로 주는 삭제시각을 보기 편하게 표시
        function formatDateTimeKo(isoString) {
            if (!isoString) return '';
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return isoString;
            return d.toLocaleString('ko-KR');
        }

        function adminRestoreUser(targetEmployeeId) {
            const target = adminTrashList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            confirmModal(`${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 복구할까요?`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 복구하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminRestoreUser',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = '✅ 복구되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '복구에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 복구 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        function adminPurgeUser(targetEmployeeId) {
            const target = adminTrashList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            confirmModal(`${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 지금 완전히 삭제할까요?\n\n보관기한(7일)을 기다리지 않고 즉시 삭제되며, 이 작업은 절대 되돌릴 수 없습니다.`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 완전히 삭제하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminPurgeUser',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = '✅ 완전히 삭제되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '삭제에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 즉시 삭제 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        function adminToggleUserDisabled(targetEmployeeId, nextDisabled) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            const confirmMsg = nextDisabled
                ? `${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 비활성화할까요? 데이터는 그대로 남지만 로그인이 막힙니다.`
                : `${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 다시 활성화할까요?`;
            confirmModal(confirmMsg, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = nextDisabled ? '☁️ 비활성화하는 중...' : '☁️ 활성화하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminSetUserDisabled',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId,
                            disabled: nextDisabled
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = nextDisabled ? '✅ 비활성화되었습니다' : '✅ 활성화되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '처리에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 활성화/비활성화 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        // 팀장 권한을 켜면 [팀 보고] 탭에서 그 계정이 팀원들의 제출 현황을 모아볼 수 있게 됨
        function adminToggleTeamLead(targetEmployeeId, nextIsTeamLead) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            const confirmMsg = nextIsTeamLead
                ? `${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 팀장으로 지정할까요? [팀 보고] 탭에서 팀원들의 제출 내용을 모아볼 수 있게 됩니다.`
                : `${targetName || targetEmployeeId}(${targetEmployeeId}) 계정의 팀장 권한을 해제할까요?`;
            confirmModal(confirmMsg, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 처리하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminSetTeamLead',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId,
                            isTeamLead: nextIsTeamLead
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = nextIsTeamLead ? '✅ 팀장으로 지정되었습니다' : '✅ 팀장 권한이 해제되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '처리에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 팀장 지정/해제 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        function adminResetPassword(targetEmployeeId) {
            // 새 비밀번호를 따로 입력받지 않고, 그 사람의 사번 자체를 임시 비밀번호로 사용함
            // (초기화 후 본인이 로그인해서 비밀번호를 바꾸도록 안내하면 됨)
            confirmModal(`${targetEmployeeId} 계정의 비밀번호를 사번(${targetEmployeeId})으로 초기화할까요?`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 비밀번호를 초기화하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const newPasswordHash = await sha256Hex(targetEmployeeId + ':' + targetEmployeeId);
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminResetPassword',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId,
                            newPasswordHash: newPasswordHash
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = `✅ ${targetEmployeeId} 계정의 비밀번호가 사번(${targetEmployeeId})으로 초기화되었습니다`;
                        statusEl.className = 'ai-status success';
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '비밀번호 초기화에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 비밀번호 초기화 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        let adminEditOriginalEmployeeId = '';

        function openAdminEditUserModal(targetEmployeeId) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            if (!target) return;

            adminEditOriginalEmployeeId = targetEmployeeId;
            document.getElementById('adminEditEmployeeIdInput').value = targetEmployeeId;
            document.getElementById('adminEditNameInput').value = target.name || '';
            setDepartmentFieldValue('adminEdit', target.department || '');
            document.getElementById('adminEditErrorMsg').style.display = 'none';
            document.getElementById('adminEditUserModal').classList.add('active');
        }

        function closeAdminEditUserModal() {
            document.getElementById('adminEditUserModal').classList.remove('active');
        }

        // 사번 변경은 본인 스스로는 못 하고 관리자만 가능함. 사번이 바뀐 경우 먼저
        // adminChangeEmployeeId로 사번부터 바꾸고, 그 다음 새 사번을 대상으로 이름/소속을 저장함
        async function saveAdminUserEdit() {
            const idInput = document.getElementById('adminEditEmployeeIdInput');
            const nameInput = document.getElementById('adminEditNameInput');
            const errEl = document.getElementById('adminEditErrorMsg');
            const newEmployeeId = idInput.value.trim();
            const name = nameInput.value.trim();
            const department = getDepartmentValue('adminEdit');

            errEl.style.display = 'none';
            if (!EMPLOYEE_ID_PATTERN.test(newEmployeeId)) { errEl.textContent = EMPLOYEE_ID_INVALID_MSG; errEl.style.display = 'block'; return; }
            if (!name) { errEl.textContent = '이름을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!department) { errEl.textContent = '소속을 입력해주세요'; errEl.style.display = 'block'; return; }

            const statusEl = document.getElementById('adminStatus');
            statusEl.textContent = '☁️ 저장하는 중...';
            statusEl.className = 'ai-status';

            try {
                let workingEmployeeId = adminEditOriginalEmployeeId;

                if (newEmployeeId !== adminEditOriginalEmployeeId) {
                    const idRes = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminChangeEmployeeId',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: adminEditOriginalEmployeeId,
                            newEmployeeId: newEmployeeId
                        })
                    });
                    const idData = await idRes.json();
                    if (idData.status !== 'success') {
                        errEl.textContent = idData.message || '사번 변경에 실패했습니다';
                        errEl.style.display = 'block';
                        return;
                    }
                    workingEmployeeId = newEmployeeId;
                    // 사번 변경은 이미 서버에 반영됐으니, 아래 이름/소속 저장이 실패해서 다시 시도하더라도
                    // 이 사번으로 또 바꾸려 하지 않도록(예전 사번은 이제 존재하지 않아 실패함) 갱신해둠
                    adminEditOriginalEmployeeId = newEmployeeId;
                }

                const infoRes = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminUpdateUserInfo',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        targetEmployeeId: workingEmployeeId,
                        name: name,
                        department: department
                    })
                });
                const infoData = await infoRes.json();

                if (infoData.status === 'success') {
                    closeAdminEditUserModal();
                    statusEl.textContent = `✅ ${workingEmployeeId} 계정 정보가 수정되었습니다`;
                    statusEl.className = 'ai-status success';
                    await loadAdminUserList();
                } else {
                    errEl.textContent = infoData.message || '저장에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (err) {
                console.error('관리자 계정정보 수정 오류:', err);
                errEl.textContent = '서버 연결에 실패했습니다.';
                errEl.style.display = 'block';
            }
        }

        let adminFeatureTargetEmployeeId = '';

        function openAdminFeatureModal(targetEmployeeId) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            if (!target) return;

            adminFeatureTargetEmployeeId = targetEmployeeId;
            const disabled = Array.isArray(target.disabledFeatures) ? target.disabledFeatures : [];

            const listEl = document.getElementById('adminFeatureChecklist');
            listEl.innerHTML = buildFeatureChecklistHtml(disabled);

            document.getElementById('adminFeatureErrorMsg').style.display = 'none';
            document.getElementById('adminFeatureModal').classList.add('active');
        }

        function closeAdminFeatureModal() {
            document.getElementById('adminFeatureModal').classList.remove('active');
        }

        async function saveAdminUserFeatures() {
            const errEl = document.getElementById('adminFeatureErrorMsg');
            const disabledFeaturesForTarget = readDisabledFeaturesFromChecklist('adminFeatureChecklist');

            errEl.style.display = 'none';

            const statusEl = document.getElementById('adminStatus');
            statusEl.textContent = '☁️ 저장하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminUpdateUserFeatures',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        targetEmployeeId: adminFeatureTargetEmployeeId,
                        disabledFeatures: disabledFeaturesForTarget
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    closeAdminFeatureModal();
                    statusEl.textContent = `✅ ${adminFeatureTargetEmployeeId} 계정의 기능 설정이 저장되었습니다`;
                    statusEl.className = 'ai-status success';
                    await loadAdminUserList();
                } else {
                    errEl.textContent = data.message || '저장에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (err) {
                console.error('관리자 기능 설정 오류:', err);
                errEl.textContent = '서버 연결에 실패했습니다.';
                errEl.style.display = 'block';
            }
        }

        function openAccountModal() {
            if (!editUnlocked || !currentEmployeeId) return;
            document.getElementById('accountErrorMsg').style.display = 'none';
            document.getElementById('accountSuccessMsg').style.display = 'none';
            document.getElementById('accountEmployeeIdInput').value = currentEmployeeId;
            document.getElementById('accountNameInput').value = currentUserName;
            setDepartmentFieldValue('account', currentUserDepartment);
            document.getElementById('accountNewPasswordInput').value = '';
            document.getElementById('accountNewPasswordConfirmInput').value = '';
            document.getElementById('accountModal').classList.add('active');
        }

        function closeAccountModal() {
            document.getElementById('accountModal').classList.remove('active');
        }

        // 사번은 본인이 스스로 바꿀 수 없음(변경은 관리자 화면에서만 가능). 비밀번호 변경은
        // 서버 인증이 필요해 별도 액션으로 처리하고, 이름/소속은 별도 인증 없이 일반 동기화
        // 채널(getFullState)에 실어 저장함
        async function saveAccountChanges() {
            const nameInput = document.getElementById('accountNameInput');
            const newPwInput = document.getElementById('accountNewPasswordInput');
            const newPwConfirmInput = document.getElementById('accountNewPasswordConfirmInput');
            const errEl = document.getElementById('accountErrorMsg');
            const okEl = document.getElementById('accountSuccessMsg');
            const btn = document.getElementById('accountSaveBtn');

            const newName = nameInput.value.trim();
            const newDepartment = getDepartmentValue('account');
            const newPassword = newPwInput.value;
            const newPasswordConfirm = newPwConfirmInput.value;

            errEl.style.display = 'none';
            okEl.style.display = 'none';

            if (!newName) { errEl.textContent = '이름을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!newDepartment) { errEl.textContent = '소속을 입력해주세요'; errEl.style.display = 'block'; return; }
            if ((newPassword || newPasswordConfirm) && newPassword !== newPasswordConfirm) {
                errEl.textContent = '새 비밀번호가 서로 일치하지 않습니다'; errEl.style.display = 'block'; return;
            }

            btn.disabled = true;
            btn.textContent = '저장 중...';

            try {
                if (newPassword) {
                    const newPasswordHash = await sha256Hex(newPassword + ':' + currentEmployeeId);
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'changePassword',
                            employeeId: currentEmployeeId,
                            oldPasswordHash: currentPasswordHash,
                            newPasswordHash
                        })
                    });
                    const result = await res.json();
                    if (result.status !== 'success') {
                        errEl.textContent = result.message || '비밀번호 변경에 실패했습니다';
                        errEl.style.display = 'block';
                        return;
                    }
                    currentPasswordHash = newPasswordHash;
                }

                currentUserName = newName;
                currentUserDepartment = newDepartment;
                localStorage.setItem('accountName', currentUserName);
                localStorage.setItem('accountDepartment', currentUserDepartment);
                queueSync();

                applyEditLockUI();
                newPwInput.value = '';
                newPwConfirmInput.value = '';
                okEl.textContent = '저장되었습니다';
                okEl.style.display = 'block';
            } catch (e) {
                errEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
                errEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '💾 저장';
            }
        }

        // getFullState()에 실려서 서버로 동기화되는, 즉 "이 계정 소유"인 로컬 캐시 키 전부.
        // 로그아웃할 때 이걸 지우지 않으면, 같은 브라우저에서 다른 사번으로 로그인했을 때
        // 서버 응답을 받기 전 잠깐(또는 서버 쪽 문제로 응답이 비정상일 때는 계속) 이전 계정의
        // 데이터가 화면에 남아있는 것처럼 보일 수 있음
        const ACCOUNT_SCOPED_STORAGE_KEYS = [
            'activityRecords', 'calendarEvents', 'activityCategories',
            'categoryColors', 'categoryBoxHeights', 'dateCategoryBoxHeights',
            'hiddenCategoriesByDate', 'dateCategoryOrder', 'collapsedUpcomingCardIds',
            'tabOrder', 'disabledTabIds', 'personalAiApiKey', 'disabledFeatures', 'freeNotes', 'todoItems', 'todoNotes', 'aiTemplate',
            'savingsProjects', 'trendSubject', 'trendSpec', 'maintenanceSchedule',
            'accountName', 'accountDepartment'
        ];

        function logout() {
            confirmModal('로그아웃할까요? 다시 사번과 비밀번호를 입력해야 합니다.', () => {
                localStorage.removeItem('employeeId');
                localStorage.removeItem('passwordHash');
                ACCOUNT_SCOPED_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
                // 다음 사람(또는 다음 로그인)에게 이전 계정 데이터가 남아있지 않도록 전체를 새로고침함
                location.reload();
            });
        }

        // 편집이 필요한 동작(추가/수정/삭제) 시작 지점마다 이 함수로 확인.
        // 로그인 안 되어 있으면 로그인 모달을 띄우고 false를 반환해서 호출부가 하던 일을 멈추게 함
        function checkEditPermission() {
            if (editUnlocked) return true;
            openLoginModal(false);
            return false;
        }

        // 현재 로그인 상태를 화면 전체(사용자 표시 + 각종 입력칸의 읽기전용 여부)에 반영
        function applyEditLockUI() {
            const userLabel = document.getElementById('currentUserLabel');
            const logoutBtn = document.getElementById('logoutBtn');

            if (editUnlocked && currentEmployeeId) {
                if (userLabel) {
                    userLabel.textContent = '👤 개인 정보 수정';
                    userLabel.style.display = 'inline-block';
                }
                if (logoutBtn) logoutBtn.style.display = 'inline-block';
            } else {
                if (userLabel) userLabel.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'none';
            }

            document.body.classList.toggle('edit-locked', !editUnlocked);

            const notesTextarea = document.getElementById('notesTextarea');
            const aiTemplateTextarea = document.getElementById('aiTemplateTextarea');
            if (notesTextarea) notesTextarea.readOnly = !editUnlocked;
            if (aiTemplateTextarea) aiTemplateTextarea.readOnly = !editUnlocked;

            // 활동기록 카테고리 textarea들은 날짜를 선택할 때마다 새로 그려지므로, 그때도 이 상태를 반영해야 함
            document.querySelectorAll('.category-record textarea').forEach(ta => {
                ta.readOnly = !editUnlocked;
            });

            applyFormLockState();
        }
        
        // 잠긴 상태에서는 화면 전체의 버튼/입력창/날짜칸 클릭을 여기서 한 번에 차단함.
        // (하나하나 함수마다 손대는 대신, 새 버튼이 추가되더라도 자동으로 같이 잠기도록 캡처 단계에서 가로챔)
        // 예외: 로그인 모달 내부, 잠금 버튼 자체, 탭 전환(탭 이동 자체는 "구경"에 해당하므로 허용)
        // 열려 있는 모달을 ESC 키로만 닫을 수 있게 함 (바깥 배경 클릭으로는 닫히지 않음).
        // 모달마다 따로 붙이지 않고 한 곳에서 처리해서, 나중에 모달이 추가돼도 자동으로 동작함
        function setupModalDismissHandlers() {
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;

                // confirmActionModal은 다른 모달(일정/절감과제 삭제 등) 위에 겹쳐서 뜰 수 있는데,
                // 이때 querySelector는 DOM에 먼저 나오는(밑에 깔린) 모달을 집어올 수 있으므로
                // 항상 confirmActionModal이 열려 있으면 그것부터(맨 위에 있는 것부터) 닫음
                const confirmModalEl = document.getElementById('confirmActionModal');
                const openModal = confirmModalEl.classList.contains('active')
                    ? confirmModalEl
                    : document.querySelector('.modal-overlay.active');
                if (!openModal) return;

                e.preventDefault();
                closeModalById(openModal.id);
            });
        }

        function closeModalById(id) {
            if (id === 'loginModal') {
                // 아직 로그인 전(강제 모드)이면 ESC로 닫지 못하게 함
                if (document.getElementById('loginModal').dataset.forced === 'true') return;
                closeLoginModal();
            }
            else if (id === 'eventModal') closeEventModal();
            else if (id === 'projectModal') closeProjectModal();
            else if (id === 'maintenanceModal') closeMaintenanceModal();
            else if (id === 'deleteTeamReportModal') closeDeleteTeamReportModal();
            else if (id === 'signupModal') closeSignupModal();
            else if (id === 'adminEditUserModal') closeAdminEditUserModal();
            else if (id === 'confirmActionModal') closeConfirmActionModal();
            else document.getElementById(id).classList.remove('active');
        }

        // 삭제/로그아웃처럼 되돌리기 어려운 동작을 브라우저 기본 confirm() 대신 앱 스타일 모달로
        // 확인받음. confirm()과 달리 결과를 바로 리턴하지 못하고 비동기(모달 클릭 이후)로 진행되므로,
        // 호출부는 "if (!confirm(...)) return;" 대신 원래 하려던 동작을 callback 안에 넣는 식으로 씀
        let confirmActionCallback = null;

        function confirmModal(message, callback) {
            document.getElementById('confirmActionMessage').textContent = message;
            confirmActionCallback = callback;
            document.getElementById('confirmActionModal').classList.add('active');
        }

        function confirmActionModalConfirm() {
            const callback = confirmActionCallback;
            confirmActionCallback = null;
            document.getElementById('confirmActionModal').classList.remove('active');
            if (typeof callback === 'function') callback();
        }

        function closeConfirmActionModal() {
            confirmActionCallback = null; // 취소/ESC로 닫을 땐 예정돼있던 동작을 실행하지 않도록 콜백을 버림
            document.getElementById('confirmActionModal').classList.remove('active');
        }

        function setupGlobalEditLockInterceptor() {
            document.addEventListener('click', function (e) {
                if (editUnlocked) return;
                if (e.target.closest('#loginModal')) return;
                if (e.target.closest('#signupModal')) return;
                if (e.target.closest('#passwordResetRequestModal')) return;
                if (e.target.closest('#logoutBtn')) return;
                if (e.target.closest('#tabsContainer')) return;

                const blocked = e.target.closest(
                    'button, [onclick], select, input:not(#loginPasswordInput):not(#loginEmployeeIdInput), .day, .upcoming-card, .upcoming-card-mini, .hidden-category-chip, .result-item.clickable, .color-swatch'
                );
                if (blocked) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    openLoginModal(false);
                }
            }, true);
        }

        // input/select 요소는 타입에 따라 readOnly가 먹히지 않는 것들(색상/체크박스/select 등)이 있어서
        // 타입별로 readOnly 또는 disabled를 정확히 나눠서 적용함. 텍스트를 선택해서 복사하는 건 여전히
        // 가능하게 하려고, 되도록 disabled보다는 readOnly를 우선 사용함(disabled는 클릭/포커스 자체가 막혀서
        // 내용을 보거나 복사하기도 불편해짐)
        function applyFormLockState() {
            document.querySelectorAll('input, select').forEach(el => {
                if (el.closest('#loginModal') || el.closest('#signupModal') || el.closest('#passwordResetRequestModal')) return; // 로그인/회원가입/비밀번호 재설정 요청 입력창은 항상 사용 가능해야 함

                const noReadonlyEffect = ['color', 'checkbox', 'radio', 'range'];
                if (el.tagName === 'SELECT' || noReadonlyEffect.includes(el.type)) {
                    el.disabled = !editUnlocked;
                } else {
                    el.readOnly = !editUnlocked;
                }
            });

            // 해야 할 일의 메모 textarea는 목록이 다시 그려질 때마다 호출되므로 여기서 같이 반영함
            document.querySelectorAll('.todo-memo-input').forEach(ta => {
                ta.readOnly = !editUnlocked;
            });
        }
        
        window.addEventListener('load', init);
        
        // PWA: 서비스워커 등록 (홈화면 설치 가능하게 해주고, 정적 파일 캐싱으로 로딩도 빨라짐)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch((err) => {
                    console.error('서비스워커 등록 실패:', err);
                });
            });
        }

