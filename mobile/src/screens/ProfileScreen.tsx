import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { selfExclude, setDepositLimits, submitKyc } from "../api/endpoints";
import { ApiClientError } from "../api/client";

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [dailyLimit, setDailyLimit] = useState("");

  async function handleSubmitKyc() {
    try {
      await submitKyc("passport", `doc_${Date.now()}`);
      await refreshUser();
      Alert.alert("KYC submitted", "Your verification has been submitted.");
    } catch (err) {
      Alert.alert("KYC failed", err instanceof ApiClientError ? err.message : "Please try again.");
    }
  }

  async function handleSetLimit() {
    const value = Number(dailyLimit);
    if (!value || value <= 0) {
      Alert.alert("Invalid limit", "Enter an amount greater than 0.");
      return;
    }
    try {
      await setDepositLimits({ depositLimitDaily: value });
      Alert.alert("Limit set", `Daily deposit limit set to £${value}.`);
    } catch (err) {
      Alert.alert("Failed", err instanceof ApiClientError ? err.message : "Please try again.");
    }
  }

  function handleSelfExclude() {
    Alert.alert(
      "Confirm self-exclusion",
      "This will block betting and deposits for 30 days and cannot be undone early. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Self-exclude",
          style: "destructive",
          onPress: async () => {
            try {
              await selfExclude(30);
              await refreshUser();
              Alert.alert("Self-exclusion active", "Your account is now self-excluded for 30 days.");
            } catch (err) {
              Alert.alert("Failed", err instanceof ApiClientError ? err.message : "Please try again.");
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.name}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.kyc}>KYC status: {user?.kycStatus}</Text>
      </View>

      {user?.kycStatus !== "APPROVED" && (
        <TouchableOpacity style={styles.button} onPress={handleSubmitKyc}>
          <Text style={styles.buttonText}>Submit KYC verification</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Responsible gambling</Text>

      <TextInput
        style={styles.input}
        placeholder="Daily deposit limit (£)"
        keyboardType="decimal-pad"
        value={dailyLimit}
        onChangeText={setDailyLimit}
      />
      <TouchableOpacity style={styles.button} onPress={handleSetLimit}>
        <Text style={styles.buttonText}>Set daily deposit limit</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleSelfExclude}>
        <Text style={styles.buttonText}>Self-exclude for 30 days</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  title: { color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 20 },
  card: { backgroundColor: "#141C2E", borderRadius: 12, padding: 16, marginBottom: 20 },
  name: { color: "#fff", fontSize: 18, fontWeight: "600" },
  email: { color: "#8b93a7", marginTop: 4 },
  kyc: { color: "#8b93a7", marginTop: 8 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 20, marginBottom: 12 },
  input: {
    backgroundColor: "#141C2E",
    color: "#fff",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#26314A",
  },
  button: { backgroundColor: "#3B82F6", borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 12 },
  dangerButton: { backgroundColor: "#7F1D1D" },
  buttonText: { color: "#fff", fontWeight: "600" },
  logout: { padding: 14, alignItems: "center", marginTop: 12 },
  logoutText: { color: "#8b93a7" },
});
