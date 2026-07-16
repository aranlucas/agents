import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useRouter } from "expo-router";
import { Check, Copy, Home, Users } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { AppState, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
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
      <Card className="gap-3 rounded-2xl p-4">
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
        <Input
          accessibilityLabel="Household name"
          autoCapitalize="words"
          className="min-h-12 rounded-2xl bg-card px-4 text-base"
          onChangeText={setName}
          onSubmitEditing={() => void create()}
          placeholder="Household name"
          returnKeyType="done"
          value={name}
        />
        <Button
          disabled={!name.trim()}
          loading={busy === "create"}
          size="lg"
          onPress={() => void create()}
        >
          Create household
        </Button>
      </Card>

      <Card className="gap-3 rounded-2xl p-4">
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
        <Input
          accessibilityLabel="Invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          className="min-h-12 rounded-2xl bg-card px-4 text-base font-extrabold tracking-widest"
          maxLength={8}
          onChangeText={setInviteCode}
          onSubmitEditing={() => void join()}
          placeholder="ABCDEFGH"
          returnKeyType="done"
          value={inviteCode}
        />
        <Button
          disabled={!inviteCode.trim()}
          loading={busy === "join"}
          size="lg"
          variant="secondary"
          onPress={() => void join()}
        >
          {busy === "join" ? "Joining…" : "Join household"}
        </Button>
      </Card>

      {error ? <ErrorAlert message={error} /> : null}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your households</Text>
        <Badge variant="outline">
          <Text className="text-secondary tabular-nums" variant="small">
            {households.length}
          </Text>
        </Badge>
      </View>

      {loading ? (
        <View
          accessibilityLabel="Loading households"
          accessibilityRole="progressbar"
          style={styles.loadingCards}
        >
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </View>
      ) : households.length === 0 ? (
        <Card className="items-center gap-2 rounded-2xl p-6">
          <Users color={colors.green} size={28} />
          <Text style={styles.emptyTitle}>No shared households yet</Text>
          <Text style={styles.emptyText}>Create one above or join with an invite code.</Text>
        </Card>
      ) : (
        households.map((household) => {
          const invite = createdInvites[household.id];
          return (
            <Card className="gap-3.5 rounded-2xl p-4" key={household.id}>
              <View style={styles.householdRow}>
                <View style={styles.householdCopy}>
                  <Text selectable style={styles.householdName}>
                    {household.name}
                  </Text>
                  <Text style={styles.role}>{household.role === "owner" ? "Owner" : "Member"}</Text>
                </View>
                <Button
                  className="min-h-10 rounded-xl px-3"
                  onPress={() =>
                    router.push({
                      pathname: "/shared-list",
                      params: { householdId: household.id, householdName: household.name },
                    })
                  }
                  size="sm"
                >
                  <Text className="text-sm font-extrabold text-primary-foreground">Open list</Text>
                  <Check color={colors.white} size={17} />
                </Button>
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
                  <Button
                    disabled={busy === `invite:${household.id}`}
                    loading={busy === `invite:${household.id}`}
                    size="lg"
                    variant="secondary"
                    onPress={() => void createInvite(household.id)}
                  >
                    {busy === `invite:${household.id}` ? "Creating invite…" : "Create invite code"}
                  </Button>
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
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 3,
    paddingTop: 4,
  },
  sectionTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  loadingCards: { gap: 12 },
  emptyTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  householdRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  householdCopy: { flex: 1, gap: 2 },
  householdName: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "800" },
  role: { color: colors.muted, fontSize: 12, lineHeight: 17, textTransform: "capitalize" },
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
