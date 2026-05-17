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
const ROLE = urlParams.get('role');         // 'leader1', 'leader2', ..., 'leader8'
const TOKEN = urlParams.get('token');

// 단계 O: ROLE에서 team_index 추출 ('leader1'→1, 'leader8'→8)
function getMyTeamIndex() {
    if (!ROLE) return null;
    const m = String(ROLE).match(/^leader(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
}

// N팀 모드인지 (room.team_count > 2)
function isNTeamMode(room) {
    return room && room.team_count && room.team_count > 2;
}

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
    // 단계 O: leader1 ~ leader8 허용
    if (!/^leader[1-8]$/.test(ROLE)) {
        return { ok: false, message: '잘못된 역할입니다.' };
    }
    return { ok: true };
}

// 방을 로드하고 토큰이 일치하는지 검증. 성공 시 room 반환, 실패 시 null
// 단계 O: N팀에서는 토큰이 teams 테이블에 저장됨 → 거기서 검증
async function validateAndLoadRoom() {
    const room = await loadRoom();
    if (!room) return null;
    const myIdx = getMyTeamIndex();
    if (!myIdx) return null;

    // 1, 2팀이고 rooms 테이블에 토큰이 있으면 그쪽으로 검증 (2팀 흐름 호환)
    if (myIdx === 1 && room.leader1_token === TOKEN) return room;
    if (myIdx === 2 && room.leader2_token === TOKEN) return room;

    // 3+팀이거나 위 검증 실패 시 teams 테이블에서 검증
    if (room.team_count && room.team_count > 0) {
        try {
            const client = initSupabase();
            const { data: team } = await client
                .from('teams')
                .select('*')
                .eq('room_code', ROOM_CODE)
                .eq('team_index', myIdx)
                .maybeSingle();
            if (team && team.leader_token === TOKEN) return room;
        } catch (e) {
            console.warn('teams token check failed:', e);
        }
    }

    return null;
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
    // 단계 O-1: N팀 모드 (team_count > 2) 인지 확인
    const isNTeam = !!(room.team_count && room.team_count > 2);

    if (status === 'waiting' || status === 'rps1') {
        // 단계 E 변경: 가위바위보 결과 났으면 — 이긴 사람도, 진 사람도 둘 다 pick-order로
        // (진 사람은 read-only로 같은 화면을 봄)
        if (rps1 && rps1.winner && rps1.winner !== 'draw') {
            return { page: 'pick-order' };
        }
        return { page: 'rps', extras: { round: 1 } };
    }

    // 단계 O-1: N팀 대기 상태들 — main.html 자체에서 대기 화면 표시 (라우팅 X)
    if (status === 'pick_order_pending') {
        return { page: 'waiting', extras: { reason: 'pick_order' } };
    }
    if (status === 'matchup_pending') {
        return { page: 'waiting', extras: { reason: 'matchup' } };
    }
    if (status === 'side_rps') {
        return { page: 'waiting', extras: { reason: 'side_rps' } };
    }

    if (status === 'drafting') {
        // 단계 O-2: N팀도 draft 페이지로 라우팅 (draft-2team.html이 N팀 호환됨)
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
        // N팀의 done.html 호환은 단계 O-2에서 — 그 전까지는 대기 화면
        if (isNTeam) {
            return { page: 'waiting', extras: { reason: 'done_n' } };
        }
        return { page: 'done' };
    }

    // 알 수 없는 상태
    console.warn('[routeByStatus] unknown status:', status);
    return { page: 'waiting', extras: { reason: 'unknown', status } };
}

// 페이지 이름 → 실제 goToXxx 호출
function goToPageByName(pageName, extras) {
    extras = extras || {};
    if (pageName === 'rps') return goToRps(extras.round || 1);
    if (pageName === 'pick-order') return goToPickOrder();
    if (pageName === 'draft') return goToDraft();
    if (pageName === 'side') return goToSide();
    if (pageName === 'done') return goToDone();
    // 단계 O-1: 'waiting' — 현재 페이지에서 대기 화면 표시 (다른 페이지로 이동 X)
    if (pageName === 'waiting') return showWaitingScreen(extras);
    goToMain();
}

// 단계 O-1: N팀 대기 화면 표시 (main.html에서 호출)
function showWaitingScreen(extras) {
    const reason = (extras && extras.reason) || 'unknown';
    const messages = {
        pick_order: {
            title: '⏳ 픽 순서 결정 대기 중',
            body: '관리자가 픽 순서를 결정하고 있습니다.<br>잠시만 기다려주세요.'
        },
        matchup: {
            title: '⏳ 진영 매칭 결정 대기 중',
            body: '모든 픽이 완료되었습니다.<br>관리자가 진영 매칭을 결정하고 있습니다.'
        },
        side_rps: {
            title: '🥊 진영 가위바위보 대기 중',
            body: '진영 결정 가위바위보가 진행 중입니다.<br>본인의 매칭 차례가 오면 자동으로 화면이 바뀝니다.'
        },
        drafting_n: {
            title: '🎯 드래프트 진행 중',
            body: '4/6/8팀 드래프트 화면은 아직 개발 중입니다.<br>관리자 모니터 창에서 진행 상황을 확인할 수 있습니다.'
        },
        done_n: {
            title: '🎉 드래프트 완료',
            body: '모든 단계가 완료되었습니다!<br>관리자 화면에서 결과를 확인하세요.'
        },
        unknown: {
            title: '⏳ 대기 중',
            body: '잠시만 기다려주세요...'
        }
    };
    const msg = messages[reason] || messages.unknown;
    document.body.innerHTML = `
        <div class="page-wrap" style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
            <div class="card" style="text-align:center; padding:40px 24px; max-width:420px;">
                <div style="font-size:54px; margin-bottom:8px;">⏳</div>
                <h1 style="border-bottom:none; padding-bottom:0; font-size:18px; margin-bottom:8px;">${msg.title}</h1>
                <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${msg.body}</p>
                <div class="spinner" style="margin: 20px auto 0;"></div>
            </div>
        </div>
    `;
    // 실시간 구독으로 status 변경 감지 → 변경되면 main 다시 로드
    _subscribeForStatusChange();
}

// 단계 O-1: 대기 화면에서 status 변경 감지
function _subscribeForStatusChange() {
    const client = initSupabase();
    if (!client) return;
    const channel = client.channel('waiting_' + ROOM_CODE)
        .on('postgres_changes', {
            event: '*', schema: 'public', table: 'rooms',
            filter: `room_code=eq.${ROOM_CODE}`
        }, (payload) => {
            if (payload.eventType === 'DELETE') {
                document.body.innerHTML = `
                    <div class="page-wrap" style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
                        <div class="card" style="text-align:center; padding:40px 24px;">
                            <div style="font-size:54px; margin-bottom:8px;">🎉</div>
                            <h1 style="border-bottom:none; padding-bottom:0;">수고하셨습니다!</h1>
                            <p style="font-size:13px; color:var(--text-muted);">이 창은 닫으셔도 됩니다.</p>
                        </div>
                    </div>
                `;
                return;
            }
            // status가 바뀌었으면 main 재로딩
            console.log('[waiting] status changed:', payload.new && payload.new.status);
            goToMain();
        })
        .subscribe();
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
// 단계 O: N팀 모드용 teams 캐시 (페이지가 setupTeamsCache로 한 번 채워둠)
let _teamsCache = null;
function setTeamsCache(teams) { _teamsCache = teams || []; }
function getTeamByIndex(idx) {
    if (!_teamsCache) return null;
    return _teamsCache.find(t => t.team_index === idx) || null;
}

function getMyDisplayName(room) {
    if (!room) return ROLE === 'leader1' ? '팀장 1' : '팀장 2';
    const myIdx = getMyTeamIndex();
    // 1, 2팀은 rooms 테이블에서
    if (myIdx === 1) return room.leader1_name || '팀장 1';
    if (myIdx === 2) return room.leader2_name || '팀장 2';
    // 3+팀은 teams 캐시에서
    const team = getTeamByIndex(myIdx);
    return (team && team.leader_name) || ('팀장 ' + (myIdx || '?'));
}

function getOtherDisplayName(room) {
    // 2팀일 때만 의미 있음 (N팀에선 상대가 여러 명)
    if (!room) return ROLE === 'leader1' ? '팀장 2' : '팀장 1';
    if (ROLE === 'leader1') return room.leader2_name || '팀장 2';
    return room.leader1_name || '팀장 1';
}

function getRoleDisplay(role, room) {
    if (!room) return role === 'leader1' ? '팀장 1' : '팀장 2';
    if (role === 'leader1') return room.leader1_name || '팀장 1';
    if (role === 'leader2') return room.leader2_name || '팀장 2';
    // leader3+ → teams 캐시
    const m = String(role).match(/^leader(\d+)$/);
    if (m) {
        const idx = parseInt(m[1], 10);
        const team = getTeamByIndex(idx);
        if (team && team.leader_name) return team.leader_name;
    }
    return role;
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

// ============================================================================
// 단계 L: 팀장 선택/잠금 시스템
// — 페이지 진입 시 "본인이 맞으십니까?" 확인 + claim_leader_seat RPC 호출
// — 첫 사용자만 점유 가능. 다른 사용자가 같은 링크로 들어와도 거부.
// — 재접속(새로고침)은 같은 client_id로 통과
// ============================================================================
const CLIENT_ID_KEY_PREFIX = 'loldabang_client_id_';
const CLAIM_OK_KEY_PREFIX = 'loldabang_claim_ok_';

function _getOrCreateClientId(roomCode, role) {
    // 방+role 별로 client_id 저장 (다른 방/role 점유 가능)
    const key = CLIENT_ID_KEY_PREFIX + roomCode + '_' + role;
    let id = null;
    try { id = localStorage.getItem(key); } catch (e) {}
    if (!id) {
        id = 'cid_' + Math.random().toString(36).slice(2) + '_' + Date.now();
        try { localStorage.setItem(key, id); } catch (e) {}
    }
    return id;
}

function _isClaimVerified(roomCode, role) {
    try {
        return localStorage.getItem(CLAIM_OK_KEY_PREFIX + roomCode + '_' + role) === '1';
    } catch (e) { return false; }
}
function _markClaimVerified(roomCode, role) {
    try { localStorage.setItem(CLAIM_OK_KEY_PREFIX + roomCode + '_' + role, '1'); } catch (e) {}
}

// 페이지 진입 시 호출 — claim 화면을 보여주고 사용자 확인 후 claim RPC 호출
// 성공하면 resolve(true), 실패/거부면 화면 교체 + resolve(false)
// 이미 확인 완료된 경우 (localStorage 표식) 즉시 통과
async function ensureLeaderClaim(room) {
    console.log('[claim] ensureLeaderClaim called', { room_status: room && room.status, ROLE });
    if (!ROOM_CODE || !ROLE || !TOKEN) {
        console.warn('[claim] missing url params, skipping');
        return true;
    }
    if (_isClaimVerified(ROOM_CODE, ROLE)) {
        console.log('[claim] already verified in localStorage, silent verify');
        const ok = await _tryClaim(/* silent */ true);
        console.log('[claim] silent verify result:', ok);
        return ok;
    }

    // 첫 접속: 사용자에게 확인 화면 표시
    // 단계 O: N팀이면 teams 테이블에서 이름 조회
    const myIdx = getMyTeamIndex();
    let myName = null;
    if (room) {
        if (myIdx === 1) myName = room.leader1_name;
        else if (myIdx === 2) myName = room.leader2_name;
    }
    if (!myName && myIdx) {
        // teams 테이블에서 조회
        try {
            const client = initSupabase();
            const { data: team } = await client
                .from('teams')
                .select('leader_name')
                .eq('room_code', ROOM_CODE)
                .eq('team_index', myIdx)
                .maybeSingle();
            if (team) myName = team.leader_name;
        } catch (e) {}
    }
    if (!myName) myName = ROLE;

    console.log('[claim] showing modal for:', myName);
    const userOk = await _showClaimConfirmScreen(myName);
    console.log('[claim] modal result:', userOk);
    if (!userOk) {
        _showClaimRefused();
        return false;
    }
    // RPC 호출
    console.log('[claim] calling _tryClaim(false)');
    const ok = await _tryClaim(false);
    console.log('[claim] _tryClaim result:', ok);
    return ok;
}

async function _tryClaim(silent) {
    const client = initSupabase();
    if (!client) {
        if (!silent) showFatalError('Supabase 연결 실패');
        return silent ? true : false;
    }
    const clientId = _getOrCreateClientId(ROOM_CODE, ROLE);
    const myIdx = getMyTeamIndex();
    // 단계 O: team_index >= 3 이면 claim_team_seat (N팀), 1/2면 기존 claim_leader_seat
    const rpcName = (myIdx && myIdx >= 3) ? 'claim_team_seat' : 'claim_leader_seat';
    try {
        const { data, error } = await client.rpc(rpcName, {
            p_room_code: ROOM_CODE,
            p_leader_token: TOKEN,
            p_claim_id: clientId
        });
        if (error) {
            console.warn(rpcName + ' error:', error);
            // 단계 O: claim_leader_seat이 실패했고 N팀일 수 있으면 claim_team_seat 재시도
            if (rpcName === 'claim_leader_seat' && myIdx && myIdx <= 2) {
                console.log('[claim] retrying with claim_team_seat...');
                try {
                    const { data: data2, error: err2 } = await client.rpc('claim_team_seat', {
                        p_room_code: ROOM_CODE,
                        p_leader_token: TOKEN,
                        p_claim_id: clientId
                    });
                    if (!err2 && data2 && data2[0] && data2[0].success) {
                        _markClaimVerified(ROOM_CODE, ROLE);
                        return true;
                    }
                } catch (e) {}
            }
            if (!silent) showFatalError('접속 확인 실패: ' + error.message);
            return silent ? true : false;
        }
        const r = data && data[0];
        if (!r) {
            console.warn(rpcName + ': empty response');
            return silent ? true : false;
        }
        if (!r.success) {
            if (!silent) _showClaimDenied(r.message || '접속이 거부되었습니다.');
            return false;
        }
        _markClaimVerified(ROOM_CODE, ROLE);
        return true;
    } catch (e) {
        console.warn(rpcName + ' exception:', e);
        if (!silent) showFatalError('네트워크 오류: ' + (e && e.message ? e.message : e));
        return silent ? true : false;
    }
}

// 사용자에게 "본인이 맞으십니까?" 모달
function _showClaimConfirmScreen(displayName) {
    return new Promise((resolve) => {
        // 단계 L fix: 기존 로딩 화면이나 다른 요소가 가리지 못하도록 명시적으로 body 끝에 추가 + z-index 더 높임
        // 또한 기존 overlay 있으면 제거
        const existing = document.getElementById('_claimConfirmOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = '_claimConfirmOverlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; width:100vw; height:100vh; background:rgba(0,0,0,0.75); z-index:2147483647; display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box;';
        overlay.innerHTML = `
            <div style="background:#fff; border-radius:14px; padding:24px 20px; max-width:380px; width:100%; box-shadow:0 12px 40px rgba(0,0,0,0.25); text-align:center; font-family:'Pretendard',sans-serif;">
                <div style="font-size:42px; margin-bottom:8px;">👑</div>
                <h2 style="font-size:18px; margin-bottom:8px; color:#1f2937;">팀장 확인</h2>
                <p style="font-size:13px; color:#4b5563; margin-bottom:8px;">아래 분이 본인이 맞으십니까?</p>
                <div style="font-size:18px; font-weight:800; color:#0f172a; padding:14px; background:linear-gradient(135deg,#fef3c7,#fde68a); border:2px solid #fbbf24; border-radius:10px; margin-bottom:14px; word-break:break-all;">
                    ${escapeHtml(displayName)}
                </div>
                <p style="font-size:11px; color:#dc2626; margin-bottom:14px;">⚠️ 본인이 아니라면 [아니요]를 눌러주세요.<br>한 번 [예]를 누르면 다른 사람은 들어올 수 없습니다.</p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button id="_claimNo" type="button" style="padding:12px; border:2px solid #e5e7eb; border-radius:10px; background:#fff; color:#6b7280; font-weight:700; cursor:pointer; font-family:inherit; font-size:14px;">❌ 아니요</button>
                    <button id="_claimYes" type="button" style="padding:12px; border:none; border-radius:10px; background:linear-gradient(135deg,#10b981,#059669); color:#fff; font-weight:800; cursor:pointer; font-family:inherit; font-size:14px;">✅ 예, 맞습니다</button>
                </div>
            </div>
        `;
        // body가 준비된 후 추가 (DOM 로드 전이라면 대기)
        const append = () => {
            document.body.appendChild(overlay);
            console.log('[claim] modal shown for:', displayName);
            const yesBtn = document.getElementById('_claimYes');
            const noBtn = document.getElementById('_claimNo');
            if (yesBtn) yesBtn.onclick = () => {
                console.log('[claim] user clicked YES');
                try { overlay.remove(); } catch(e){}
                resolve(true);
            };
            if (noBtn) noBtn.onclick = () => {
                console.log('[claim] user clicked NO');
                try { overlay.remove(); } catch(e){}
                resolve(false);
            };
        };
        if (document.body) {
            append();
        } else {
            document.addEventListener('DOMContentLoaded', append);
        }
    });
}

function _showClaimDenied(message) {
    document.body.innerHTML = `
        <div class="page-wrap">
            <div class="card" style="text-align:center; padding:40px 24px;">
                <div style="font-size:56px; margin-bottom:8px;">🚫</div>
                <h1 style="border-bottom:none; padding-bottom:0; color:#dc2626;">접속 거부</h1>
                <p style="font-size:14px; color:#4b5563; margin-top:12px;">${escapeHtml(message || '이미 다른 사람이 이 팀장으로 접속해 있습니다.')}</p>
                <p style="font-size:12px; color:#9ca3af; margin-top:20px;">잘못 접속하셨다면 이 창은 닫으셔도 됩니다.</p>
            </div>
        </div>
    `;
}

function _showClaimRefused() {
    document.body.innerHTML = `
        <div class="page-wrap">
            <div class="card" style="text-align:center; padding:40px 24px;">
                <div style="font-size:56px; margin-bottom:8px;">👋</div>
                <h1 style="border-bottom:none; padding-bottom:0; color:#4b5563;">접속하지 않으셨습니다</h1>
                <p style="font-size:14px; color:#4b5563; margin-top:12px;">본인이 아니시군요. 본인이신 팀장께 링크를 전달해주세요.</p>
                <p style="font-size:12px; color:#9ca3af; margin-top:20px;">이 창은 닫으셔도 됩니다.</p>
            </div>
        </div>
    `;
}
