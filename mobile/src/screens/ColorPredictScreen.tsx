import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ApiClientError } from '../api/client';
import {
  ColorGameBetType,
  ColorGameConfig,
  ColorGameDuration,
  ColorGameHistoryEntry,
  ColorGameMyBet,
  ColorGameRoundView,
  fetchColorGameConfig,
  fetchColorGameCurrentRound,
  fetchColorGameHistory,
  fetchColorGameMyBets,
  placeColorGameBet,
} from '../api/backend';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';

// ---- Reference images & shared geometry helpers -----------------------
//
// Both screenshots are used as-is (per earlier request); every interactive
// element below is an invisible hotspot positioned over it, measured
// directly off the image pixels (see the crops used to derive these numbers
// during development). Coordinates are in each image's own pixel space —
// a `scale` factor (deviceWidth / referenceWidth) converts them at render
// time so hit targets and overlays track the image at any screen size.

const TOP_REF_WIDTH = 688;
const TOP_ASPECT = 688 / 1504;
const BOTTOM_ASPECT = 1595 / 2636;

type Box = { left: number; top: number; width: number; height: number };

function boxStyle(box: Box, scale: number) {
  return {
    position: 'absolute' as const,
    left: box.left * scale,
    top: box.top * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

// ---- TOP image hotspots (688x1504) -------------------------------------

const BACK_BOX: Box = { left: 8, top: 68, width: 65, height: 68 };
const HEADSET_BOX: Box = { left: 528, top: 68, width: 74, height: 68 };
const FAIRNESS_BOX: Box = { left: 598, top: 68, width: 74, height: 68 };
const WITHDRAW_BOX: Box = { left: 78, top: 383, width: 244, height: 74 };
const DEPOSIT_BOX: Box = { left: 358, top: 383, width: 254, height: 74 };

// Reference balance overlay position (above the "Wallet balance" label).
const BALANCE_CENTER_Y = 250;

// Grok watermark patch (bottom-right of the top image).
const WATERMARK_LEFT = 620;
const WATERMARK_TOP = 1465;
const WATERMARK_BG_TOP = 'rgb(248,247,253)';
const WATERMARK_BG_BOTTOM = 'rgb(253,253,255)';

// Duration tabs: 5 equal columns: "1Min"(default selected, backend 60s),
// "30S"(30s), "5Min"(mislabeled in the mockup, actually backend 180s/3min),
// "5Min"(300s/5min), "10Min"(600s) — all 5 backend durations stay reachable
// even though two tab labels read the same.
const DURATION_ORDER: ColorGameDuration[] = [60, 30, 180, 300, 600];
const DURATION_TAB_X = [20, 149, 278, 407, 536, 665];
const DURATION_TAB_Y = 535;
const DURATION_TAB_H = 165;
const DEFAULT_DURATION_TAB_HIGHLIGHT: Box = { left: 24, top: 536, width: 126, height: 152 };

// Ticket bar (How to play / Time remaining).
const HOWTOPLAY_BOX: Box = { left: 18, top: 733, width: 326, height: 204 };
const COUNTDOWN_BOX: Box = { left: 342, top: 800, width: 323, height: 60 };

// Green / Violet / Red category buttons.
const GREEN_BOX: Box = { left: 28, top: 983, width: 200, height: 64 };
const VIOLET_BOX: Box = { left: 238, top: 983, width: 204, height: 64 };
const RED_BOX: Box = { left: 452, top: 983, width: 200, height: 64 };

// Number grid: 5 columns x 2 rows.
const NUMBER_COL_X = [52, 168, 282, 397, 512, 627];
const NUMBER_ROW_Y = [1085, 1215, 1345];
const NUMBER_COL_CENTER = [110, 225, 340, 455, 570];
const NUMBER_ROW_BALL_CENTER_Y = [1137, 1265];
const NUMBER_BALL_DIAMETER = 88;

// Random + multiplier chips.
const RANDOM_BOX: Box = { left: 18, top: 1346, width: 168, height: 72 };
const MULTIPLIER_X = [184, 272, 337, 416, 494, 569, 660];
const MULTIPLIER_VALUES = [1, 5, 10, 20, 50, 100] as const;
const MULTIPLIER_Y = 1346;
const MULTIPLIER_H = 72;
const DEFAULT_MULTIPLIER_HIGHLIGHT: Box = { left: 188, top: 1346, width: 70, height: 72 };
const CHIP_BG = 'rgb(240,240,240)';

// Big / Small split bar.
const BIGSMALL_Y = 1435;
const BIGSMALL_H = 69;
const BIG_BOX: Box = { left: 62, top: BIGSMALL_Y, width: 279, height: BIGSMALL_H };
const SMALL_BOX: Box = { left: 341, top: BIGSMALL_Y, width: 278, height: BIGSMALL_H };

// ---- BOTTOM image hotspots (1595x2636, already cropped) ----------------

// Re-measured from the actual button color edges (previous values were
// guessed too narrow/too far left, so the "My history" highlight was
// landing on top of "Chart" instead).
const HISTORY_TAB_Y = 40;
const HISTORY_TAB_H = 165;
const GAME_TAB_BOX: Box = { left: 48, top: HISTORY_TAB_Y, width: 472, height: HISTORY_TAB_H };
const CHART_TAB_BOX: Box = { left: 564, top: HISTORY_TAB_Y, width: 472, height: HISTORY_TAB_H };
const MY_TAB_BOX: Box = { left: 1076, top: HISTORY_TAB_Y, width: 472, height: HISTORY_TAB_H };
const TAB_UNSELECTED_BG = 'rgb(231,231,231)';

// Measured directly off the divider lines in the image — the header (with
// "Period/Number/Big Small/Color") is much taller than it first looked,
// ending around y=443, not ~330; using the wrong top pushed every row up
// into the one above it (row 1 into the header itself).
const TABLE_ROW_TOP = 443;
const TABLE_ROW_BOTTOM = 1980;
const TABLE_ROWS_PER_PAGE = 9;
const TABLE_ROW_HEIGHT = (TABLE_ROW_BOTTOM - TABLE_ROW_TOP) / TABLE_ROWS_PER_PAGE;
// Header text cluster centers, detected directly from the white "Period /
// Number / Big Small / Color" pixels — the earlier values were measured
// wrong (too far left), which is why every column drifted from its own
// header.
const TABLE_COL_CENTER = { period: 297, number: 704, bigSmall: 1015, color: 1360 };

// Font sizes below are in the same 1595-wide reference-pixel space as every
// other measurement on this image, so `* scaleBottom` grows them with the
// image instead of shrinking them to a fraction of a real dp (that was the
// earlier bug — sizes like "28" were being treated as already-final dp
// values and then multiplied by a ~0.25 scale factor on top).
const PERIOD_FONT = 56;
const NUMBER_FONT = 120;
const BIGSMALL_FONT = 68;
const DOT_DIAMETER = 56;
const NUMBER_CELL_WIDTH = 220;

// Also re-measured from the actual arrow button color edges.
const PAGE_LEFT_BOX: Box = { left: 415, top: 2290, width: 170, height: 165 };
const PAGE_RIGHT_BOX: Box = { left: 1010, top: 2290, width: 170, height: 165 };

// ---- Game logic helpers (unchanged rules) -------------------------------

function colorsForNumber(n: number): Array<'GREEN' | 'RED' | 'VIOLET'> {
  if (n === 0) return ['VIOLET', 'RED'];
  if (n === 5) return ['VIOLET', 'GREEN'];
  return [2, 4, 6, 8].includes(n) ? ['RED'] : ['GREEN'];
}

const CATEGORY_HEX: Record<'GREEN' | 'RED' | 'VIOLET', string> = {
  GREEN: '#2FBE6B',
  RED: '#E24B3F',
  VIOLET: '#9B59D9',
};

function primaryColorHexForNumber(n: number): string {
  return CATEGORY_HEX[colorsForNumber(n)[0]];
}

// Dot order for the "Color" column: violet always drawn last (the plain
// green/red dot leads for the mixed 0 and 5 rows) — matches how the
// reference table lays these out.
function colorDotsForNumber(n: number): Array<'GREEN' | 'RED' | 'VIOLET'> {
  const cs = colorsForNumber(n);
  if (cs.length === 1) return cs;
  return cs[0] === 'VIOLET' ? [cs[1], cs[0]] : cs;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Selection = { betType: ColorGameBetType; betValue: string; label: string; multiplierLabel: string } | null;
type HistoryTab = 'game' | 'my';

export default function ColorPredictScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const scaleTop = width / TOP_REF_WIDTH;
  const topImageHeight = width / TOP_ASPECT;
  const bottomImageHeight = width / BOTTOM_ASPECT;

  const [config, setConfig] = useState<ColorGameConfig | null>(null);
  const [duration, setDuration] = useState<ColorGameDuration>(60);
  const [round, setRound] = useState<ColorGameRoundView | null>(null);
  const [history, setHistory] = useState<ColorGameHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<ColorGameMyBet[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [multiplier, setMultiplier] = useState<(typeof MULTIPLIER_VALUES)[number]>(1);
  const [placing, setPlacing] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>('game');
  const [page, setPage] = useState(0);

  const roundRef = useRef(round);
  roundRef.current = round;

  const loadRound = useCallback(async (d: ColorGameDuration) => {
    const view = await fetchColorGameCurrentRound(d);
    setRound(view);
  }, []);

  const loadHistory = useCallback(async (d: ColorGameDuration) => {
    const rows = await fetchColorGameHistory(d);
    setHistory(rows);
  }, []);

  const loadMyBets = useCallback(async () => {
    try {
      const rows = await fetchColorGameMyBets();
      setMyBets(rows);
    } catch {
      // not logged in / transient — leave previous list as-is
    }
  }, []);

  useEffect(() => {
    fetchColorGameConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    setRound(null);
    setPage(0);
    loadRound(duration);
    loadHistory(duration);
    loadMyBets();
  }, [duration, loadRound, loadHistory, loadMyBets]);

  useEffect(() => {
    setPage(0);
  }, [historyTab]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = roundRef.current;
      if (!current) return;
      if (current.timeRemainingSeconds <= 0) {
        loadRound(duration);
        loadHistory(duration);
        loadMyBets();
        refreshWallet().catch(() => {});
        return;
      }
      setRound({
        ...current,
        timeRemainingSeconds: current.timeRemainingSeconds - 1,
        locked: current.timeRemainingSeconds - 1 <= (config?.lockSeconds ?? 5),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [duration, loadRound, loadHistory, loadMyBets, refreshWallet, config]);

  const locked = round?.locked ?? true;
  const baseUnit = config?.minStake ?? 5;
  const stake = baseUnit * multiplier;

  function pickRandomNumber() {
    const n = Math.floor(Math.random() * 10);
    setSelection({ betType: 'NUMBER', betValue: String(n), label: `Number ${n}`, multiplierLabel: `${config?.payouts.number ?? 9}X` });
  }

  async function confirmBet() {
    if (!selection || !round) return;
    if (config && (stake < config.minStake || stake > config.maxStake)) {
      Alert.alert('Invalid stake', `Stake must be between ₹${config.minStake} and ₹${config.maxStake}.`);
      return;
    }
    if (round.locked) {
      Alert.alert('Betting closed', 'This round is locked — wait for the next one.');
      return;
    }
    setPlacing(true);
    try {
      await placeColorGameBet(duration, selection.betType, selection.betValue, stake);
      await Promise.all([refreshWallet(), loadMyBets()]);
      Alert.alert('Bet placed', `₹${stake} on ${selection.label} — good luck!`);
      setSelection(null);
    } catch (err) {
      Alert.alert('Bet failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  function goHome() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  }

  const durationTabIndex = DURATION_ORDER.indexOf(duration);
  const multiplierIndex = MULTIPLIER_VALUES.indexOf(multiplier);

  const rows = useMemo(() => {
    if (historyTab === 'my') {
      return myBets.map((bet) => ({
        key: bet.id,
        period: bet.round.periodNumber,
        number: bet.round.resultNumber,
        size: bet.round.resultSize,
        dots: null as Array<'GREEN' | 'RED' | 'VIOLET'> | null,
        rightLabel:
          bet.status === 'PENDING' ? 'Pending' : bet.status === 'WON' ? `+₹${Number(bet.payout)}` : 'Lost',
        rightColor: bet.status === 'WON' ? '#1C8A5C' : bet.status === 'LOST' ? '#E24B3F' : '#7C9089',
      }));
    }
    return history.map((h) => ({
      key: h.periodNumber,
      period: h.periodNumber,
      number: h.resultNumber as number | null,
      size: h.resultSize as 'BIG' | 'SMALL' | null,
      dots: h.resultNumber != null ? colorDotsForNumber(h.resultNumber) : null,
      rightLabel: undefined as string | undefined,
      rightColor: undefined as string | undefined,
    }));
  }, [historyTab, history, myBets]);

  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_ROWS_PER_PAGE));
  const pageRows = rows.slice(page * TABLE_ROWS_PER_PAGE, page * TABLE_ROWS_PER_PAGE + TABLE_ROWS_PER_PAGE);

  const scaleBottom = width / 1595;

  return (
    <View style={styles.root}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* ---------------- TOP IMAGE ---------------- */}
        <View style={{ width, height: topImageHeight }}>
          <Image source={require('../../assets/win-go-screen.jpg')} style={{ width, height: topImageHeight }} resizeMode="cover" />

          {/* Balance overlay */}
          <Text
            style={[styles.balanceText, { top: scaleTop * BALANCE_CENTER_Y - scaleTop * 17, fontSize: scaleTop * 30 }]}
          >
            ₹{coins.toFixed(2)}
          </Text>

          {/* Watermark patch */}
          <LinearGradient
            colors={[WATERMARK_BG_TOP, WATERMARK_BG_BOTTOM]}
            style={{ position: 'absolute', left: scaleTop * WATERMARK_LEFT, top: scaleTop * WATERMARK_TOP, right: 0, bottom: 0 }}
          />

          {/* Header */}
          <Pressable style={boxStyle(BACK_BOX, scaleTop)} onPress={goHome} />
          <Pressable style={boxStyle(HEADSET_BOX, scaleTop)} onPress={() => navigation.navigate('Help')} />
          <Pressable
            style={boxStyle(FAIRNESS_BOX, scaleTop)}
            onPress={() =>
              Alert.alert(
                'Provably fair',
                "Every round's result hash is published before betting opens, and the raw seed is revealed after settlement so you can verify it was never changed."
              )
            }
          />

          {/* Wallet actions */}
          <Pressable style={boxStyle(WITHDRAW_BOX, scaleTop)} onPress={() => navigation.navigate('Withdraw')} />
          <Pressable style={boxStyle(DEPOSIT_BOX, scaleTop)} onPress={() => navigation.navigate('Deposit')} />

          {/* Duration tabs — the "1Min" tab is baked into the image as
              permanently selected (green). When a different duration is
              chosen, swap it for the real unselected-style artwork instead
              of trying to redraw it. */}
          {durationTabIndex !== 0 ? (
            <Image
              source={require('../../assets/wingo-tab-1min-white.jpg')}
              resizeMode="stretch"
              style={boxStyle(DEFAULT_DURATION_TAB_HIGHLIGHT, scaleTop)}
            />
          ) : null}
          {DURATION_ORDER.map((d, i) => {
            const left = DURATION_TAB_X[i];
            const w = DURATION_TAB_X[i + 1] - left;
            return (
              <Pressable
                key={d + '-' + i}
                style={boxStyle({ left, top: DURATION_TAB_Y, width: w, height: DURATION_TAB_H }, scaleTop)}
                onPress={() => setDuration(d)}
              />
            );
          })}
          {durationTabIndex !== 0 ? (
            <View
              pointerEvents="none"
              style={[
                boxStyle(
                  { left: DURATION_TAB_X[durationTabIndex] + 4, top: 536, width: DURATION_TAB_X[durationTabIndex + 1] - DURATION_TAB_X[durationTabIndex] - 8, height: 152 },
                  scaleTop
                ),
                styles.selectedTabHighlight,
              ]}
            />
          ) : null}

          {/* Ticket bar */}
          <Pressable
            style={boxStyle(HOWTOPLAY_BOX, scaleTop)}
            onPress={() =>
              Alert.alert('How to play', 'Pick a number, color, or size before the round locks, then confirm your bet below.')
            }
          />
          <Text style={[boxStyle(COUNTDOWN_BOX, scaleTop), styles.countdownText, { fontSize: scaleTop * 28 }]}>
            {locked ? 'Locked' : round ? formatCountdown(round.timeRemainingSeconds) : '--:--'}
          </Text>

          {/* Category buttons */}
          <Pressable
            style={boxStyle(GREEN_BOX, scaleTop)}
            onPress={() => setSelection({ betType: 'COLOR', betValue: 'GREEN', label: 'Green', multiplierLabel: `${config?.payouts.color ?? 2}X` })}
          />
          <Pressable
            style={boxStyle(VIOLET_BOX, scaleTop)}
            onPress={() => setSelection({ betType: 'COLOR', betValue: 'VIOLET', label: 'Violet', multiplierLabel: `${config?.payouts.violet ?? 4.5}X` })}
          />
          <Pressable
            style={boxStyle(RED_BOX, scaleTop)}
            onPress={() => setSelection({ betType: 'COLOR', betValue: 'RED', label: 'Red', multiplierLabel: `${config?.payouts.color ?? 2}X` })}
          />
          {selection?.betType === 'COLOR' ? (
            <View
              pointerEvents="none"
              style={[
                boxStyle(selection.betValue === 'GREEN' ? GREEN_BOX : selection.betValue === 'VIOLET' ? VIOLET_BOX : RED_BOX, scaleTop),
                styles.selectionOutlineRect,
              ]}
            />
          ) : null}

          {/* Number grid */}
          {[0, 1].map((row) =>
            Array.from({ length: 5 }, (_, col) => {
              const n = row * 5 + col;
              const left = NUMBER_COL_X[col];
              const w = NUMBER_COL_X[col + 1] - left;
              const top = NUMBER_ROW_Y[row];
              const h = NUMBER_ROW_Y[row + 1] - top;
              return (
                <Pressable
                  key={n}
                  style={boxStyle({ left, top, width: w, height: h }, scaleTop)}
                  onPress={() =>
                    setSelection({ betType: 'NUMBER', betValue: String(n), label: `Number ${n}`, multiplierLabel: `${config?.payouts.number ?? 9}X` })
                  }
                />
              );
            })
          )}
          {selection?.betType === 'NUMBER'
            ? (() => {
                const n = Number(selection.betValue);
                const row = n >= 5 ? 1 : 0;
                const col = n % 5;
                const cx = NUMBER_COL_CENTER[col];
                const cy = NUMBER_ROW_BALL_CENTER_Y[row];
                const d = NUMBER_BALL_DIAMETER;
                return (
                  <View
                    pointerEvents="none"
                    style={[
                      boxStyle({ left: cx - d / 2, top: cy - d / 2, width: d, height: d }, scaleTop),
                      styles.selectionOutlineCircle,
                      { borderRadius: (d * scaleTop) / 2 },
                    ]}
                  />
                );
              })()
            : null}

          {/* Random + multiplier */}
          <Pressable style={boxStyle(RANDOM_BOX, scaleTop)} onPress={pickRandomNumber} />
          {/* Same deal as the duration tab above — "X1" is baked in as
              permanently selected, so redraw its label when a different
              multiplier is chosen instead of just blanking it out. */}
          {multiplierIndex !== 0 ? (
            <View
              pointerEvents="none"
              style={[
                boxStyle(DEFAULT_MULTIPLIER_HIGHLIGHT, scaleTop),
                { backgroundColor: CHIP_BG, borderRadius: 14 * scaleTop, alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <Text style={{ color: '#123524', fontSize: 15 * scaleTop, fontWeight: '700' }}>X1</Text>
            </View>
          ) : null}
          {MULTIPLIER_VALUES.map((m, i) => {
            const left = MULTIPLIER_X[i];
            const w = MULTIPLIER_X[i + 1] - left;
            return (
              <Pressable
                key={m}
                style={boxStyle({ left, top: MULTIPLIER_Y, width: w, height: MULTIPLIER_H }, scaleTop)}
                onPress={() => setMultiplier(m)}
              />
            );
          })}
          {multiplierIndex !== 0 ? (
            <View
              pointerEvents="none"
              style={[
                boxStyle({ left: MULTIPLIER_X[multiplierIndex] + 4, top: MULTIPLIER_Y, width: MULTIPLIER_X[multiplierIndex + 1] - MULTIPLIER_X[multiplierIndex] - 8, height: MULTIPLIER_H }, scaleTop),
                styles.selectedChipHighlight,
              ]}
            />
          ) : null}

          {/* Big / Small */}
          <Pressable
            style={boxStyle(BIG_BOX, scaleTop)}
            onPress={() => setSelection({ betType: 'SIZE', betValue: 'BIG', label: 'Big', multiplierLabel: `${config?.payouts.size ?? 2}X` })}
          />
          <Pressable
            style={boxStyle(SMALL_BOX, scaleTop)}
            onPress={() => setSelection({ betType: 'SIZE', betValue: 'SMALL', label: 'Small', multiplierLabel: `${config?.payouts.size ?? 2}X` })}
          />
          {selection?.betType === 'SIZE' ? (
            <View
              pointerEvents="none"
              style={[boxStyle(selection.betValue === 'BIG' ? BIG_BOX : SMALL_BOX, scaleTop), styles.selectionOutlineRect]}
            />
          ) : null}
        </View>

        {/* ---------------- BOTTOM IMAGE ---------------- */}
        <View style={{ width, height: bottomImageHeight }}>
          <Image
            source={require('../../assets/win-go-screen-bottom.jpg')}
            style={{ width, height: bottomImageHeight }}
            resizeMode="cover"
          />

          {/* "Game history" is baked in as permanently selected (green) —
              redraw its label in the plain unselected style when "My
              history" is picked instead, rather than blanking the tab. */}
          {historyTab !== 'game' ? (
            <View
              pointerEvents="none"
              style={[
                boxStyle(GAME_TAB_BOX, scaleBottom),
                { backgroundColor: TAB_UNSELECTED_BG, borderRadius: 14 * scaleBottom, alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <Text style={{ color: '#3A4744', fontSize: 30 * scaleBottom, fontWeight: '400' }}>Game history</Text>
            </View>
          ) : null}
          <Pressable style={boxStyle(GAME_TAB_BOX, scaleBottom)} onPress={() => setHistoryTab('game')} />
          <Pressable
            style={boxStyle(CHART_TAB_BOX, scaleBottom)}
            onPress={() => Alert.alert('Chart', 'Chart view is coming soon.')}
          />
          <Pressable style={boxStyle(MY_TAB_BOX, scaleBottom)} onPress={() => setHistoryTab('my')} />
          {historyTab === 'my' ? (
            <View pointerEvents="none" style={[boxStyle(MY_TAB_BOX, scaleBottom), styles.selectedHistoryTabHighlight]} />
          ) : null}

          {/* Table rows */}
          {pageRows.map((row, i) => {
            const rowTop = TABLE_ROW_TOP + i * TABLE_ROW_HEIGHT;
            const rowCenter = rowTop + TABLE_ROW_HEIGHT / 2;
            const numberCellHeight = NUMBER_FONT * 1.3;
            return (
              <React.Fragment key={row.key}>
                <Text
                  style={[
                    styles.tableCell,
                    {
                      left: (TABLE_COL_CENTER.period - 190) * scaleBottom,
                      width: 380 * scaleBottom,
                      top: (rowCenter - PERIOD_FONT * 0.6) * scaleBottom,
                      fontSize: PERIOD_FONT * scaleBottom,
                    },
                  ]}
                >
                  {row.period.slice(-8)}
                </Text>
                <View
                  style={{
                    position: 'absolute',
                    left: (TABLE_COL_CENTER.number - NUMBER_CELL_WIDTH / 2) * scaleBottom,
                    width: NUMBER_CELL_WIDTH * scaleBottom,
                    top: (rowCenter - numberCellHeight / 2) * scaleBottom,
                    height: numberCellHeight * scaleBottom,
                  }}
                >
                  {row.number == null ? (
                    <Text style={[styles.numberCellText, { width: NUMBER_CELL_WIDTH * scaleBottom, fontSize: NUMBER_FONT * scaleBottom, color: '#7C9089' }]}>
                      -
                    </Text>
                  ) : colorsForNumber(row.number).length === 1 ? (
                    <Text
                      style={[
                        styles.numberCellText,
                        { width: NUMBER_CELL_WIDTH * scaleBottom, fontSize: NUMBER_FONT * scaleBottom, color: primaryColorHexForNumber(row.number) },
                      ]}
                    >
                      {row.number}
                    </Text>
                  ) : (
                    // Mixed number (0 or 5): draw the digit twice at the exact
                    // same position, clip the top copy to its left half — the
                    // same split-color digit the reference table uses.
                    <>
                      <Text
                        style={[
                          styles.numberCellText,
                          { width: NUMBER_CELL_WIDTH * scaleBottom, fontSize: NUMBER_FONT * scaleBottom, color: CATEGORY_HEX[colorsForNumber(row.number)[1]] },
                        ]}
                      >
                        {row.number}
                      </Text>
                      <View style={{ position: 'absolute', left: 0, top: 0, width: (NUMBER_CELL_WIDTH / 2) * scaleBottom, height: '100%', overflow: 'hidden' }}>
                        <Text
                          style={[
                            styles.numberCellText,
                            { width: NUMBER_CELL_WIDTH * scaleBottom, fontSize: NUMBER_FONT * scaleBottom, color: CATEGORY_HEX[colorsForNumber(row.number)[0]] },
                          ]}
                        >
                          {row.number}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tableCell,
                    {
                      left: (TABLE_COL_CENTER.bigSmall - 140) * scaleBottom,
                      width: 280 * scaleBottom,
                      top: (rowCenter - BIGSMALL_FONT * 0.6) * scaleBottom,
                      fontSize: BIGSMALL_FONT * scaleBottom,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {row.size ?? '-'}
                </Text>
                {row.dots ? (
                  <View
                    style={{
                      position: 'absolute',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 10 * scaleBottom,
                      left: (TABLE_COL_CENTER.color - 110) * scaleBottom,
                      width: 220 * scaleBottom,
                      top: (rowCenter - DOT_DIAMETER / 2) * scaleBottom,
                      height: DOT_DIAMETER * scaleBottom,
                    }}
                  >
                    {row.dots.map((c, di) => (
                      <View
                        key={di}
                        style={{
                          width: DOT_DIAMETER * scaleBottom,
                          height: DOT_DIAMETER * scaleBottom,
                          borderRadius: (DOT_DIAMETER * scaleBottom) / 2,
                          backgroundColor: CATEGORY_HEX[c],
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        left: (TABLE_COL_CENTER.color - 110) * scaleBottom,
                        width: 220 * scaleBottom,
                        top: (rowCenter - BIGSMALL_FONT * 0.5) * scaleBottom,
                        fontSize: BIGSMALL_FONT * 0.8 * scaleBottom,
                        fontWeight: '700',
                        color: row.rightColor,
                      },
                    ]}
                  >
                    {row.rightLabel}
                  </Text>
                )}
              </React.Fragment>
            );
          })}

          <Pressable
            style={boxStyle(PAGE_LEFT_BOX, scaleBottom)}
            onPress={() => setPage((p) => Math.max(0, p - 1))}
          />
          <Pressable
            style={boxStyle(PAGE_RIGHT_BOX, scaleBottom)}
            onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          />
        </View>
      </ScrollView>

      {selection ? (
        <View style={styles.confirmBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmLabel} numberOfLines={1}>
              {selection.label} ({selection.multiplierLabel}) · x{multiplier} = ₹{stake}
            </Text>
          </View>
          <Pressable onPress={() => setSelection(null)} style={styles.confirmCancel}>
            <MaterialCommunityIcons name="close" size={18} color="#7C9089" />
          </Pressable>
          <Pressable onPress={confirmBet} disabled={placing || locked} style={[styles.confirmButton, { opacity: placing || locked ? 0.5 : 1 }]}>
            <Text style={styles.confirmButtonText}>{placing ? 'Placing…' : 'Place Bet'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  balanceText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#1C8A5C',
    fontWeight: '800',
  },
  countdownText: {
    position: 'absolute',
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '800',
  },
  selectedTabHighlight: {
    borderWidth: 3,
    borderColor: '#1C8A5C',
    borderRadius: 14,
    backgroundColor: 'rgba(28,138,92,0.12)',
  },
  selectedChipHighlight: {
    borderWidth: 3,
    borderColor: '#1C8A5C',
    borderRadius: 12,
    backgroundColor: 'rgba(28,138,92,0.12)',
  },
  selectionOutlineRect: {
    borderWidth: 4,
    borderColor: '#F0B93D',
    borderRadius: 14,
  },
  selectionOutlineCircle: {
    borderWidth: 4,
    borderColor: '#F0B93D',
  },
  selectedHistoryTabHighlight: {
    borderWidth: 3,
    borderColor: '#1C8A5C',
    borderRadius: 14,
    backgroundColor: 'rgba(28,138,92,0.12)',
  },
  tableCell: {
    position: 'absolute',
    color: '#123524',
    textAlign: 'center',
  },
  numberCellText: {
    position: 'absolute',
    left: 0,
    top: 0,
    textAlign: 'center',
    fontWeight: '800',
  },
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E1E7E4',
  },
  confirmLabel: { color: '#123524', fontSize: 13, fontWeight: '700' },
  confirmCancel: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  confirmButton: { borderRadius: 14, backgroundColor: '#0F4D34', paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  confirmButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
});
