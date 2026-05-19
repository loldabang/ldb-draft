// ============================================================================
// 롤다방 — 멤버 문자열 파서 (단계 P-6)
//
// 입력 예시:
//   "불편하지않은남자#KR1 p1/p2 원딜 /원딜 서폿 미드"
//   "시스템오류#퉤 사 M615/M445 서폿/정글 원딜 서폿"
//   "한 야#KR4 M585 M533 미드/미드 탑"
//   "C ogita mori#kr1 P3/P4/탑/탑 미드"
//
// 출력:
//   {
//     raw: 원본 문자열,
//     nick: "불편하지않은남자",
//     tag: "KR1",
//     fullName: "불편하지않은남자#KR1",
//     peakTier: "P1",
//     currentTier: "P2",
//     mainLanes: ["원딜"],
//     hopeLanes: ["원딜", "서폿", "미드"],
//     errors: []   // 비어있으면 OK
//   }
//
// 모드별 검증:
//   - soft, hyperSoft       → 5개 모두 필수 (nick, peak, current, main, hope ≥ 2개)
//   - softLineFixed, hard,
//     hyperHard             → 4개 필수 (nick, peak, current, main) — 희망라인 안 봄
// ============================================================================

(function (global) {
    'use strict';

    // ─── 티어 정규식 ─────────────────────────────────────────────────────
    // 영문 + 숫자: D4, E1, P2, G3, S1, M, GM, C
    // 마스터 점수: M615, M100, M445, m280
    // (임시), (임시티어), (임시 75) 등 부가 텍스트 허용
    const TIER_REGEX = /([GgSsBbIiPpDdEeMmRrCc][a-zA-Z]?[0-9]*)/;
    const TIER_FULL_REGEX = /(?:^|\s|\/)([GgSsBbIiPpDdEeMmRrCc][a-zA-Z]?[0-9]*)(?:\([^)]*\))?/g;

    // ─── 라인 정규화 ─────────────────────────────────────────────────────
    const LANE_MAP = {
        // 탑
        '탑': '탑', '톱': '탑', 'top': '탑', 'TOP': '탑', 'Top': '탑',
        'ㅌ': '탑', 'T': '탑', 't': '탑',
        // 정글
        '정글': '정글', '정': '정글', 'jg': '정글', 'JG': '정글', 'jg': '정글',
        'jungle': '정글', 'Jungle': '정글', 'JUNGLE': '정글',
        'ㅈㄱ': '정글', 'J': '정글', 'j': '정글',
        // 미드
        '미드': '미드', '미': '미드', 'mid': '미드', 'MID': '미드', 'Mid': '미드',
        'middle': '미드', 'Middle': '미드',
        'ㅁㄷ': '미드', 'M': '미드', 'm': '미드',
        // 원딜
        '원딜': '원딜', '원': '원딜', 'ad': '원딜', 'AD': '원딜', 'Ad': '원딜',
        'adc': '원딜', 'ADC': '원딜', 'AdC': '원딜', 'ADC': '원딜',
        'bot': '원딜', 'BOT': '원딜', 'Bot': '원딜',
        'ㅇㄷ': '원딜', 'A': '원딜', 'a': '원딜',
        // 서폿
        '서폿': '서폿', '서': '서폿', '서포터': '서폿', 'sup': '서폿', 'SUP': '서폿', 'Sup': '서폿',
        'support': '서폿', 'Support': '서폿', 'SUPPORT': '서폿',
        'ㅅㅍ': '서폿', 'S': '서폿', 's': '서폿'
    };

    // 라인 토큰 — 길이 우선 매칭 (길게 먼저)
    const LANE_TOKENS = Object.keys(LANE_MAP).sort((a, b) => b.length - a.length);

    function normalizeLane(token) {
        const t = String(token || '').trim();
        if (!t) return null;
        // 정확 매치
        if (LANE_MAP[t]) return LANE_MAP[t];
        // 길이순 부분 매치 시도
        for (const k of LANE_TOKENS) {
            if (t === k || t.toLowerCase() === k.toLowerCase()) return LANE_MAP[k];
        }
        return null;
    }

    // ─── 티어 정규화 ─────────────────────────────────────────────────────
    function normalizeTier(token) {
        const t = String(token || '').trim();
        if (!t) return null;
        // M615, M100, m280 같은 마스터 + 점수
        const matchM = t.match(/^[Mm][0-9]+$/);
        if (matchM) return t.toUpperCase();
        // GM50, GM200 같은 그마 + 점수
        const matchGM = t.match(/^[Gg][Mm][0-9]+$/);
        if (matchGM) return t.toUpperCase();
        // C50, C100 같은 챌린저 + 점수
        const matchC = t.match(/^[Cc][0-9]+$/);
        if (matchC) return t.toUpperCase();
        // 일반 티어: D4, P2, E3 등
        const match = t.match(/^([IBSGPDER])([0-9])$/i);
        if (match) {
            return match[1].toUpperCase() + match[2];
        }
        // R1, R2 같은 변형
        const matchR = t.match(/^[Rr][0-9]+$/);
        if (matchR) return t.toUpperCase();
        // M, GM, C 단독 — 거부 (점수 필요)
        return null;
    }

    // 한 토큰이 티어인지 판단
    function looksLikeTier(token) {
        return normalizeTier(token) !== null;
    }
    // 한 토큰이 라인인지 판단
    function looksLikeLane(token) {
        return normalizeLane(token) !== null;
    }

    // ─── 메인 파서 ──────────────────────────────────────────────────────
    function parseMember(raw, mode) {
        const result = {
            raw: raw,
            nick: '',
            tag: '',
            fullName: '',
            peakTier: '',
            currentTier: '',
            mainLanes: [],
            hopeLanes: [],
            errors: []
        };

        let text = String(raw || '').trim();
        if (!text) {
            result.errors.push('빈 줄');
            return result;
        }

        // ─── 1) 닉네임#태그 추출 ────────────────────────────────────────
        //   # 다음에 공백이 있을 수도 있음 (예: "시스템오류#퉤 사")
        //   태그는 다음 토큰이 티어인 지점 직전까지
        const hashIdx = text.indexOf('#');
        if (hashIdx === -1) {
            result.errors.push('닉네임 # 태그 형식이 아님 (예: 홍길동#KR1)');
            return result;
        }

        result.nick = text.substring(0, hashIdx).trim();
        if (!result.nick) {
            result.errors.push('닉네임이 비어 있음');
        }

        // # 이후를 공백으로 분리해서 토큰화
        const afterHash = text.substring(hashIdx + 1).trim();
        const tokens = afterHash.split(/[\s,]+/).filter(Boolean);

        if (tokens.length === 0) {
            result.errors.push('태그/티어 정보가 없음');
            return result;
        }

        // 태그 = 첫 토큰 (단 첫 토큰이 티어처럼 보이면 태그 누락)
        //   여러 단어 태그 처리: 다음에 티어가 나올 때까지 모아서 태그로 묶음
        //   예: "시스템오류#퉤 사 M615/M445 ..." → 태그 = "퉤 사"
        //   슬래시 형식: "이계준#Gye/M468/D1/원딜/원딜서폿"
        //     → tokens=["Gye/M468/D1/원딜/원딜서폿"]
        //     → 슬래시로 분리 후 첫 요소가 태그(=Gye), 나머지가 티어/라인
        let tagParts = [];
        let tierStartIdx = -1;
        // 슬래시 형식 감지 — 첫 토큰들 중에 (티어가 아닌) + 슬래시 포함 패턴이 있는지
        let slashSplitTag = null;
        let slashSplitRemainder = null;
        // 후보 토큰 수집 — 슬래시 형식 검증
        //   "0328", "/", "M454", "/", "M454" → 슬래시가 별개 토큰으로 또는 붙어
        //   "익 명#라 부/G1/E1(임시) 미드/원딜 서폿" → tokens=["라", "부/G1/E1(임시)", "미드/원딜", "서폿"]
        // 슬래시 분리 패턴: 토큰들을 합쳐서 슬래시 형식인지 검사
        const joined = tokens.join(' ');
        // 슬래시가 매우 많고 + 슬래시 분리시 깨끗하게 [태그, 티어, 티어, 라인, ...] 패턴인지 확인
        if (joined.includes('/')) {
            // 슬래시로 분리 (공백도 트리밍)
            const slashParts = joined.split('/').map(s => s.trim()).filter(Boolean);
            // 각 슬래시 파트의 첫 토큰만 추출 (예: "E1(임시) 미드" → "E1(임시)" → "E1")
            const firstTokens = slashParts.map(p => {
                const firstWord = p.split(/\s+/)[0] || '';
                return firstWord.replace(/\([^)]*\)/g, '').trim();
            });
            // 첫 요소 = 태그 후보, 두번째/세번째가 모두 티어여야 함
            if (slashParts.length >= 3
                && !looksLikeTier(firstTokens[0])
                && !looksLikeLane(firstTokens[0])
                && looksLikeTier(firstTokens[1])
                && looksLikeTier(firstTokens[2])) {
                // 슬래시 형식 확정
                slashSplitTag = slashParts[0];
                slashSplitRemainder = slashParts.slice(1);
            }
        }

        if (slashSplitTag !== null) {
            // 슬래시 형식 처리
            result.tag = slashSplitTag;
            result.fullName = result.nick + '#' + result.tag;
            tierStartIdx = 0;
            tokens.length = 0;
            tokens.push(...slashSplitRemainder);
        } else {
            // 일반 처리
            for (let i = 0; i < tokens.length; i++) {
                const tok = tokens[i];
                // 슬래시가 포함된 토큰 (예: "M615/M445") — 티어로 인식
                if (tok.includes('/')) {
                    const parts = tok.split('/').filter(Boolean);
                    if (parts.length >= 2 && looksLikeTier(parts[0]) && looksLikeTier(parts[1])) {
                        tierStartIdx = i;
                        break;
                    }
                    if (parts.some(looksLikeTier) || parts.some(looksLikeLane)) {
                        tierStartIdx = i;
                        break;
                    }
                }
                // 일반 티어 토큰
                if (looksLikeTier(tok)) {
                    tierStartIdx = i;
                    break;
                }
                tagParts.push(tok);
            }

            if (tierStartIdx === -1) {
                result.errors.push('티어를 찾을 수 없음 (예: P2/D4 또는 M615/M445)');
                result.tag = tagParts.join(' ').replace(/\s*\/\s*$/, '').trim();
                result.fullName = result.nick + '#' + result.tag;
                return result;
            }

            // 태그 정리 — trailing 슬래시/공백 제거
            result.tag = tagParts.join(' ').replace(/\s*\/\s*$/, '').trim();
            result.fullName = result.nick + '#' + result.tag;
        }

        // ─── 2) 티어 2개 추출 ───────────────────────────────────────────
        const remainder = tokens.slice(tierStartIdx);
        // remainder를 모두 합쳐서 다시 분석
        //   - "P2/D4" → ["P2", "D4"]
        //   - "P2", "/", "D4" → 같음
        //   - "M615/M445" → ["M615", "M445"]
        //   - "D4(임시)/P2" → ["D4", "P2"]
        //   - "E1(임시) 미드" → ["E1", "미드"] (괄호 제거 + 공백 분리)
        const tierLanePool = [];
        for (const tok of remainder) {
            // 슬래시로 분리
            const parts = tok.split(/[/]/).filter(Boolean);
            for (const p of parts) {
                // 괄호 안 내용 제거 (임시티어 표기) + 공백으로 추가 분리
                const cleaned = p.replace(/\([^)]*\)/g, '').trim();
                if (!cleaned) continue;
                const subParts = cleaned.split(/\s+/).filter(Boolean);
                for (const sp of subParts) tierLanePool.push(sp);
            }
        }

        // tierLanePool 에서 앞쪽 2개 티어 추출
        let tierFound = 0;
        let tierLastIdx = -1;
        for (let i = 0; i < tierLanePool.length; i++) {
            if (looksLikeTier(tierLanePool[i])) {
                if (tierFound === 0) {
                    result.peakTier = normalizeTier(tierLanePool[i]);
                    tierFound++;
                } else if (tierFound === 1) {
                    result.currentTier = normalizeTier(tierLanePool[i]);
                    tierFound++;
                    tierLastIdx = i;
                    break;
                }
            } else if (tierFound === 0) {
                // 티어 시작 전 노이즈
                continue;
            } else {
                // 티어 하나 찾았는데 다음 토큰이 라인 → 현재티어가 최고티어와 같다고 가정?
                //   아니, 그냥 라인 시작으로 간주하고 현재티어는 최고티어와 같게
                if (looksLikeLane(tierLanePool[i])) {
                    // 현재 티어 = 최고 티어 (사용자가 하나만 적은 경우)
                    result.currentTier = result.peakTier;
                    tierLastIdx = i - 1;
                    break;
                }
            }
        }

        if (!result.peakTier) {
            // 원본에 M, GM, C 단독이 있는지 확인 — 친절한 메시지
            if (/(?:^|\s|\/)([Mm]|GM|gm|[Cc])(?:\s|\/|$)/.test(afterHash)) {
                result.errors.push('마스터/그마/챌린저는 점수 필요 (예: M615, GM50, C200)');
            } else {
                result.errors.push('최고 티어를 찾을 수 없음 (예: P2, D4, M615)');
            }
        }
        if (!result.currentTier && result.peakTier) {
            // 두번째 티어 못찾음 → 사용자가 한 개만 적었을 수 있음 → 최고와 같다고 처리
            result.currentTier = result.peakTier;
        }
        if (!result.currentTier) {
            result.errors.push('현재 티어를 찾을 수 없음');
        }

        // ─── 3) 라인 추출 ──────────────────────────────────────────────
        // 슬래시 형식인 경우: slashSplitRemainder에서 티어 2개 뒤 나머지가 라인
        //   예: ["M468", "D1", "원딜", "원딜서폿"] → 라인 영역 = ["원딜", "원딜서폿"]
        //   첫 라인 토큰 = 주, 나머지 = 희망
        if (slashSplitTag !== null) {
            // tierLanePool에서 티어 2개 빼고 나머지를 라인으로
            const laneTokens = [];
            let tierCount = 0;
            for (const t of tierLanePool) {
                if (tierCount < 2 && looksLikeTier(t)) {
                    tierCount++;
                } else if (tierCount >= 2 || !looksLikeTier(t)) {
                    laneTokens.push(t);
                }
            }
            // 첫 라인 토큰 = 주, 나머지 = 희망 (각 토큰은 붙어있는 라인일 수 있음)
            if (laneTokens.length === 0) {
                result.errors.push('라인 정보를 찾을 수 없음');
                return result;
            }
            result.mainLanes = extractLanes(laneTokens[0]);
            const hopeText = laneTokens.slice(1).join(' ');
            result.hopeLanes = extractLanes(hopeText);
            // fallback: 주가 비어있으면 첫 1개를 주로, 나머지를 희망으로
            if (result.mainLanes.length === 0) {
                const allLanes = extractLanes(laneTokens.join(' '));
                if (allLanes.length > 0) {
                    result.mainLanes = [allLanes[0]];
                    result.hopeLanes = allLanes.slice(1);
                }
            }
            // 검증
            validateByMode(result, mode);
            return result;
        }

        // 일반 형식: tierLastIdx 이후의 토큰들을 라인으로 처리
        let laneStart = tierLastIdx + 1;
        if (laneStart < 0) laneStart = 0;

        // 라인 토큰들을 슬래시로 그룹화 (주 / 희망)
        //   원래 문자열에서 "라인부분"만 추출해서 슬래시로 분리
        //   대안: 라인 토큰 모음에서 슬래시 위치는 사라졌으므로 원본 문자열 다시 분석

        // 더 정확한 방법: 원본 텍스트에서 두번째 티어가 끝난 지점 이후를 라인 영역으로 보고 슬래시로 나눔
        const laneRegion = extractLaneRegion(afterHash, result.peakTier, result.currentTier);
        if (laneRegion === null) {
            result.errors.push('라인 정보를 찾을 수 없음');
            return result;
        }

        // 슬래시로 주/희망 분리
        //   - 슬래시 있음 → 그 위치로 분리
        //   - 슬래시 없음 → 라인 토큰 추출 후 첫 1개를 주, 나머지를 희망
        const slashIdx = laneRegion.indexOf('/');
        let mainPart, hopePart;
        if (slashIdx !== -1) {
            mainPart = laneRegion.substring(0, slashIdx);
            hopePart = laneRegion.substring(slashIdx + 1);
            result.mainLanes = extractLanes(mainPart);
            result.hopeLanes = extractLanes(hopePart);
            // 주가 비어있고 희망에만 있다면 fallback (예: "d4 e1 / 탑 / 정글 서폿" → 슬래시 잘못 위치)
            if (result.mainLanes.length === 0 && result.hopeLanes.length > 0) {
                // 모든 라인을 다시 모아서 첫 1개를 주, 나머지를 희망으로
                const allLanes = extractLanes(laneRegion);
                if (allLanes.length > 0) {
                    result.mainLanes = [allLanes[0]];
                    result.hopeLanes = allLanes.slice(1);
                    // 만약 슬래시 전후가 같은 그룹이면 (예: "원딜 / 원딜 미드") 첫 라인을 주로
                    const beforeSlash = extractLanes(mainPart);
                    const afterSlash = extractLanes(hopePart);
                    if (beforeSlash.length === 0 && afterSlash.length > 0) {
                        // 슬래시가 잘못 위치 — 모든 라인을 통합 처리
                    }
                }
            }
        } else {
            // 슬래시 없음 — 모든 라인을 추출해서 첫 1개를 주, 나머지를 희망으로
            const allLanes = extractLanes(laneRegion);
            if (allLanes.length > 0) {
                result.mainLanes = [allLanes[0]];
                result.hopeLanes = allLanes.slice(1);
            }
        }

        // ─── 4) 모드별 검증 ───────────────────────────────────────────
        validateByMode(result, mode);

        return result;
    }

    // 라인 영역 추출 — 티어 뒤부터의 텍스트
    function extractLaneRegion(text, peakTier, currentTier) {
        if (!peakTier) return null;
        // text 에서 currentTier (또는 peakTier) 이후 영역을 찾음
        //   현재티어 토큰을 찾아 그 뒤를 라인 영역으로
        const c = currentTier || peakTier;
        // 정규식으로 찾기 — 단어 경계 또는 끝
        const escaped = c.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const re = new RegExp(escaped + '(?:\\([^)]*\\))?', 'i');
        const m = text.match(re);
        if (!m) {
            // currentTier가 peakTier와 같은 경우 — peakTier가 하나만 있을 수도
            const reP = new RegExp(peakTier.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '(?:\\([^)]*\\))?', 'i');
            const mP = text.match(reP);
            if (!mP) return null;
            return text.substring(mP.index + mP[0].length).trim();
        }
        // 마지막 매치 위치 (currentTier가 peakTier와 같은 경우 두번째 위치 사용)
        if (peakTier === currentTier) {
            // 두번째 발생을 찾음
            const allMatches = [...text.matchAll(new RegExp(escaped + '(?:\\([^)]*\\))?', 'gi'))];
            if (allMatches.length >= 2) {
                const last = allMatches[1];
                return text.substring(last.index + last[0].length).trim();
            }
        }
        return text.substring(m.index + m[0].length).trim();
    }

    // 한 영역에서 라인 토큰들 추출
    function extractLanes(text) {
        if (!text) return [];
        const lanes = [];
        const seen = new Set();
        // 공백, 쉼표, 점, 슬래시로 분리
        const tokens = text.split(/[\s,./\\\-]+/).filter(Boolean);
        for (const tok of tokens) {
            // 괄호 안 내용 제거
            const cleaned = tok.replace(/[()]/g, '').trim();
            if (!cleaned) continue;
            // 숫자만 또는 티어 표기는 무시
            if (/^[0-9]+$/.test(cleaned)) continue;
            if (looksLikeTier(cleaned)) continue;
            // 한 토큰이 ㅁㄷㅇㄷ 처럼 붙어있을 수 있음 → 분리
            const split = splitConcatLanes(cleaned);
            for (const s of split) {
                const norm = normalizeLane(s);
                if (norm && !seen.has(norm)) {
                    seen.add(norm);
                    lanes.push(norm);
                }
            }
        }
        return lanes;
    }

    // 붙어있는 라인 분리 (ㅁㄷㅇㄷ → ㅁㄷ + ㅇㄷ, ㅁㄷㅅㅍ → ㅁㄷ + ㅅㅍ)
    function splitConcatLanes(token) {
        if (!token) return [];
        // 우선 토큰 자체가 라인이면 그대로
        if (looksLikeLane(token)) return [token];

        // 초성 2글자씩 끊어서 라인인지 시도
        const result = [];
        let i = 0;
        while (i < token.length) {
            let matched = false;
            // 2글자 시도
            if (i + 2 <= token.length) {
                const two = token.substring(i, i + 2);
                if (looksLikeLane(two)) {
                    result.push(two);
                    i += 2;
                    matched = true;
                    continue;
                }
            }
            // 1글자 시도
            const one = token.substring(i, i + 1);
            if (looksLikeLane(one)) {
                result.push(one);
                i += 1;
                matched = true;
                continue;
            }
            if (!matched) {
                // 못 잘랐으면 토큰 전체를 다시 시도하거나 버림
                if (result.length === 0) return [token];
                i += 1;
            }
        }
        return result.length > 0 ? result : [token];
    }

    // ─── 모드별 검증 ────────────────────────────────────────────────────
    function validateByMode(result, mode) {
        // mode: 'soft' | 'hyperSoft' | 'softLineFixed' | 'hard' | 'hyperHard'
        const needHopeLanes = mode === 'soft' || mode === 'hyperSoft';

        if (!result.tag) {
            result.errors.push('태그가 없음 (#뒤에 KR1 같은 태그)');
        }
        if (result.mainLanes.length === 0) {
            result.errors.push('주 라인을 찾을 수 없음');
        }
        // 희망 라인은 모드와 무관하게 1개 이상이면 OK (주 라인 포함 가능)
        if (needHopeLanes && result.hopeLanes.length < 1) {
            result.errors.push('희망 라인을 1개 이상 적어주세요');
        }
    }

    // ─── public ────────────────────────────────────────────────────────
    global.AuctionParser = {
        parseMember: parseMember,
        normalizeLane: normalizeLane,
        normalizeTier: normalizeTier,
        looksLikeTier: looksLikeTier,
        looksLikeLane: looksLikeLane
    };
})(typeof window !== 'undefined' ? window : global);
