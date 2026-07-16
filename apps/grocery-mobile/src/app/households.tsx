import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useRouter } from "expo-router";
import { Check, Copy, Home, Users } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Card, InlineError, PrimaryButton, SecondaryButton } from "@/components/ui";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type Household, type HouseholdInvite } from "@/lib/household-api";
import { colors } from "@/lib/theme";

export default function HouseholdsScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const [households, setHouseholds] = useState<Household[]>([]);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvites, setCreatedInvites] = useState<Record<string, HouseholdInvite>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      try {
        setHouseholds(await api.listHouseholds());
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Households could not be loaded.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      const interval = setInterval(() => {
        if (AppState.currentState === "active") void load();
      }, 30_000);
      return () => clearInterval(interval);
    }, [load]),
  );

  const create = async () => {
    if (!name.trim()) return;
    setBusy("create");
    setError("");
    try {
      await api.createHousehold(name.trim());
      setName("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The household could not be created.");
    } finally {
      setBusy("");
    }
  };

  const join = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    setBusy("join");
    setError("");
    try {
      await api.joinHousehold(code);
      setInviteCode("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That invite could not be used.");
    } finally {
      setBusy("");
    }
  };

  const createInvite = async (householdId: string) => {
    setBusy(`invite:${householdId}`);
    setError("");
    try {
      const invite = await api.createInvite(householdId);
      setCreatedInvites((current) => ({ ...current, [householdId]: invite }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "An invite could not be created.");
    } finally {
      setBusy("");
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
    >
      <Card style={styles.formCard}>
        <View style={styles.cardHeading}>
          <View style={styles.icon}>
            <Home color={colors.green} size={21} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={styles.cardTitle}>Create a household</Text>
            <Text style={styles.cardBody}>
              Keep one grocery list in sync with the people at home.
            </Text>
          </View>
        </View>
        <TextInput
          accessibilityLabel="Household name"
          autoCapitalize="words"
          onChangeText={setName}
          onSubmitEditing={() => void create()}
          placeholder="Household name"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={styles.input}
          value={name}
        />
        <PrimaryButton
          disabled={!name.trim()}
          loading={busy === "create"}
          onPress={() => void create()}
        >
          Create household
        </PrimaryButton>
      </Card>

      <Card style={styles.formCard}>
        <View style={styles.cardHeading}>
          <View style={styles.icon}>
            <Users color={colors.green} size={21} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={styles.cardTitle}>Join with an invite</Text>
            <Text style={styles.cardBody}>
              Paste the eight-character code from a household owner.
            </Text>
          </View>
        </View>
        <TextInput
          accessibilityLabel="Invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          onChangeText={setInviteCode}
          onSubmitEditing={() => void join()}
          placeholder="ABCDEFGH"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={[styles.input, styles.codeInput]}
          value={inviteCode}
        />
        <SecondaryButton disabled={!inviteCode.trim()} onPress={() => void join()}>
          {busy === "join" ? "Joining…" : "Join household"}
        </SecondaryButton>
      </Card>

      {error ? <InlineError message={error} /> : null}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your households</Text>
        <Text style={styles.count}>{households.length}</Text>
      </View>

      {loading ? (
        <Text style={styles.emptyText}>Loading households…</Text>
      ) : households.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Users color={colors.green} size={28} />
          <Text style={styles.emptyTitle}>No shared households yet</Text>
          <Text style={styles.emptyText}>Create one above or join with an invite code.</Text>
        </Card>
      ) : (
        households.map((household) => {
          const invite = createdInvites[household.id];
          return (
            <Card key={household.id} style={styles.householdCard}>
              <View style={styles.householdRow}>
                <View style={styles.householdCopy}>
                  <Text selectable style={styles.householdName}>
                    {household.name}
                  </Text>
                  <Text style={styles.role}>{household.role === "owner" ? "Owner" : "Member"}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/shared-list",
                      params: { householdId: household.id, householdName: household.name },
                    })
                  }
                  style={styles.openButton}
                >
                  <Text style={styles.openText}>Open list</Text>
                  <Check color={colors.white} size={17} />
                </Pressable>
              </View>
              {household.role === "owner" ? (
                invite ? (
                  <View style={styles.inviteResult}>
                    <Copy color={colors.green} size={18} />
                    <View style={styles.inviteCopy}>
                      <Text style={styles.inviteLabel}>Invite code</Text>
                      <Text selectable style={styles.inviteCode}>
                        {invite.code}
                      </Text>
                    </View>
                    <Text style={styles.inviteExpiry}>7 days</Text>
                  </View>
                ) : (
                  <SecondaryButton
                    disabled={busy === `invite:${household.id}`}
                    onPress={() => void createInvite(household.id)}
                  >
                    {busy === `invite:${household.id}` ? "Creating invite…" : "Create invite code"}
                  </SecondaryButton>
                )
              ) : null}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  formCard: { padding: 16, gap: 13 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: { flex: 1, gap: 2 },
  cardTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  cardBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  input: {
    minHeight: 50,
    borderRadius: 15,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 15,
  },
  codeInput: { fontWeight: "800", letterSpacing: 2 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 3,
    paddingTop: 4,
  },
  sectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  count: {
    minWidth: 28,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    color: colors.forest,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
    textAlign: "center",
  },
  emptyCard: { alignItems: "center", padding: 24, gap: 8 },
  emptyTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  householdCard: { padding: 16, gap: 14 },
  householdRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  householdCopy: { flex: 1, gap: 2 },
  householdName: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  role: { color: colors.muted, fontSize: 12, lineHeight: 17, textTransform: "capitalize" },
  openButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: colors.green,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
  },
  openText: { color: colors.white, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  inviteResult: {
    borderRadius: 15,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  inviteCopy: { flex: 1, gap: 1 },
  inviteLabel: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  inviteCode: {
    color: colors.forest,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: 2,
  },
  inviteExpiry: { color: colors.muted, fontSize: 11, lineHeight: 15 },
});
