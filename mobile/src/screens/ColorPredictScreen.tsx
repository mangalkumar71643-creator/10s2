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

// The tab1 "unselect" white patch (below) needs to reach slightly past the
// column's nominal boundary (149) and bottom (700): the source photo still
// has a few px of green anti-aliasing on the right and a faint shadow
// tint at the bottom before it's genuinely flat white there. 160 stays
// well clear of the neighboring "30S" tab's icon, which starts at 175.
const TAB1_PATCH_RIGHT = 160;
const TAB1_PATCH_BOTTOM = 708;

// Unselected "1Min" tab artwork: the source photo (222x293) has a white
// margin and a faint border line around its actual icon+text content, which
// showed up as a visible seam/edge when the whole photo was stretched into
// the tab slot. Instead we paint the tab's whole column white (matching the
// real card background, sampled as pure rgb(255,255,255) under the other
// unselected tabs) and draw only the tightly-cropped icon+text content on
// top, scaled/positioned to match the neighboring tabs' real icon and text
// placement exactly (measured off the "30S" tab, one column to the right).
const TAB1_ICON_SRC_W = 222;
const TAB1_ICON_SRC_H = 293;
const TAB1_ICON_CROP: Box = { left: 35, top: 25, width: 152, height: 232 };
const TAB1_ICON_TARGET: Box = { left: 44, top: 558, width: 85, height: 130 };

// The selected-tab green pill sits inset by 4px on each side within its
// column, spanning the same rows (536-688) as tab1's own baked-in selected
// pill — matched so a real per-duration asset (like the 30S one below)
// lines up exactly with that native artwork when swapped in.
function selectedPillBox(i: number): Box {
  // Width/height match tab1's own baked-in selected pill exactly (measured
  // as 126x152, asymmetrically inset — 4px on the left, ~flush on the
  // right) rather than a symmetric "column width minus a margin" guess,
  // which came out ~5px narrower and visibly smaller than the real pill.
  return { left: DURATION_TAB_X[i] + 4, top: 536, width: 126, height: 152 };
}

// Per user request, the 30S selected pill is sized 126x160 (8px taller
// than the generic 126x152 pill above) rather than matching it exactly.
const TAB_30S_PILL_BOX: Box = { left: DURATION_TAB_X[1] + 4, top: 536, width: 134, height: 172 };

// Same treatment, same 134x172 size, for the "3Min" tab's selected pill.
const TAB_3MIN_PILL_BOX: Box = { left: DURATION_TAB_X[2] + 4, top: 536, width: 134, height: 172 };

// Same again for the (already correctly labeled) "5Min" and "10Min" tabs.
const TAB_5MIN_PILL_BOX: Box = { left: DURATION_TAB_X[3] + 4, top: 536, width: 134, height: 172 };
const TAB_10MIN_PILL_BOX: Box = { left: DURATION_TAB_X[4] + 4, top: 536, width: 134, height: 172 };

// Per-duration real selected-pill artwork, indexed by DURATION_ORDER
// position; a tab without a supplied asset yet falls back to tinting its
// own baked (mislabeled, for index 2) unselected artwork green instead.
const SELECTED_PILL_ASSETS: Array<{ source: ReturnType<typeof require>; box: Box } | null> = [
  null,
  { source: require('../../assets/wingo-tab-30s-green.jpg'), box: TAB_30S_PILL_BOX },
  { source: require('../../assets/wingo-tab-3min-green.jpg'), box: TAB_3MIN_PILL_BOX },
  { source: require('../../assets/wingo-tab-5min-green.jpg'), box: TAB_5MIN_PILL_BOX },
  { source: require('../../assets/wingo-tab-10min-green.jpg'), box: TAB_10MIN_PILL_BOX },
];

// The base image's third duration tab (backend 180s = 3 minutes) is baked
// in reading "5Min", duplicating the fourth tab's real 300s/5Min label.
// Swapping in a whole replacement icon made that tab visibly bigger than
// its neighbors, so instead just patch over the "5" digit itself (measured
// tight to that glyph, x:322-330 y:674-688, safely inside the blank gap
// before "Min" starts at x:332 and below "Win Go"'s baseline at y:661)
// with matching white and draw a "3" in its place — everything else
// (icon, "Win Go", "Min") is untouched. The patch is sized generously
// around the glyph rather than tight to it, since the drawn "3" needs
// real room to render at the reference glyph's actual ~15px ink height.
const TAB3_DIGIT_PATCH: Box = { left: 317, top: 669, width: 14, height: 24 };

function tab1IconImageStyle(scale: number) {
  const refScale = TAB1_ICON_TARGET.width / TAB1_ICON_CROP.width;
  return {
    position: 'absolute' as const,
    left: -TAB1_ICON_CROP.left * refScale * scale,
    top: -TAB1_ICON_CROP.top * refScale * scale,
    width: TAB1_ICON_SRC_W * refScale * scale,
    height: TAB1_ICON_SRC_H * refScale * scale,
  };
}

// Ticket bar (How to play / Time remaining).
const HOWTOPLAY_BOX: Box = { left: 18, top: 733, width: 326, height: 204 };
const COUNTDOWN_BOX: Box = { left: 342, top: 800, width: 323, height: 60 };

// Recent-results strip under "How to play" (left half of the ticket): a
// duration label plus the last 5 winning numbers as small colored balls —
// matches the reference site's "WinGo 1 minute" + 5-ball row in the same
// spot, built from real history data rather than a static image.
const RECENT_LABEL_BOX: Box = { left: HOWTOPLAY_BOX.left + 10, top: 800, width: 300, height: 40 };
const RECENT_BALL_DIAMETER = 48;
const RECENT_BALL_GAP = 14;
const RECENT_BALL_TOP = 848;
const RECENT_BALL_LEFT = HOWTOPLAY_BOX.left + 10;
const DURATION_LABEL: Record<ColorGameDuration, string> = { 60: '1Min', 30: '30S', 180: '3Min', 300: '5Min', 600: '10Min' };

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
// The unselected artwork's target box is widened on both sides: the
// baked green tab's edges anti-alias from x:45-47 (left) and x:518-522
// (right), so stopping exactly at the nominal 48-520 bounds left thin
// green slivers showing on both sides.
const GAME_TAB_UNSELECTED_TARGET: Box = { left: 43, top: HISTORY_TAB_Y, width: 481, height: HISTORY_TAB_H };
const CHART_TAB_BOX: Box = { left: 564, top: HISTORY_TAB_Y, width: 472, height: HISTORY_TAB_H };
const MY_TAB_BOX: Box = { left: 1076, top: HISTORY_TAB_Y, width: 472, height: HISTORY_TAB_H };
const TAB_UNSELECTED_BG = 'rgb(231,231,231)';

// Measured directly off the divider lines in the image — the header (with
// "Period/Number/Big Small/Color") is much taller than it first looked,
// ending around y=443, not ~330; using the wrong top pushed every row up
// into the one above it (row 1 into the header itself).
const TABLE_ROW_TOP = 443;
const TABLE_ROW_BOTTOM = 1980;
// The background image has faint but real divider lines baked in at
// y≈609,780,952,1123,1294,1466,1637,1808,1979 — a fixed 9-row grid.
// TABLE_ROWS_PER_PAGE must match that exactly, or row content stops
// landing between the printed lines and instead straddles them.
const TABLE_ROWS_PER_PAGE = 9;
const TABLE_ROW_HEIGHT = (TABLE_ROW_BOTTOM - TABLE_ROW_TOP) / TABLE_ROWS_PER_PAGE;
// Header text cluster centers, detected directly from the white "Period /
// Number / Big Small / Color" pixels — the earlier values were measured
// wrong (too far left), which is why every column drifted from its own
// header.
const TABLE_COL_CENTER = { period: 297, number: 704, bigSmall: 1015, color: 1360 };

// "Chart" tab: unlike "Game history" (baked in as permanently selected),
// this tab is baked in unselected (gray) by default, so it only needs a
// real green asset swapped on TOP when picked — no white patch/unselect
// artwork required.
const CHART_TAB_SELECTED_BOX: Box = { left: CHART_TAB_BOX.left + 4, top: HISTORY_TAB_Y + 4, width: 464, height: 155 };
const MY_TAB_SELECTED_BOX: Box = { left: MY_TAB_BOX.left + 4, top: HISTORY_TAB_Y + 4, width: 464, height: 155 };

// The chart tab has no baked layout to overlay — it's drawn entirely as
// plain React elements over a white patch covering the table area, sized
// to fit the same vertical span the normal table rows/header occupy
// (below the tab row at y=205, down to the same table bottom at 1980).
const CHART_AREA_TOP = HISTORY_TAB_Y + HISTORY_TAB_H + 5;
const CHART_AREA_BOTTOM = TABLE_ROW_BOTTOM;
const CHART_ROAD_TOP = CHART_AREA_TOP + 95;
// Same row density as the main history table, for visual consistency.
const CHART_ROWS_PER_PAGE = 10;
const CHART_ROW_HEIGHT = (CHART_AREA_BOTTOM - CHART_ROAD_TOP) / CHART_ROWS_PER_PAGE;
const CHART_PERIOD_BOX: Box = { left: 20, top: 0, width: 280, height: 0 };
const CHART_CIRCLE_DIAMETER = 60;
const CHART_COL_LEFT = 330;
const CHART_COL_SPACING = 98;
const CHART_COL_X = Array.from({ length: 10 }, (_, i) => CHART_COL_LEFT + i * CHART_COL_SPACING);
const CHART_BADGE_LEFT = 1360;
const CHART_BADGE_DIAMETER = 64;
const CHART_LINE_THICKNESS = 4;
const CHART_LINE_COLOR = '#E24B3F';
const BADGE_BIG_COLOR = '#F0B93D';
const BADGE_SMALL_COLOR = '#4A90D9';

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
type HistoryTab = 'game' | 'chart' | 'my';

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
  const recentResults = Array.from({ length: 5 }, (_, i) => history[i]?.resultNumber ?? null);

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

  const chartTotalPages = Math.max(1, Math.ceil(rows.length / CHART_ROWS_PER_PAGE));
  const chartPageRows = rows.slice(page * CHART_ROWS_PER_PAGE, page * CHART_ROWS_PER_PAGE + CHART_ROWS_PER_PAGE);

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
            <>
              <View
                pointerEvents="none"
                style={[
                  boxStyle(
                    { left: DURATION_TAB_X[0], top: DURATION_TAB_Y, width: TAB1_PATCH_RIGHT - DURATION_TAB_X[0], height: TAB1_PATCH_BOTTOM - DURATION_TAB_Y },
                    scaleTop
                  ),
                  { backgroundColor: '#ffffff', borderTopLeftRadius: 14 },
                ]}
              />
              <View pointerEvents="none" style={[boxStyle(TAB1_ICON_TARGET, scaleTop), styles.tab1IconClip]}>
                <Image
                  source={require('../../assets/wingo-tab-1min-white.jpg')}
                  style={tab1IconImageStyle(scaleTop)}
                />
              </View>
            </>
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
            SELECTED_PILL_ASSETS[durationTabIndex] ? (
              <View pointerEvents="none" style={boxStyle(SELECTED_PILL_ASSETS[durationTabIndex]!.box, scaleTop)}>
                <Image
                  source={SELECTED_PILL_ASSETS[durationTabIndex]!.source}
                  resizeMode="stretch"
                  style={[
                    boxStyle(
                      { left: 0, top: 0, width: SELECTED_PILL_ASSETS[durationTabIndex]!.box.width, height: SELECTED_PILL_ASSETS[durationTabIndex]!.box.height },
                      scaleTop
                    ),
                    styles.selectedPillImage,
                  ]}
                />
              </View>
            ) : (
              <View pointerEvents="none" style={[boxStyle(selectedPillBox(durationTabIndex), scaleTop), styles.selectedTabHighlight]} />
            )
          ) : null}
          {durationTabIndex !== 2 ? (
            <>
              <View pointerEvents="none" style={[boxStyle(TAB3_DIGIT_PATCH, scaleTop), { backgroundColor: '#ffffff' }]} />
              <Text pointerEvents="none" style={[boxStyle(TAB3_DIGIT_PATCH, scaleTop), styles.tab3DigitText, { fontSize: scaleTop * 20 }]}>
                3
              </Text>
            </>
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
          <Text style={[boxStyle(RECENT_LABEL_BOX, scaleTop), styles.recentLabelText, { fontSize: scaleTop * 26 }]}>
            WinGo {DURATION_LABEL[duration]}
          </Text>
          {recentResults.map((n, i) => {
            const left = RECENT_BALL_LEFT + i * (RECENT_BALL_DIAMETER + RECENT_BALL_GAP);
            const box: Box = { left, top: RECENT_BALL_TOP, width: RECENT_BALL_DIAMETER, height: RECENT_BALL_DIAMETER };
            return (
              <View
                key={i}
                pointerEvents="none"
                style={[
                  boxStyle(box, scaleTop),
                  {
                    borderRadius: (RECENT_BALL_DIAMETER * scaleTop) / 2,
                    backgroundColor: n == null ? '#D8DEDB' : primaryColorHexForNumber(n),
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                {n != null ? <Text style={{ fontSize: scaleTop * 24, fontWeight: '700', color: '#FFFFFF' }}>{n}</Text> : null}
              </View>
            );
          })}

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
              swap in the real unselected-style artwork when "My history"
              is picked instead, rather than blanking or redrawing the tab. */}
          {historyTab !== 'game' ? (
            <View pointerEvents="none" style={boxStyle(GAME_TAB_UNSELECTED_TARGET, scaleBottom)}>
              <Image
                source={require('../../assets/wingo-history-game-unselected.jpg')}
                resizeMode="stretch"
                style={boxStyle({ left: 0, top: 0, width: GAME_TAB_UNSELECTED_TARGET.width, height: GAME_TAB_UNSELECTED_TARGET.height }, scaleBottom)}
              />
            </View>
          ) : null}
          <Pressable style={boxStyle(GAME_TAB_BOX, scaleBottom)} onPress={() => setHistoryTab('game')} />
          <Pressable style={boxStyle(CHART_TAB_BOX, scaleBottom)} onPress={() => setHistoryTab('chart')} />
          <Pressable style={boxStyle(MY_TAB_BOX, scaleBottom)} onPress={() => setHistoryTab('my')} />
          {/* "Chart" is baked in unselected (gray) by default — unlike "Game
              history" it needs no unselect patch, just the real green
              asset on top when it's the active tab. */}
          {historyTab === 'chart' ? (
            <Image
              source={require('../../assets/wingo-history-chart-selected.jpg')}
              resizeMode="stretch"
              style={boxStyle(CHART_TAB_SELECTED_BOX, scaleBottom)}
            />
          ) : null}
          {/* Same deal for "My history" — baked in unselected by default,
              real green asset swapped on top when it's the active tab. */}
          {historyTab === 'my' ? (
            <Image
              source={require('../../assets/wingo-history-my-selected.jpg')}
              resizeMode="stretch"
              style={boxStyle(MY_TAB_SELECTED_BOX, scaleBottom)}
            />
          ) : null}

          {/* Table rows */}
          {historyTab !== 'chart' && pageRows.map((row, i) => {
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

          {/* Chart tab — no baked layout for this exists in the source
              image, so it's a plain white patch over the table area with
              a period-by-period road map (each round's winning number,
              connected round-to-round by a red line). */}
          {historyTab === 'chart' ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  boxStyle({ left: 0, top: CHART_AREA_TOP, width: 1595, height: CHART_AREA_BOTTOM - CHART_AREA_TOP }, scaleBottom),
                  { backgroundColor: '#ffffff' },
                ]}
              />

              {/* Road map rows */}
              {chartPageRows.map((row, i) => {
                const rowTop = CHART_ROAD_TOP + i * CHART_ROW_HEIGHT;
                const rowCenter = rowTop + CHART_ROW_HEIGHT / 2;
                const nextRow = chartPageRows[i + 1];
                return (
                  <React.Fragment key={row.key}>
                    <Text
                      style={[
                        styles.tableCell,
                        { left: CHART_PERIOD_BOX.left * scaleBottom, width: CHART_PERIOD_BOX.width * scaleBottom, top: (rowCenter - 24) * scaleBottom, fontSize: 38 * scaleBottom },
                      ]}
                    >
                      {row.period.slice(-8)}
                    </Text>
                    {Array.from({ length: 10 }, (_, digit) => {
                      const hit = row.number === digit;
                      const color = primaryColorHexForNumber(digit);
                      return (
                        <View
                          key={digit}
                          pointerEvents="none"
                          style={[
                            boxStyle(
                              { left: CHART_COL_X[digit] - CHART_CIRCLE_DIAMETER / 2, top: rowCenter - CHART_CIRCLE_DIAMETER / 2, width: CHART_CIRCLE_DIAMETER, height: CHART_CIRCLE_DIAMETER },
                              scaleBottom
                            ),
                            {
                              borderRadius: (CHART_CIRCLE_DIAMETER * scaleBottom) / 2,
                              backgroundColor: hit ? color : 'transparent',
                              borderWidth: hit ? 0 : 1.5,
                              borderColor: '#D8DEDB',
                              alignItems: 'center',
                              justifyContent: 'center',
                            },
                          ]}
                        >
                          <Text style={{ fontSize: 32 * scaleBottom, fontWeight: '700', color: hit ? '#FFFFFF' : '#C7CDCA' }}>{digit}</Text>
                        </View>
                      );
                    })}
                    {row.number != null && nextRow?.number != null
                      ? (() => {
                          const x1 = CHART_COL_X[row.number!];
                          const x2 = CHART_COL_X[nextRow.number!];
                          const y1 = rowCenter;
                          const y2 = rowCenter + CHART_ROW_HEIGHT;
                          const dx = x2 - x1;
                          const dy = y2 - y1;
                          const length = Math.sqrt(dx * dx + dy * dy);
                          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                          return (
                            <View
                              pointerEvents="none"
                              style={[
                                boxStyle({ left: x1, top: y1, width: length, height: CHART_LINE_THICKNESS }, scaleBottom),
                                {
                                  backgroundColor: CHART_LINE_COLOR,
                                  transform: [{ rotate: `${angle}deg` }],
                                  transformOrigin: '0% 50%',
                                },
                              ]}
                            />
                          );
                        })()
                      : null}
                    {row.size ? (
                      <View
                        pointerEvents="none"
                        style={[
                          boxStyle(
                            { left: CHART_BADGE_LEFT, top: rowCenter - CHART_BADGE_DIAMETER / 2, width: CHART_BADGE_DIAMETER, height: CHART_BADGE_DIAMETER },
                            scaleBottom
                          ),
                          {
                            borderRadius: (CHART_BADGE_DIAMETER * scaleBottom) / 2,
                            backgroundColor: row.size === 'BIG' ? BADGE_BIG_COLOR : BADGE_SMALL_COLOR,
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 32 * scaleBottom, fontWeight: '700', color: '#FFFFFF' }}>{row.size === 'BIG' ? 'B' : 'S'}</Text>
                      </View>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </>
          ) : null}

          <Pressable
            style={boxStyle(PAGE_LEFT_BOX, scaleBottom)}
            onPress={() => setPage((p) => Math.max(0, p - 1))}
          />
          <Pressable
            style={boxStyle(PAGE_RIGHT_BOX, scaleBottom)}
            onPress={() => setPage((p) => Math.min((historyTab === 'chart' ? chartTotalPages : totalPages) - 1, p + 1))}
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
  recentLabelText: {
    position: 'absolute',
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tab1IconClip: {
    overflow: 'hidden',
  },
  tab3DigitText: {
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#8a8a8a',
    fontWeight: '400',
  },
  selectedPillImage: {
    borderRadius: 14,
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
