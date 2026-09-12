import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { deposit, fetchWallet, withdraw } from "../api/endpoints";
import { Wallet } from "../types";
import { ApiClientError } from "../api/client";

export default function WalletScreen() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("20");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setWallet(await fetchWallet()), []);

  useEffect(() => {
    load();
  }, [load]);

  async function handle(action: "deposit" | "withdraw") {
    const value = Number(amount);
    if (!value || value <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    setBusy(true);
    try {
      const updated = action === "deposit" ? await deposit(value) : await withdraw(value);
      setWallet(updated);
    } catch (err) {
      Alert.alert(
        action === "deposit" ? "Deposit failed" : "Withdrawal failed",
        err instanceof ApiClientError ? err.message : "Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wallet</Text>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Balance</Text>
        {wallet ? (
          <Text style={styles.balance}>
            {wallet.currency} {Number(wallet.balance).toFixed(2)}
          </Text>
        ) : (
          <ActivityIndicator color="#fff" />
        )}
      </View>

      <Text style={styles.noteText}>
        Payments run through a sandbox provider in this build — no real money moves until a
        licensed payment processor is wired in. See backend/README.md.
      </Text>

      <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />

      <View style={styles.row}>
        <TouchableOpacity style={[styles.button, styles.deposit]} onPress={() => handle("deposit")} disabled={busy}>
          <Text style={styles.buttonText}>Deposit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.withdraw]} onPress={() => handle("withdraw")} disabled={busy}>
          <Text style={styles.buttonText}>Withdraw</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220", padding: 20 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 20 },
  balanceCard: { backgroundColor: "#141C2E", borderRadius: 12, padding: 24, alignItems: "center", marginBottom: 16 },
  balanceLabel: { color: "#8b93a7", marginBottom: 8 },
  balance: { color: "#fff", fontSize: 32, fontWeight: "700" },
  noteText: { color: "#8b93a7", fontSize: 12, marginBottom: 16, lineHeight: 18 },
  input: {
    backgroundColor: "#141C2E",
    color: "#fff",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#26314A",
  },
  row: { flexDirection: "row", gap: 12 },
  button: { flex: 1, borderRadius: 8, padding: 14, alignItems: "center" },
  deposit: { backgroundColor: "#22C55E" },
  withdraw: { backgroundColor: "#3B82F6" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
