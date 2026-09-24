import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  MinesConfig,
  MinesRound,
  cashOutMinesRound,
  fetchMinesConfig,
  fetchMinesCurrent,
  fetchMinesHistory,
  revealMinesTile,
  startMinesRound,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const TILE_COUNT = 25;
const COLUMNS = 5;
const DEFAULT_MINES = 3;
const DEFAULT_STAKE = 10;
// -/+ step through these; the coin button offers the quick presets.
const STAKE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const QUICK_STAKES = [10, 50, 100, 500];

const SCREEN_WIDTH = Dimensions.get('window').width;
const BOARD_GAP = 10;
const BOARD_WIDTH = Math.min(SCREEN_WIDTH - 56, 440);
const TILE_WIDTH = (BOARD_WIDTH - BOARD_GAP * (COLUMNS - 1)) / COLUMNS;
const TILE_HEIGHT = TILE_WIDTH * 0.74;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Please try again.';
}

type Result = { kind: 'won'; multiplier: number; payout: number } | { kind: 'lost' };

export default function MinesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<MinesConfig | null>(null);
  const [mineCount, setMineCount] = useState(DEFAULT_MINES);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [stakeText, setStakeText] = useState(DEFAULT_STAKE.toFixed(2));
  const [round, setRound] = useState<MinesRound | null>(null);
  const [hitTile, setHitTile] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  // Tile tapped and waiting on the server — highlighted instantly so the tap
  // feels immediate even on a slow connection.
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const [minesPickerOpen, setMinesPickerOpen] = useState(false);
  const [coinPickerOpen, setCoinPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<MinesRound[]>([]);

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? Infinity;

  const loadHistory = useCallback(() => {
    fetchMinesHistory(30)
      .then(setHistory)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchMinesConfig()
      .then(setConfig)
      .catch(() => {});
    fetchMinesCurrent()
      .then((current) => {
        if (current) {
          setRound(current);
          setMineCount(current.mineCount);
          setStake(Number(current.stake));
          setStakeText(Number(current.stake).toFixed(2));
        }
      })
      .catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const isPlaying = round?.status === 'PENDING';
  const activeMines = round?.mineCount ?? mineCount;
  const revealed = useMemo(() => new Set(round?.revealed ?? []), [round]);
  const mines = useMemo(() => new Set(round?.minePositions ?? []), [round]);
  const revealedCount = round?.revealed.length ?? 0;
  const safeTiles = TILE_COUNT - activeMines;

  const ladder = config?.multipliers[String(activeMines)];
  const nextMultiplier = ladder ? ladder[Math.min((isPlaying ? revealedCount : 0) + 1, ladder.length - 1)] : null;
  const progress = round ? revealedCount / safeTiles : 0;
  const cashOutAmount = round ? Math.min(round2(Number(round.stake) * Number(round.multiplier)), maxPayout) : 0;

  const setStakeValue = (value: number) => {
    const clamped = Math.min(Math.max(value, minStake), maxStake);
    setStake(clamped);
    setStakeText(clamped.toFixed(2));
  };

  const commitStakeText = () => {
    const parsed = Number(stakeText);
    setStakeValue(Number.isFinite(parsed) && parsed > 0 ? round2(parsed) : stake);
  };

  const stepStake = (direction: 1 | -1) => {
    const next =
      direction === 1
        ? STAKE_STEPS.find((s) => s > stake) ?? maxStake
        : [...STAKE_STEPS].reverse().find((s) => s < stake) ?? minStake;
    setStakeValue(next);
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await startMinesRound(stake, mineCount);
      setRound(created);
      setHitTile(null);
      setResult(null);
      refreshWallet();
    } catch (err) {
      Alert.alert('Could not start', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const settle = (settled: MinesRound, outcome: Result) => {
    setRound(settled);
    setResult(outcome);
    refreshWallet();
    loadHistory();
  };

  const reveal = async (tile: number) => {
    if (!round || !isPlaying || busy || revealed.has(tile)) return;
    setBusy(true);
    setPendingTile(tile);
    try {
      const res = await revealMinesTile(round.id, tile);
      if (res.hitMine) {
        setHitTile(tile);
        settle(res.round, { kind: 'lost' });
      } else if (res.round.status === 'WON') {
        // Board cleared, or the max-payout cap was reached.
        settle(res.round, { kind: 'won', multiplier: Number(res.round.multiplier), payout: Number(res.round.payout) });
      } else {
        setRound(res.round);
      }
    } catch (err) {
      Alert.alert('Could not open tile', errorMessage(err));
    } finally {
      setPendingTile(null);
      setBusy(false);
    }
  };

  const randomPick = () => {
    const hidden = Array.from({ length: TILE_COUNT }, (_, i) => i).filter((t) => !revealed.has(t));
    if (hidden.length === 0) return;
    reveal(hidden[Math.floor(Math.random() * hidden.length)]);
  };

  const cashOut = async () => {
    if (!round || busy) return;
    setBusy(true);
    try {
      const settled = await cashOutMinesRound(round.id);
      settle(settled, { kind: 'won', multiplier: Number(settled.multiplier), payout: Number(settled.payout) });
    } catch (err) {
      Alert.alert('Cash out failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const showRules = () => {
    Alert.alert(
      'How to play',
      `Choose how many mines (1-24) are hidden on the 25 tiles and place your bet.\n\n` +
        `Open tiles one by one. Every safe tile raises your multiplier — hit a mine and the bet is lost.\n\n` +
        `Cash out any time after opening a tile. Max win per round is ₹${maxPayout.toLocaleString('en-IN')}; ` +
        `the round cashes out automatically when it's reached.`
    );
  };

  const renderTile = (tile: number) => {
    const isRevealed = revealed.has(tile);
    const settled = round && !isPlaying;
    const isMine = mines.has(tile);
    const showContent = isRevealed || (settled && round?.minePositions);
    const dimmed = settled && !isRevealed;
    const isHit = tile === hitTile;

    return (
      <Pressable
        key={tile}
        onPress={() => reveal(tile)}
        disabled={!isPlaying || isRevealed || busy}
        style={({ pressed }) => [
          styles.tile,
          (pressed || tile === pendingTile) && !showContent && styles.tilePending,
          showContent && styles.tileOpen,
          isHit && styles.tileHit,
          dimmed && styles.tileDimmed,
        ]}
      >
        {showContent ? (
          isMine ? (
            <MaterialCommunityIcons name="bomb" size={TILE_HEIGHT * 0.56} color={isHit ? '#1B0A0E' : '#E6ECF7'} />
          ) : (
            <MaterialCommunityIcons name="diamond-stone" size={TILE_HEIGHT * 0.56} color="#35E0B0" />
          )
        ) : (
          <View style={styles.tileDot} />
        )}
      </Pressable>
    );
  };

  return (
    <LinearGradient colors={['#0A3C98', '#0B5BD6']} style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => setMinesPickerOpen(true)}
          disabled={isPlaying}
          style={[styles.minesPill, isPlaying && styles.locked]}
        >
          <Text style={styles.minesPillText}>Mines: {activeMines}</Text>
          <MaterialCommunityIcons name="chevron-down" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={styles.nextPill}>
          <Text style={styles.nextPillText}>Next: {nextMultiplier !== null ? `${nextMultiplier.toFixed(2)}x` : '—'}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` }]} />
      </View>

      <View style={styles.boardArea}>
        <View style={styles.board}>{Array.from({ length: TILE_COUNT }, (_, i) => renderTile(i))}</View>
        {result?.kind === 'won' && (
          <View style={styles.winCard} pointerEvents="none">
            <Text style={styles.winMultiplier}>x{result.multiplier.toFixed(2)}</Text>
            <Text style={styles.winPayout}>₹{result.payout.toFixed(2)}</Text>
            {result.payout >= maxPayout && <Text style={styles.winNote}>Max win reached</Text>}
          </View>
        )}
      </View>

      <Pressable onPress={randomPick} disabled={!isPlaying || busy} style={[styles.randomBtn, !isPlaying && styles.locked]}>
        <Text style={styles.randomBtnText}>RANDOM</Text>
      </Pressable>

      <View style={styles.betPanel}>
        {isPlaying ? (
          <Pressable
            onPress={cashOut}
            disabled={busy || revealedCount === 0}
            style={[styles.mainBtn, styles.cashOutBtn, revealedCount === 0 && styles.locked]}
          >
            <Text style={styles.cashOutText}>CASH OUT ₹{cashOutAmount.toFixed(2)}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={start} disabled={busy} style={styles.mainBtnWrap}>
            <LinearGradient colors={['#5FB012', '#3C8506']} style={[styles.mainBtn, styles.betBtn]}>
              <MaterialCommunityIcons name="play-outline" size={30} color="#FFFFFF" style={styles.betIcon} />
              <Text style={styles.betText}>BET</Text>
            </LinearGradient>
          </Pressable>
        )}

        <View style={styles.stakeRow}>
          <View style={styles.stakeBox}>
            <Text style={styles.stakeLabel}>Bet INR</Text>
            <TextInput
              style={styles.stakeInput}
              value={isPlaying && round ? Number(round.stake).toFixed(2) : stakeText}
              onChangeText={setStakeText}
              onBlur={commitStakeText}
              onSubmitEditing={commitStakeText}
              editable={!isPlaying}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
              textAlign="center"
            />
          </View>
          <Pressable onPress={() => stepStake(-1)} disabled={isPlaying} style={styles.roundBtn}>
            <MaterialCommunityIcons name="minus" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => setCoinPickerOpen(true)} disabled={isPlaying} style={styles.roundBtn}>
            <MaterialCommunityIcons name="database-outline" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => stepStake(1)} disabled={isPlaying} style={styles.roundBtn}>
            <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.gamePill}>
          <MaterialCommunityIcons name="chevron-left" size={20} color="#FFFFFF" />
          <Text style={styles.gamePillText}>MINES</Text>
        </Pressable>
        <Pressable onPress={showRules} style={styles.helpBtn}>
          <Text style={styles.helpText}>?</Text>
        </Pressable>
        <View style={styles.bottomSpacer} />
        <Text style={styles.balanceText}>
          {coins.toFixed(2)} <Text style={styles.balanceUnit}>INR</Text>
        </Text>
        <Pressable onPress={() => setHistoryOpen(true)} style={styles.menuBtn}>
          <MaterialCommunityIcons name="menu" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <Modal visible={minesPickerOpen} transparent animationType="fade" onRequestClose={() => setMinesPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMinesPickerOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Number of mines</Text>
            <View style={styles.minesGrid}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    setMineCount(n);
                    setRound(null);
                    setResult(null);
                    setHitTile(null);
                    setMinesPickerOpen(false);
                  }}
                  style={[styles.minesOption, n === mineCount && styles.minesOptionActive]}
                >
                  <Text style={[styles.minesOptionText, n === mineCount && styles.minesOptionTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={coinPickerOpen} transparent animationType="fade" onRequestClose={() => setCoinPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCoinPickerOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Quick bet</Text>
            <View style={styles.quickRow}>
              {QUICK_STAKES.map((amount) => (
                <Pressable
                  key={amount}
                  onPress={() => {
                    setStakeValue(amount);
                    setCoinPickerOpen(false);
                  }}
                  style={styles.quickBtn}
                >
                  <Text style={styles.quickText}>₹{amount}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setHistoryOpen(false)}>
          <View style={[styles.sheet, styles.historySheet]}>
            <Text style={styles.sheetTitle}>My bets</Text>
            <ScrollView>
              {history.length === 0 ? (
                <Text style={styles.historyEmpty}>No rounds yet.</Text>
              ) : (
                history.map((h) => {
                  const won = h.status === 'WON';
                  return (
                    <View key={h.id} style={styles.historyRow}>
                      <Text style={styles.historyMines}>{h.mineCount} mines</Text>
                      <Text style={styles.historyStake}>₹{Number(h.stake).toFixed(2)}</Text>
                      <Text style={[styles.historyResult, { color: won ? '#35E0B0' : '#FF5A6E' }]}>
                        {won ? `${Number(h.multiplier).toFixed(2)}x · ₹${Number(h.payout).toFixed(2)}` : 'BUST'}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(6, 40, 104, 0.55)',
  },
  minesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '42%',
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: '#0D4C9C',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  minesPillText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  nextPill: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: 22, backgroundColor: '#F5C21B' },
  nextPillText: { color: '#1A2B55', fontSize: 16, fontWeight: '600' },
  locked: { opacity: 0.55 },
  progressTrack: {
    height: 5,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 3,
    backgroundColor: 'rgba(8, 40, 100, 0.7)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#F5C21B' },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: { width: BOARD_WIDTH, flexDirection: 'row', flexWrap: 'wrap', gap: BOARD_GAP },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 8,
    backgroundColor: '#0E3E7E',
    borderWidth: 1.5,
    borderColor: '#1D5AAD',
    borderBottomWidth: 4,
    borderBottomColor: '#0A2E63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOpen: { backgroundColor: '#0A2C62', borderBottomWidth: 1.5 },
  tileHit: { backgroundColor: '#E03A50', borderColor: '#FF7A8A' },
  tileDimmed: { opacity: 0.45 },
  tilePending: { backgroundColor: '#3E8BFF', transform: [{ scale: 0.92 }] },
  tileDot: {
    width: TILE_HEIGHT * 0.32,
    height: TILE_HEIGHT * 0.32,
    borderRadius: TILE_HEIGHT * 0.16,
    backgroundColor: '#3A78D4',
  },
  winCard: {
    position: 'absolute',
    alignItems: 'center',
    paddingHorizontal: 34,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 30, 80, 0.92)',
    borderWidth: 2,
    borderColor: '#35E0B0',
  },
  winMultiplier: { color: '#35E0B0', fontSize: 30, fontWeight: '800' },
  winPayout: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 2 },
  winNote: { color: '#F5C21B', fontSize: 12, fontWeight: '700', marginTop: 4 },
  randomBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: '#0D58B8',
    borderWidth: 1.5,
    borderColor: '#0A3F86',
  },
  randomBtnText: { color: '#8FB8F0', fontSize: 18, fontWeight: '600', letterSpacing: 0.5 },
  betPanel: {
    marginHorizontal: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#0A4696',
    gap: 14,
  },
  mainBtnWrap: { borderRadius: 30 },
  mainBtn: {
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#10240A',
  },
  betBtn: { flexDirection: 'row' },
  betIcon: { position: 'absolute', left: 22 },
  betText: { color: '#EAF6DC', fontSize: 20, fontWeight: '600', letterSpacing: 0.5 },
  cashOutBtn: { backgroundColor: '#F5C21B', borderColor: '#6B4E00' },
  cashOutText: { color: '#1A2B55', fontSize: 18, fontWeight: '800' },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 34,
    backgroundColor: '#0D4E9E',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  stakeBox: { flex: 1, alignItems: 'center' },
  stakeLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  stakeInput: {
    alignSelf: 'stretch',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#0A3A78',
    textAlign: 'center',
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
    backgroundColor: '#0D56B0',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: '#0A4696',
  },
  gamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34%',
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#0D56B0',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  gamePillText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  helpBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F28C12',
    borderWidth: 1.5,
    borderColor: '#7A3E00',
  },
  helpText: { color: '#3A1C00', fontSize: 16, fontWeight: '800' },
  bottomSpacer: { flex: 1 },
  balanceText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  balanceUnit: { color: '#8FB8F0', fontSize: 14, fontWeight: '500' },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D56B0',
    borderWidth: 1.5,
    borderColor: '#0A3A7C',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 18, padding: 18, backgroundColor: '#0A3F8C' },
  sheetTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
  minesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  minesOption: {
    width: 48,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D56B0',
  },
  minesOptionActive: { backgroundColor: '#F5C21B' },
  minesOptionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  minesOptionTextActive: { color: '#1A2B55' },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#0D56B0' },
  quickText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  historySheet: { maxHeight: '70%' },
  historyEmpty: { color: '#8FB8F0', textAlign: 'center', paddingVertical: 20 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1D5AAD',
  },
  historyMines: { color: '#FFFFFF', fontSize: 14, width: 80 },
  historyStake: { color: '#8FB8F0', fontSize: 14, flex: 1 },
  historyResult: { fontSize: 14, fontWeight: '700' },
});
