import type { FitnessState } from "@agents/types";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AgentScreen, Field, SummaryCard } from "@/components/agent-screen";
import { useHealthDataSync } from "@/hooks/use-health-data-sync";

const FITNESS_CONFIG = {
  id: "fitness" as const,
  title: "Fitness Planner",
  subtitle: "Connect Health Connect, sync recent workouts, and build a tailored plan.",
  placeholder: "Plan my training...",
  accentColor: "#2563eb",
  renderSummary: (state: FitnessState) =>
    state.training_plan || state.activities?.length ? (
      <SummaryCard>
        <Field label="Status" value={state.status} />
        <Field label="Health data" value={state.fitness_data_connected ? "Connected" : undefined} />
        <Field label="Source" value={state.activity_source} />
        <Field label="Activities" value={state.activities?.length} />
        <Field label="Training plan" value={state.training_plan} />
      </SummaryCard>
    ) : null,
};

export default function FitnessScreen() {
  return (
    <View style={styles.screen}>
      <HealthConnectCard />
      <AgentScreen<FitnessState> config={FITNESS_CONFIG} initialState={{}} />
    </View>
  );
}

function HealthConnectCard() {
  const { accepted, availability, error, lastSyncedAt, phase, sync } = useHealthDataSync();
  const busy = phase === "checking" || phase === "syncing";
  const label = phase === "permission_required" ? "Connect Health Connect" : "Sync workouts";
  const status =
    phase === "unavailable"
      ? availability?.status === "update_required"
        ? "Health Connect needs an update"
        : "Health Connect is unavailable"
      : phase === "synced"
        ? `${accepted} workouts synced`
        : phase === "permission_required"
          ? "Permission required"
          : phase === "error"
            ? error
            : lastSyncedAt
              ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
              : "Ready to sync the last 30 days";

  return (
    <View style={styles.healthCard}>
      <View style={styles.healthCopy}>
        <Text style={styles.healthTitle}>Google Fit via Health Connect</Text>
        <Text style={styles.healthStatus}>{status}</Text>
      </View>
      {phase !== "unavailable" && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void sync()}
          style={[styles.syncButton, busy && styles.syncButtonDisabled]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncText}>{label}</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  healthCard: {
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderBottomColor: "#bfdbfe",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  healthCopy: { flex: 1, gap: 2 },
  healthTitle: { color: "#1e3a8a", fontSize: 14, fontWeight: "700" },
  healthStatus: { color: "#475569", fontSize: 12 },
  syncButton: {
    backgroundColor: "#2563eb",
    borderRadius: 18,
    minWidth: 110,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  syncButtonDisabled: { opacity: 0.6 },
  syncText: { color: "#fff", fontSize: 12, fontWeight: "700", textAlign: "center" },
});
