import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { fetchEvents, fetchSports } from "../api/endpoints";
import { EventItem, Sport } from "../types";
import { useAuth } from "../context/AuthContext";

export default function HomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [sports, setSports] = useState<Sport[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const sportsList = await fetchSports();
    setSports(sportsList);
    const active = selectedSport ?? sportsList[0] ?? null;
    setSelectedSport(active);
    if (active) {
      setEvents(await fetchEvents(active.id));
    }
  }, [selectedSport]);

  useEffect(() => {
    load();
  }, []);

  async function onSelectSport(sport: Sport) {
    setSelectedSport(sport);
    setEvents(await fetchEvents(sport.id));
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>NovaPlay</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Wallet")}>
          <Text style={styles.headerLink}>Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate("Profile")}>
          <Text style={styles.headerLink}>Profile</Text>
        </TouchableOpacity>
      </View>

      {user?.isSelfExcluded && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Your account is self-excluded. Betting is disabled.</Text>
        </View>
      )}

      <FlatList
        horizontal
        data={sports}
        keyExtractor={(s) => s.id}
        style={styles.sportsRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.sportChip, selectedSport?.id === item.id && styles.sportChipActive]}
            onPress={() => onSelectSport(item)}
          >
            <Text style={styles.sportChipText}>{item.name}</Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.eventCard}
            onPress={() => navigation.navigate("Event", { eventId: item.id })}
          >
            <Text style={styles.eventName}>{item.name}</Text>
            <Text style={styles.eventTime}>{new Date(item.startTime).toLocaleString()}</Text>
            {item.markets[0] && (
              <View style={styles.oddsRow}>
                {item.markets[0].selections.map((s) => (
                  <View key={s.id} style={styles.oddsPill}>
                    <Text style={styles.oddsPillName}>{s.name}</Text>
                    <Text style={styles.oddsPillValue}>{s.odds}</Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No upcoming events for this sport yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", flex: 1 },
  headerLink: { color: "#3B82F6", fontWeight: "600" },
  banner: { backgroundColor: "#7F1D1D", padding: 10 },
  bannerText: { color: "#fff", textAlign: "center" },
  sportsRow: { flexGrow: 0, paddingHorizontal: 12 },
  sportChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "#141C2E", marginHorizontal: 4 },
  sportChipActive: { backgroundColor: "#3B82F6" },
  sportChipText: { color: "#fff" },
  eventCard: { backgroundColor: "#141C2E", borderRadius: 12, padding: 16 },
  eventName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  eventTime: { color: "#8b93a7", marginTop: 4 },
  oddsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  oddsPill: { flex: 1, backgroundColor: "#0B1220", borderRadius: 8, padding: 8, alignItems: "center" },
  oddsPillName: { color: "#8b93a7", fontSize: 12 },
  oddsPillValue: { color: "#fff", fontWeight: "700", marginTop: 2 },
  empty: { color: "#8b93a7", textAlign: "center", marginTop: 40 },
});
