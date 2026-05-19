// ============================================================================
// 롤다방 내전 — 온라인 경매 전용 공통 (단계 P-4)
// auction-team.html에서 사용
//
// 의존성: draft-common.js (initSupabase, loadRoom, ROOM_CODE, ROLE, TOKEN,
//   getSiteBase, escapeHtml 등)
// ============================================================================

// 경매 RPC: 입찰
async function placeAuctionBid(roomCode, leaderToken, amount) {
    const client = initSupabase();
    if (!client) return { success: false, message: 'Supabase 초기화 실패' };
    const { data, error } = await client.rpc('place_auction_bid', {
        p_room_code: roomCode,
        p_leader_token: leaderToken,
        p_amount: amount
    });
    if (error) return { success: false, message: error.message };
    const r = (data && data[0]) || {};
    return {
        success: !!r.success,
        message: r.message || '',
        newAmount: r.new_amount
    };
}

// 경매 RPC: 멤버 호출 (admin)
async function callNextAuctionMember(roomCode, adminToken) {
    const client = initSupabase();
    if (!client) return { success: false, message: 'Supabase 초기화 실패' };
    const { data, error } = await client.rpc('call_next_auction_member', {
        p_room_code: roomCode,
        p_admin_token: adminToken
    });
    if (error) return { success: false, message: error.message };
    const r = (data && data[0]) || {};
    return { success: !!r.success, message: r.message || '', memberName: r.member_name };
}

// 경매 RPC: 낙찰 (admin or 자동)
async function finalizeAuctionBid(roomCode, adminToken) {
    const client = initSupabase();
    if (!client) return { success: false, message: 'Supabase 초기화 실패' };
    const { data, error } = await client.rpc('finalize_auction_bid', {
        p_room_code: roomCode,
        p_admin_token: adminToken
    });
    if (error) return { success: false, message: error.message };
    const r = (data && data[0]) || {};
    return { success: !!r.success, message: r.message || '', soldToTeam: r.sold_to_team };
}

// 경매 RPC: 설정 변경 (admin)
async function updateAuctionSettings(roomCode, adminToken, opts) {
    const client = initSupabase();
    if (!client) return { success: false, message: 'Supabase 초기화 실패' };
    const params = {
        p_room_code: roomCode,
        p_admin_token: adminToken
    };
    if (opts.timerSeconds !== undefined) params.p_timer_seconds = opts.timerSeconds;
    if (opts.showNextMember !== undefined) params.p_show_next_member = opts.showNextMember;
    const { data, error } = await client.rpc('update_auction_settings', params);
    if (error) return { success: false, message: error.message };
    const r = (data && data[0]) || {};
    return { success: !!r.success, message: r.message || '' };
}

// 경매 RPC: 방 생성 (admin)
async function createAuctionRoom(adminToken, teamCount, members, leaders, timerSeconds) {
    const client = initSupabase();
    if (!client) return { success: false, message: 'Supabase 초기화 실패' };
    const { data, error } = await client.rpc('create_auction_room', {
        p_admin_token: adminToken,
        p_team_count: teamCount,
        p_members: members,
        p_leaders: leaders,
        p_timer_seconds: timerSeconds || 10
    });
    if (error) return { success: false, message: error.message };
    const r = (data && data[0]) || {};
    return {
        success: !!r.room_code,
        roomCode: r.room_code,
        leaderTokens: r.leader_tokens || {}
    };
}

// 경매 결과 로드
async function loadAuctionResults(roomCode) {
    const client = initSupabase();
    if (!client) return [];
    const { data } = await client
        .from('auction_results')
        .select('*')
        .eq('room_code', roomCode)
        .order('sold_at');
    return data || [];
}

// 경매 입찰 기록 로드
async function loadAuctionBids(roomCode) {
    const client = initSupabase();
    if (!client) return [];
    const { data } = await client
        .from('auction_bids')
        .select('*')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: false })
        .limit(50);
    return data || [];
}

// 타이머 남은 초 계산
function computeAuctionTimerRemaining(lastBidAt, timerSeconds) {
    if (!lastBidAt) return timerSeconds || 10;
    const limit = timerSeconds || 10;
    const elapsed = (Date.now() - new Date(lastBidAt).getTime()) / 1000;
    return Math.max(0, limit - elapsed);
}
