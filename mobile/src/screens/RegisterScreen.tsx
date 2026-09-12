import React, { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { ApiClientError } from "../api/client";

function calculateAge(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("GB");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister() {
    const dob = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(dob.getTime()) || String(year).length !== 4) {
      Alert.alert("Invalid date of birth", "Please enter a valid date (DD / MM / YYYY).");
      return;
    }
    if (calculateAge(dob) < 18) {
      Alert.alert("Age restriction", "You must be at least 18 years old to use NovaPlay.");
      return;
    }

    setSubmitting(true);
    try {
      await register({
        email: email.trim(),
        password,
        firstName,
        lastName,
        country,
        dateOfBirth: dob.toISOString(),
      });
    } catch (err) {
      Alert.alert("Registration failed", err instanceof ApiClientError ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>You must be 18+ to register.</Text>

      <TextInput style={styles.input} placeholder="First name" value={firstName} onChangeText={setFirstName} />
      <TextInput style={styles.input} placeholder="Last name" value={lastName} onChangeText={setLastName} />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="Password (min 8 chars)" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Country code (e.g. GB)" autoCapitalize="characters" value={country} onChangeText={setCountry} />

      <Text style={styles.label}>Date of birth</Text>
      <View style={styles.dobRow}>
        <TextInput style={styles.dobInput} placeholder="DD" keyboardType="number-pad" maxLength={2} value={day} onChangeText={setDay} />
        <TextInput style={styles.dobInput} placeholder="MM" keyboardType="number-pad" maxLength={2} value={month} onChangeText={setMonth} />
        <TextInput style={[styles.dobInput, { flex: 1.4 }]} placeholder="YYYY" keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} />
      </View>

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#0B1220" },
  title: { fontSize: 28, fontWeight: "700", color: "#fff", textAlign: "center" },
  subtitle: { color: "#8b93a7", textAlign: "center", marginBottom: 24, marginTop: 8 },
  label: { color: "#8b93a7", marginBottom: 6 },
  input: {
    backgroundColor: "#141C2E",
    color: "#fff",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#26314A",
  },
  dobRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  dobInput: {
    flex: 1,
    backgroundColor: "#141C2E",
    color: "#fff",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#26314A",
    textAlign: "center",
  },
  button: { backgroundColor: "#3B82F6", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  link: { color: "#3B82F6", textAlign: "center", marginTop: 20, marginBottom: 20 },
});
