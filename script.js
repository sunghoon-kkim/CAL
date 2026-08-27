const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzXNGaeQEkzn8gLCSbtLbUCt8f2VEX236QOkkck-Pl6QatnYuLMTax4L1F5-d7-MSOg/exec";
        
        const COLOR_PALETTE = [
            '#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1', 
            '#54a0ff', '#5f27cd', '#ee5a6f', '#576574'
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
        let categories = ['수처리', '냉동기', '보일러'];
        let categoryColors = {}; // { "수처리": "#ff6b6b" }
        let categoryBoxHeights = {}; // { "수처리": 180 } - 카테고리별 기본값
        let dateCategoryBoxHeights = {}; // { "2026-08-26": { "수처리": 300 } } - 날짜별 개별 지정값 (있으면 기본값보다 우선)
        let hiddenCategoriesByDate = {}; // { "2026-08-26": ["보일러"] } - 그 날짜에 안 쓰는 카테고리 숨김 목록
        let dateCategoryOrder = {}; // { "2026-08-26": ["보일러","수처리","냉동기"] } - 그 날짜에서만 적용되는 카테고리 박스 순서
        let categoryCollapseOverride = {}; // { "2026-08-25::보일러": true/false } - 사용자가 직접 접기/펼치기를 클릭해서 자동 규칙을 덮어쓴 경우 (세션 동안만 유지)
        let draggedCategoryId = null; // 드래그 중인 카테고리 박스
        let notesContent = '';
        let selectedCategoriesForQuery = new Set();
        let queryStartDate = null;
        let queryEndDate = null;
        let editingEventId = null;
        let selectedColor = COLOR_PALETTE[0];
        
        // 탭 관리
        const TAB_LABELS = {
            calendar: '📅 달력 & 활동기록',
            category: '📊 카테고리 관리',
            query: '🔍 카테고리별 조회',
            notes: '📝 메모장',
            ai: '🤖 AI 요약'
        };
        let tabOrder = ['calendar', 'category', 'query', 'notes', 'ai'];
        let activeTabId = 'calendar';
        let draggedTabId = null;
        
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
        
        async function init() {
            // 1) 즉시 표시를 위해 로컬 캐시 먼저 로드
            loadRecords();
            loadEvents();
            loadCategories();
            loadCategoryColors();
            loadCategoryBoxHeights();
            loadHiddenCategories();
            loadTabOrder();
            notesContent = localStorage.getItem('freeNotes') || '';
            aiTemplateContent = localStorage.getItem('aiTemplate') || DEFAULT_AI_TEMPLATE;
            
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
            
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            document.getElementById('startDate').valueAsDate = firstDay;
            document.getElementById('endDate').valueAsDate = lastDay;
            document.getElementById('aiStartDate').valueAsDate = firstDay;
            document.getElementById('aiEndDate').valueAsDate = lastDay;
            document.getElementById('dailySummaryDate').valueAsDate = today;
            document.getElementById('goalRefStartDate').valueAsDate = firstDay;
            document.getElementById('goalRefEndDate').valueAsDate = today;
            
            // 2) Google Sheets에서 최신 데이터 불러와 덮어쓰기 (있으면)
            await loadAllFromServer();
        }
        
        // ===== 저장/로드 (로컬 캐시) =====
        function loadRecords() {
            const stored = localStorage.getItem('activityRecords');
            records = stored ? JSON.parse(stored) : {};
        }
        
        function loadEvents() {
            const stored = localStorage.getItem('calendarEvents');
            events = stored ? JSON.parse(stored) : [];
        }
        
        function loadCategories() {
            const stored = localStorage.getItem('activityCategories');
            if (stored) categories = JSON.parse(stored);
        }
        
        function loadCategoryColors() {
            const stored = localStorage.getItem('categoryColors');
            categoryColors = stored ? JSON.parse(stored) : {};
            
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
            categoryBoxHeights = stored ? JSON.parse(stored) : {};
            
            const storedDate = localStorage.getItem('dateCategoryBoxHeights');
            dateCategoryBoxHeights = storedDate ? JSON.parse(storedDate) : {};
        }
        
        function loadHiddenCategories() {
            const stored = localStorage.getItem('hiddenCategoriesByDate');
            hiddenCategoriesByDate = stored ? JSON.parse(stored) : {};
            
            const storedOrder = localStorage.getItem('dateCategoryOrder');
            dateCategoryOrder = storedOrder ? JSON.parse(storedOrder) : {};
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
                tabOrder = reconcileTabOrder(JSON.parse(stored));
            }
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
        
        // ===== Google Sheets 동기화 =====
        function getFullState() {
            return {
                records,
                events,
                categories,
                categoryColors,
                categoryBoxHeights,
                dateCategoryBoxHeights,
                hiddenCategoriesByDate,
                dateCategoryOrder,
                tabOrder,
                notes: notesContent,
                aiTemplate: aiTemplateContent
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
            localStorage.setItem('tabOrder', JSON.stringify(tabOrder));
            localStorage.setItem('freeNotes', notesContent);
            localStorage.setItem('aiTemplate', aiTemplateContent);
        }
        
        async function loadAllFromServer() {
            showSyncStatus('☁️ 불러오는 중...', 'syncing');
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL + '?action=load');
                if (!res.ok) throw new Error('응답 오류');
                const data = await res.json();
                
                if (data && typeof data === 'object' && (data.records || data.events || data.categories)) {
                    records = data.records || {};
                    events = data.events || [];
                    categories = (data.categories && data.categories.length) ? data.categories : categories;
                    categoryColors = data.categoryColors || categoryColors;
                    categoryBoxHeights = data.categoryBoxHeights || categoryBoxHeights;
                    dateCategoryBoxHeights = data.dateCategoryBoxHeights || dateCategoryBoxHeights;
                    hiddenCategoriesByDate = data.hiddenCategoriesByDate || hiddenCategoriesByDate;
                    dateCategoryOrder = data.dateCategoryOrder || dateCategoryOrder;
                    if (data.tabOrder && data.tabOrder.length) tabOrder = reconcileTabOrder(data.tabOrder);
                    notesContent = (typeof data.notes === 'string') ? data.notes : notesContent;
                    aiTemplateContent = (typeof data.aiTemplate === 'string' && data.aiTemplate) ? data.aiTemplate : aiTemplateContent;
                    
                    cacheAllToLocalStorage();
                    
                    renderTabs();
                    renderCategories();
                    renderCategorySelector();
                    renderCalendar();
                    applyNotesContent();
                    applyAITemplate();
                    if (selectedDate) renderRecordForm();
                }
                
                showSyncStatus('☁️ 동기화됨', 'ok');
            } catch (err) {
                console.error('서버에서 불러오기 실패:', err);
                showSyncStatus('⚠️ 서버 연결 실패 (로컬 데이터 사용 중)', 'error');
            }
        }
        
        let syncTimeout = null;
        function queueSync() {
            clearTimeout(syncTimeout);
            showSyncStatus('☁️ 저장 대기 중...', 'syncing');
            syncTimeout = setTimeout(syncToServer, 800);
        }
        
        async function syncToServer() {
            showSyncStatus('☁️ 저장 중...', 'syncing');
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify(getFullState())
                });
                if (!res.ok) throw new Error('응답 오류');
                showSyncStatus('☁️ 저장됨', 'ok');
            } catch (err) {
                console.error('서버 저장 실패:', err);
                showSyncStatus('⚠️ 저장 실패 (로컬에는 저장됨)', 'error');
            }
        }
        
        function showSyncStatus(text, state) {
            const el = document.getElementById('syncStatus');
            if (!el) return;
            el.textContent = text;
            el.className = 'sync-status ' + (state || '');
        }
        
        // ===== 탭 렌더링 & 전환 =====
        function renderTabs() {
            const container = document.getElementById('tabsContainer');
            container.innerHTML = tabOrder.map(tabId => {
                const activeClass = tabId === activeTabId ? ' active' : '';
                return `<div class="tab${activeClass}" data-tab-id="${tabId}" draggable="true">${TAB_LABELS[tabId]}</div>`;
            }).join('');
            
            container.querySelectorAll('.tab').forEach(tabEl => {
                const tabId = tabEl.dataset.tabId;
                
                tabEl.addEventListener('click', () => switchTab(tabId));
                
                tabEl.addEventListener('dragstart', (e) => {
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
                });
            });
        }
        
        function switchTab(tabName) {
            activeTabId = tabName;
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            document.querySelectorAll('.tab').forEach(el => {
                el.classList.toggle('active', el.dataset.tabId === tabName);
            });
        }
        
        // ===== 카테고리 관리 =====
        function addCategory() {
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
            if (!confirm(`'${name}' 카테고리를 삭제하시겠습니까?`)) return;
            
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
        }
        
        function changeCategoryColor(name, color) {
            categoryColors[name] = color;
            saveCategoryColorsToStorage();
            if (selectedDate) renderRecordForm();
        }
        
        function renderCategories() {
            const container = document.getElementById('categoriesList');
            container.innerHTML = categories.map(category => `
                <div class="category-tag">
                    <span class="category-tag-name">${category}</span>
                    <div class="category-tag-actions">
                        <input type="color" class="category-color-input" value="${categoryColors[category] || '#667eea'}" 
                            onchange="changeCategoryColor('${category}', this.value)" title="박스 색상 설정">
                        <button class="category-tag-delete" onclick="deleteCategory('${category}')">✕</button>
                    </div>
                </div>
            `).join('');
        }
        
        function renderCategorySelector() {
            const container = document.getElementById('categorySelector');
            container.innerHTML = categories.map(category => `
                <button class="category-select-btn" data-category="${category}" onclick="selectCategoryForQuery('${category}')">${category}</button>
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
            
            resultsEl.innerHTML = results.map(r => {
                const dateObj = new Date(r.date);
                const dateLabel = dateObj.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
                const snippet = highlightKeyword(escapeHtml(r.content), keyword);
                
                return `
                    <div class="result-item clickable" onclick="jumpToSearchResult('${r.date}')">
                        <div class="result-date">📅 ${dateLabel} <span class="search-result-tag">[${r.tag}]</span></div>
                        <div class="result-content">${snippet}</div>
                    </div>
                `;
            }).join('');
        }
        
        // 검색 결과 안에서 키워드 부분만 강조 표시 (내용은 이미 escapeHtml 처리된 상태로 전달됨)
        function highlightKeyword(escapedText, keyword) {
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        
        function queryRecords() {
            if (selectedCategoriesForQuery.size === 0) {
                document.getElementById('queryResults').innerHTML = '<div class="no-result">카테고리를 선택해주세요</div>';
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
                const dayOfWeek = dateObj.getDay(); // 0=일, 6=토
                const holidayName = KR_HOLIDAYS[dateStr];
                
                const hasRecord = records[dateStr] && Object.values(records[dateStr]).some(v => v);
                
                let classes = 'day';
                if (isToday) classes += ' today';
                if (isSelected) classes += ' selected';
                
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
                    planHtml += `<div class="day-plan-item" style="background:${ev.color}" title="${ev.title}" onclick="event.stopPropagation(); openEventModal('${ev.id}')">${escapeHtml(ev.title)}</div>`;
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
                            <div class="day-record-check">${hasRecord ? '✓' : ''}</div>
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
        }
        
        // 오늘 기준으로 아직 끝나지 않은 예정 작업들을 D-day와 함께 가로 스크롤 카드로 표시
        let collapsedUpcomingCardIds = new Set(); // 이번 세션 동안만 유지되는 개별 카드 접힘 상태
        
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
                widget.innerHTML = '<div class="upcoming-empty">📌 다가오는 예정 작업이 없습니다</div>';
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
                    <div class="upcoming-card" style="border-left-color:${ev.color}" onclick="openEventModal('${ev.id}')">
                        <button class="upcoming-card-collapse-btn" onclick="event.stopPropagation(); collapseUpcomingCard('${ev.id}')" title="작게 접기">−</button>
                        <span class="upcoming-card-dday" style="background:${ev.color}">${ddayInfo}</span>
                        <div class="upcoming-card-title" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>
                        <div class="upcoming-card-date">${dateLabel}</div>
                    </div>
                `;
            }).join('');
        }
        
        function collapseUpcomingCard(eventId) {
            collapsedUpcomingCardIds.add(eventId);
            renderUpcomingWidget();
        }
        
        function expandUpcomingCard(eventId) {
            collapsedUpcomingCardIds.delete(eventId);
            renderUpcomingWidget();
        }
        
        function toggleUpcomingWidget() {
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
        
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
        
        // ===== 날짜 선택 & 활동기록 =====
        function selectDate(dateStr) {
            // 다른 날짜로 넘어가기 전에 지금까지 입력한 내용 자동 저장
            if (selectedDate && selectedDate !== dateStr) {
                captureCurrentFormToRecords();
            }
            
            selectedDate = dateStr;
            const date = new Date(dateStr);
            const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
            document.getElementById('selectedDate').textContent = date.toLocaleDateString('ko-KR', options);
            
            renderCalendar();
            renderRecordForm();
        }
        
        // 현재 화면에 입력된 내용을 records에 반영 (날짜 이동/저장 공용)
        function captureCurrentFormToRecords() {
            if (!selectedDate) return false;
            if (!records[selectedDate]) records[selectedDate] = {};
            
            let changed = false;
            for (const category of categories) {
                const textarea = document.getElementById(`category-${category}`);
                if (textarea) {
                    const val = textarea.value.trim();
                    if (records[selectedDate][category] !== val) {
                        records[selectedDate][category] = val;
                        changed = true;
                    }
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
                html += '<div class="day-events-preview"><h4>📌 이 날의 예정 작업</h4>';
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
                html += `
                    <div class="category-record${collapsedClass}" data-category="${category}" style="border-left-color:${color};${heightStyle}">
                        <div class="category-record-header" draggable="true">
                            <span class="category-drag-handle" title="드래그해서 순서 변경">⠿</span>
                            <div class="category-name" style="color:${color}">${category}</div>
                            <div class="category-header-actions">
                                <button class="category-collapse-btn" draggable="false" onclick="toggleCategoryCollapse('${category}')" title="접기/펼치기">${isCollapsed ? '▸' : '▾'}</button>
                                <button class="category-hide-btn" draggable="false" onclick="hideCategoryForDate('${category}')" title="이 날짜에서 숨기기">✕</button>
                            </div>
                        </div>
                        <textarea id="category-${category}" data-category="${category}" placeholder="활동 내용을 입력하세요...">${content}</textarea>
                    </div>
                `;
            }
            
            if (hiddenCategories.length > 0) {
                html += '<div class="hidden-categories-row">';
                html += '<span class="hidden-categories-label">이 날짜에서 숨김:</span>';
                for (const category of hiddenCategories) {
                    html += `<button class="hidden-category-chip" onclick="showCategoryForDate('${category}')">+ ${category}</button>`;
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
                });
                observer.observe(box);
                
                // 날짜를 열었을 때 내용에 딱 맞게 박스 크기를 맞춤 (접힌 카테고리는 건너뜀)
                autoGrowCategoryBox(category);
                
                setupCategoryDragAndDrop(box);
            });
            
            // 활동 내용 입력 중에도 자동으로 임시 저장 + 박스 높이 자동 조절 (다른 날짜/새로고침 대비)
            container.querySelectorAll('.category-record textarea').forEach(textarea => {
                textarea.addEventListener('input', () => {
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
                
                // Enter 입력 시 다음 번호를 이어서 자동 생성 (번호만 있는 빈 줄에서 Enter를 누르면 번호 매기기 종료)
                textarea.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter') return;
                    
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
                });
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
            if (!selectedDate) return;
            
            if (hiddenCategoriesByDate[selectedDate]) {
                hiddenCategoriesByDate[selectedDate] = hiddenCategoriesByDate[selectedDate].filter(c => c !== category);
            }
            saveHiddenCategoriesToStorage();
            renderRecordForm();
        }
        
        function saveAllRecords() {
            if (!selectedDate) { showStatus('날짜를 선택해주세요', 'error'); return; }
            
            captureCurrentFormToRecords();
            renderCalendar();
            showStatus('✅ 저장되었습니다!', 'success');
        }
        
        function showStatus(message, type) {
            const statusEl = document.getElementById('statusMessage');
            statusEl.textContent = message;
            statusEl.className = `status-message ${type}`;
            setTimeout(() => { statusEl.className = 'status-message'; }, 3000);
        }
        
        // ===== 예정 작업 모달 (Google 캘린더 스타일) =====
        function renderColorPicker() {
            const container = document.getElementById('colorPicker');
            container.innerHTML = COLOR_PALETTE.map(color => `
                <div class="color-swatch" style="background:${color}" data-color="${color}" onclick="pickColor('${color}')"></div>
            `).join('');
        }
        
        function pickColor(color) {
            selectedColor = color;
            document.querySelectorAll('.color-swatch').forEach(sw => {
                sw.classList.toggle('selected', sw.dataset.color === color);
            });
        }
        
        function openEventModal(eventId, defaultDateStr) {
            editingEventId = eventId;
            const modal = document.getElementById('eventModal');
            const deleteBtn = document.getElementById('deleteEventBtn');
            
            if (eventId) {
                // 수정 모드
                const ev = events.find(e => e.id === eventId);
                if (!ev) return;
                
                document.getElementById('modalTitle').textContent = '📌 예정 작업 수정';
                document.getElementById('eventTitleInput').value = ev.title;
                document.getElementById('eventStartInput').value = ev.start;
                document.getElementById('eventEndInput').value = ev.end;
                selectedColor = ev.color;
                deleteBtn.style.display = 'block';
            } else {
                // 추가 모드
                const dateStr = defaultDateStr || formatDate(new Date());
                document.getElementById('modalTitle').textContent = '📌 예정 작업 추가';
                document.getElementById('eventTitleInput').value = '';
                document.getElementById('eventStartInput').value = dateStr;
                document.getElementById('eventEndInput').value = dateStr;
                selectedColor = COLOR_PALETTE[0];
                deleteBtn.style.display = 'none';
            }
            
            document.querySelectorAll('.color-swatch').forEach(sw => {
                sw.classList.toggle('selected', sw.dataset.color === selectedColor);
            });
            
            modal.classList.add('active');
        }
        
        function closeEventModal() {
            document.getElementById('eventModal').classList.remove('active');
            editingEventId = null;
        }
        
        function saveEvent() {
            const title = document.getElementById('eventTitleInput').value.trim();
            const start = document.getElementById('eventStartInput').value;
            const end = document.getElementById('eventEndInput').value;
            
            if (!title) { alert('작업 내용을 입력해주세요'); return; }
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
            showStatus('✅ 예정 작업이 저장되었습니다!', 'success');
        }
        
        function deleteEvent() {
            if (!editingEventId) return;
            if (!confirm('이 예정 작업을 삭제하시겠습니까?')) return;
            
            events = events.filter(e => e.id !== editingEventId);
            saveEventsToStorage();
            closeEventModal();
            renderCalendar();
            if (selectedDate) renderRecordForm();
            showStatus('🗑️ 삭제되었습니다', 'success');
        }
        
        // ===== 달력 네비게이션 =====
        function previousMonth() {
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
            renderCalendar();
        }
        
        function nextMonth() {
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
            renderCalendar();
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
        
        // 모달 바깥 클릭 시 닫기
        document.getElementById('eventModal').addEventListener('click', function(e) {
            if (e.target === this) closeEventModal();
        });
        
        // ===== 메모장 (날짜와 무관한 자유 메모) =====
        function applyNotesContent() {
            document.getElementById('notesTextarea').value = notesContent;
        }
        
        function setupNotesAutosave() {
            const textarea = document.getElementById('notesTextarea');
            const indicator = document.getElementById('notesSaveIndicator');
            let saveTimeout = null;
            
            textarea.addEventListener('input', () => {
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
        
        // 페이지를 닫거나 새로고침할 때도 입력 중이던 내용 저장 시도
        window.addEventListener('beforeunload', () => {
            captureCurrentFormToRecords();
            try {
                const blob = new Blob([JSON.stringify(getFullState())], { type: 'text/plain' });
                navigator.sendBeacon(GOOGLE_APPS_SCRIPT_URL, blob);
            } catch (e) { /* 무시 */ }
        });
        
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
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'dailySummary',
                        date: dateStr,
                        dateLabel: dateLabel,
                        logText: logText
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success' && data.summary) {
                    document.getElementById('dailySummaryResultTextarea').value = data.summary;
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 오늘 업무 요약이 생성되었습니다';
                    statusEl.className = 'ai-status success';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '요약 생성에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('일일 업무 요약 오류:', err);
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
        
        let aiConversationHistory = []; // [{role:'user'|'model', text:'...'}] - raw(JSON원문)을 저장해 맥락 유지
        
        async function generateAISummary() {
            const startStr = document.getElementById('aiStartDate').value;
            const endStr = document.getElementById('aiEndDate').value;
            const template = document.getElementById('aiTemplateTextarea').value;
            const btn = document.getElementById('aiGenerateBtn');
            const loading = document.getElementById('aiLoading');
            const statusEl = document.getElementById('aiStatus');
            const resultBlock = document.getElementById('aiResultBlock');
            
            if (!startStr || !endStr) {
                statusEl.textContent = '기간을 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            const logText = buildLogTextForRange(startStr, endStr);
            if (!logText) {
                statusEl.textContent = '해당 기간에 작성된 활동기록이 없습니다';
                statusEl.className = 'ai-status error';
                return;
            }
            
            btn.disabled = true;
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
                        periodLabel: periodLabel
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
                loading.style.display = 'none';
            }
        }
        
        async function reviseAISummary() {
            const instructionInput = document.getElementById('aiReviseInput');
            const instruction = instructionInput.value.trim();
            const reviseBtn = document.getElementById('aiReviseBtn');
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
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'revise',
                        history: aiConversationHistory,
                        instruction: instruction
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
        
        // ===== 목표수립 (KPI/핵심역량/성장계획/핵심가치/기타) - 5개 항목 독립 생성/수정 =====
        const GOAL_AREAS = [
            { id: 'kpi', label: 'KPI', hint: '성과달성을 위한 주요 본질 업무' },
            { id: 'competency', label: '핵심역량', hint: '본질업무를 효율적·효과적으로 수행하기 위한 활동' },
            { id: 'growth', label: '인재육성/성장계획', hint: '본인 성장계획 + 후배사원 육성계획' },
            { id: 'corevalue', label: '핵심가치', hint: '대웅 인사주요제도 내재화 계획' },
            { id: 'etc', label: '기타', hint: '수명업무/TF활동 등' }
        ];
        
        let goalConversationHistories = {}; // { kpi: [...], competency: [...], ... }
        
        function renderGoalAreas() {
            const container = document.getElementById('goalAreasContainer');
            container.innerHTML = GOAL_AREAS.map(area => `
                <div class="goal-area-block" data-area="${area.id}">
                    <div class="goal-area-header">
                        <span class="goal-area-title">${area.label}</span>
                        <span class="goal-area-hint">${area.hint}</span>
                    </div>
                    <textarea class="goal-note-textarea" id="goalNote-${area.id}" placeholder="이 항목에 대한 본인의 방향성/고민/목표 아이디어를 자유롭게 적어주세요 (선택 - 비워도 초안은 생성됩니다)"></textarea>
                    <button class="goal-generate-btn" id="goalGenBtn-${area.id}" onclick="generateGoalDraft('${area.id}')">✨ 초안 생성</button>
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
        
        async function generateGoalDraft(areaId) {
            const noteEl = document.getElementById(`goalNote-${areaId}`);
            const btn = document.getElementById(`goalGenBtn-${areaId}`);
            const loading = document.getElementById(`goalLoading-${areaId}`);
            const statusEl = document.getElementById(`goalStatus-${areaId}`);
            const resultBlock = document.getElementById(`goalResultBlock-${areaId}`);
            
            const note = noteEl.value.trim();
            const logText = goalRefLogText();
            
            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'goal-status';
            resultBlock.style.display = 'none';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'goalDraft',
                        area: areaId,
                        note: note,
                        logText: logText
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success' && data.summary) {
                    document.getElementById(`goalResult-${areaId}`).value = data.summary;
                    document.getElementById(`goalReviseInput-${areaId}`).value = '';
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 초안이 생성되었습니다';
                    statusEl.className = 'goal-status success';
                    
                    const userPromptText =
                        `[참고할 최근 활동 기록]\n${logText || '(제공된 활동 기록 없음)'}\n\n` +
                        `[본인이 적은 방향성/메모]\n${note || '(작성한 메모 없음)'}`;
                    goalConversationHistories[areaId] = [
                        { role: 'user', text: userPromptText },
                        { role: 'model', text: data.summary }
                    ];
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '초안 생성에 실패했습니다');
                    statusEl.className = 'goal-status error';
                }
            } catch (err) {
                console.error('목표수립 초안 생성 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'goal-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
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
                        instruction: instruction
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
        
        function copyGoalResult(areaId) {
            const textarea = document.getElementById(`goalResult-${areaId}`);
            textarea.select();
            document.execCommand('copy');
            
            const statusEl = document.getElementById(`goalStatus-${areaId}`);
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'goal-status success';
        }
        
        window.addEventListener('load', init);
