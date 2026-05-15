// ============================================================================
// 롤다방 내전 드래프트 — 공통 JavaScript
// 모든 페이지에서 공유하는 함수들
// ============================================================================

// ============================================================================
// 1. Supabase 설정
// ============================================================================
// ⚠️ 아래 두 값을 본인의 Supabase 프로젝트 정보로 교체하세요.
const SUPABASE_URL = 'https://eseskfeyvxqdvqqofeqb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zSH-Q5GCTXkRJ0UDd-IrlQ_DYKSkQzc';

// ============================================================================
// 2. URL 파라미터 파싱
// ============================================================================
const urlParams = new URLSearchParams(window.location.search);
const ROOM_CODE = urlParams.get('room');
const ROLE = urlParams.get('role');         // 'leader1' or 'leader2'
const TOKEN = urlParams.get('token');

// ============================================================================
// 3. Supabase 클라이언트 (전역)
// ============================================================================
let supabaseClient = null;

function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase) {
        console.error('Supabase library not loaded');
        return null;
    }
    if (SUPABASE_URL.includes('YOUR_SUPABASE') || SUPABASE_KEY.includes('YOUR_SUPABASE')) {
        console.error('Supabase 설정이 필요합니다.');
        return null;
    }
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return supabaseClient;
    } catch (e) {
        console.error('Supabase client creation failed:', e);
        return null;
    }
}

// ============================================================================
// 4. 페이지 이동 (URL 파라미터 유지)
// ============================================================================
function goToPage(pagePath, extraParams = {}) {
    const params = new URLSearchParams();
    if (ROOM_CODE) params.set('room', ROOM_CODE);
    if (ROLE) params.set('role', ROLE);
    if (TOKEN) params.set('token', TOKEN);
    Object.keys(extraParams).forEach(k => {
        if (extraParams[k] !== undefined && extraParams[k] !== null) {
            params.set(k, extraParams[k]);
        }
    });
    window.location.href = pagePath + '?' + params.toString();
}

// ----------------------------------------------------------------------------
// 페이지 이동 함수들
//
// 사이트 루트(ldb-draft/) 기준 절대 경로를 사용합니다.
// GitHub Pages 호스팅 구조: https://USER.github.io/ldb-draft/
//                          → 서브경로 /ldb-draft/ 가 사이트 루트가 됨
//
// 이렇게 하면 어느 폴더 깊이에서 호출해도 동일하게 동작합니다.
// ----------------------------------------------------------------------------

// 사이트 베이스 경로 자동 감지
// (예: pathname이 /ldb-draft/pages/rps/rps-1v1.html 이면 베이스는 /ldb-draft/)
function getSiteBase() {
    const path = window.location.pathname;
    // main.html, pages/... 같은 경로의 윗부분이 베이스
    // 가장 안전: '/main.html' 또는 '/pages/' 가 나오는 지점 앞을 베이스로
    const mainIdx = path.indexOf('/main.html');
    if (mainIdx >= 0) return path.substring(0, mainIdx + 1);
    const pagesIdx = path.indexOf('/pages/');
    if (pagesIdx >= 0) return path.substring(0, pagesIdx + 1);
    // 디폴트: 현재 경로의 디렉토리
    const lastSlash = path.lastIndexOf('/');
    return path.substring(0, lastSlash + 1);
}

function goToMain() {
    goToPage(getSiteBase() + 'main.html');
}

function goToRps(round) {
    // 현재는 1v1만 지원 (rps-1v1.html). Phase 3에서 multi 추가 시 분기.
    goToPage(getSiteBase() + 'pages/rps/rps-1v1.html', { round: round });
}

function goToPickOrder() {
    goToPage(getSiteBase() + 'pages/rps/pick-order.html');
}

function goToDraft() {
    // 현재는 2팀만 지원. Phase 3에서 multi 추가 시 분기.
    goToPage(getSiteBase() + 'pages/draft/draft-2team.html');
}

function goToSide() {
    goToPage(getSiteBase() + 'pages/matchup/side-pick.html');
}

function goToDone() {
    goToPage(getSiteBase() + 'pages/done.html');
}

// ============================================================================
// 5. 방 정보 / 게임 상태 로드
// ============================================================================
async function loadRoom() {
    const client = initSupabase();
    if (!client) return null;
    const { data, error } = await client
        .from('rooms')
        .select('*')
        .eq('room_code', ROOM_CODE)
        .single();
    if (error || !data) {
        console.error('loadRoom error:', error);
        return null;
    }
    return data;
}

async function loadRpsGames() {
    const client = initSupabase();
    if (!client) return [];
    const { data, error } = await client
        .from('rps_games')
        .select('*')
        .eq('room_code', ROOM_CODE);
    if (error) {
        console.error('loadRpsGames error:', error);
        return [];
    }
    return data || [];
}

async function loadDrafts() {
    const client = initSupabase();
    if (!client) return [];
    const { data, error } = await client
        .from('drafts')
        .select('*')
        .eq('room_code', ROOM_CODE)
        .order('pick_number');
    if (error) {
        console.error('loadDrafts error:', error);
        return [];
    }
    return data || [];
}

// ============================================================================
// 6. 토큰/접속 검증
// ============================================================================
// URL 파라미터가 모두 있는지, role이 valid한지 검사
function validateUrlParams() {
    if (!ROOM_CODE || !ROLE || !TOKEN) {
        return { ok: false, message: '잘못된 링크입니다. (필수 정보 누락)' };
    }
    if (ROLE !== 'leader1' && ROLE !== 'leader2') {
        return { ok: false, message: '잘못된 역할입니다.' };
    }
    return { ok: true };
}

// 방을 로드하고 토큰이 일치하는지 검증. 성공 시 room 반환, 실패 시 null
async function validateAndLoadRoom() {
    const room = await loadRoom();
    if (!room) return null;
    const expectedToken = ROLE === 'leader1' ? room.leader1_token : room.leader2_token;
    if (expectedToken !== TOKEN) return null;
    return room;
}

// ============================================================================
// 7. 상태 → 페이지 자동 라우팅
// ============================================================================
// 방 상태(status)에 따라 적절한 페이지로 자동 이동.
// 가위바위보 결과까지 함께 보고 판단해야 하므로 rpsGames도 필요.
function routeByStatus(room, rpsGames) {
    const status = room.status;
    const rps1 = rpsGames.find(r => r.round === 1);
    const rps2 = rpsGames.find(r => r.round === 2);

    if (status === 'waiting' || status === 'rps1') {
        // 단계 E 변경: 가위바위보 결과 났으면 — 이긴 사람도, 진 사람도 둘 다 pick-order로
        // (진 사람은 read-only로 같은 화면을 봄)
        if (rps1 && rps1.winner && rps1.winner !== 'draw') {
            return { page: 'pick-order' };
        }
        return { page: 'rps', extras: { round: 1 } };
    }

    if (status === 'drafting') {
        return { page: 'draft' };
    }

    if (status === 'rps2') {
        if (rps2 && rps2.winner && rps2.winner !== 'draw') {
            if (rps2.winner === ROLE) return { page: 'side' };
            return { page: 'rps', extras: { round: 2 } };
        }
        return { page: 'rps', extras: { round: 2 } };
    }

    if (status === 'done') {
        return { page: 'done' };
    }

    // 알 수 없는 상태
    return { page: 'rps', extras: { round: 1 } };
}

// 페이지 이름 → 실제 goToXxx 호출
function goToPageByName(pageName, extras) {
    extras = extras || {};
    if (pageName === 'rps') return goToRps(extras.round || 1);
    if (pageName === 'pick-order') return goToPickOrder();
    if (pageName === 'draft') return goToDraft();
    if (pageName === 'side') return goToSide();
    if (pageName === 'done') return goToDone();
    goToMain();
}

// ============================================================================
// 8. 실시간 구독 (방, 가위바위보, 드래프트 변경 감지)
// ============================================================================
function subscribeRealtime(callbacks) {
    const client = initSupabase();
    if (!client) return null;

    callbacks = callbacks || {};

    const channel = client
        .channel(`room:${ROOM_CODE}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'rooms',
            filter: `room_code=eq.${ROOM_CODE}`
        }, (payload) => {
            if (callbacks.onRoom) callbacks.onRoom(payload);
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'rps_games',
            filter: `room_code=eq.${ROOM_CODE}`
        }, (payload) => {
            if (callbacks.onRps) callbacks.onRps(payload);
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'drafts',
            filter: `room_code=eq.${ROOM_CODE}`
        }, (payload) => {
            if (callbacks.onDraft) callbacks.onDraft(payload);
        })
        .subscribe();
    return channel;
}

// ============================================================================
// 9. UI 유틸리티
// ============================================================================
function $(id) { return document.getElementById(id); }
function show(id) { const el = $(id); if (el) el.style.display = ''; }
function hide(id) { const el = $(id); if (el) el.style.display = 'none'; }

function showToast(msg, duration) {
    duration = duration || 2200;
    let toast = $('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function showFatalError(message) {
    document.body.innerHTML = `
        <div class="page-wrap">
            <div class="card">
                <h1>⚠️ 접속 오류</h1>
                <div class="status-box danger">
                    <div class="status-icon">⚠️</div>
                    <div class="status-title">${message}</div>
                    <div class="status-desc">관리자에게 새 링크를 받아주세요.</div>
                </div>
            </div>
        </div>
    `;
}

// 역할 이름 / 닉네임 헬퍼
function getMyDisplayName(room) {
    if (!room) return ROLE === 'leader1' ? '팀장 1' : '팀장 2';
    if (ROLE === 'leader1') return room.leader1_name || '팀장 1';
    return room.leader2_name || '팀장 2';
}

function getOtherDisplayName(room) {
    if (!room) return ROLE === 'leader1' ? '팀장 2' : '팀장 1';
    if (ROLE === 'leader1') return room.leader2_name || '팀장 2';
    return room.leader1_name || '팀장 1';
}

function getRoleDisplay(role, room) {
    if (!room) return role === 'leader1' ? '팀장 1' : '팀장 2';
    if (role === 'leader1') return room.leader1_name || '팀장 1';
    return room.leader2_name || '팀장 2';
}

// 가위바위보 선택 → 이모지/한글
function rpsEmoji(choice) {
    return choice === 'rock' ? '✊' : choice === 'paper' ? '✋' : choice === 'scissors' ? '✌️' : '?';
}
function rpsKorean(choice) {
    return choice === 'rock' ? '바위' : choice === 'paper' ? '보' : choice === 'scissors' ? '가위' : '?';
}

// 단계 C 추가: HTML 이스케이프 (사용자 입력값을 innerHTML에 넣을 때 안전 보장)
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
}

// 페이지 공통 헤더 렌더링 (단계 C: 간소화 — 팀장 이름 배지만 표시)
// stageTitle, stageSubtitle 인자는 기존 호출부 호환을 위해 받지만 표시하지 않음
function renderHeader(room, stageTitle, stageSubtitle) {
    const header = $('headerArea');
    if (!header) return;
    const myName = getMyDisplayName(room);
    const roleLabel = ROLE === 'leader1' ? '1팀 팀장' : '2팀 팀장';
    header.innerHTML = `
        <div class="card header-card" style="padding: 14px 18px;">
            <span class="role-badge role-${ROLE}">👑 ${roleLabel} (${escapeHtml(myName)})</span>
        </div>
    `;
}
