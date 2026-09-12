import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiFetch, ApiClientError } from "../api/client";
import { placeBet } from "../api/endpoints";
import { EventItem, Selection } from "../types";

export default function EventScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const [event, setEvent] = useState<EventItem | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [stake, setStake] = useState("10");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<EventItem>(`/sports/events/${eventId}`).then(setEvent);
  }, [eventId]);

  async function onPlaceBet() {
    if (!selected) return;
    const amount = Number(stake);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid stake", "Enter an amount greater than 0.");
      return;
    }
    setSubmitting(true);
    try {
      const bet = await placeBet(selected.id, amount);
      Alert.alert(
        "Bet placed",
        `Stake £${bet.stake} on ${selected.name} @ ${bet.odds}. Potential payout £${bet.potentialPayout}.`
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert("Bet failed", err instanceof ApiClientError ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{event.name}</Text>
      <Text style={styles.time}>{new Date(event.startTime).toLocaleString()}</Text>

      {event.markets.map((market) => (
        <View key={market.id} style={styles.marketCard}>
          <Text style={styles.marketName}>{market.name}</Text>
          {market.selections.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.selectionRow, selected?.id === s.id && styles.selectionRowActive]}
              onPress={() => setSelected(s)}
              disabled={market.status !== "OPEN"}
            >
              <Text style={styles.selectionName}>{s.name}</Text>
              <Text style={styles.selectionOdds}>{s.odds}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {selected && (
        <View style={styles.betSlip}>
          <Text style={styles.betSlipTitle}>Bet slip: {selected.name} @ {selected.odds}</Text>
          <TextInput
            style={styles.stakeInput}
            keyboardType="decimal-pad"
            value={stake}
            onChangeText={setStake}
            placeholder="Stake"
          />
          <Text style={styles.potential}>
            Potential payout: £{(Number(stake || 0) * Number(selected.odds)).toFixed(2)}
          </Text>
          <TouchableOpacity style={styles.button} onPress={onPlaceBet} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Place bet</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0B1220" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  time: { color: "#8b93a7", marginBottom: 16 },
  marketCard: { backgroundColor: "#141C2E", borderRadius: 12, padding: 16, marginBottom: 12 },
  marketName: { color: "#fff", fontWeight: "600", marginBottom: 8 },
  selectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#0B1220",
    marginBottom: 8,
  },
  selectionRowActive: { backgroundColor: "#3B82F6" },
  selectionName: { color: "#fff" },
  selectionOdds: { color: "#fff", fontWeight: "700" },
  betSlip: { backgroundColor: "#141C2E", borderRadius: 12, padding: 16, marginTop: 8 },
  betSlipTitle: { color: "#fff", fontWeight: "600", marginBottom: 12 },
  stakeInput: {
    backgroundColor: "#0B1220",
    color: "#fff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#26314A",
  },
  potential: { color: "#8b93a7", marginTop: 8, marginBottom: 12 },
  button: { backgroundColor: "#3B82F6", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
