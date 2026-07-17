import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { Check, Copy, Home, Users } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { ErrorAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RefreshControl } from "@/components/ui/refresh-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type HouseholdInvite } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";

export default function HouseholdsScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const queryClient = useQueryClient();
  const queryKey = groceryQueryKeys.households(userId);
  const createInFlight = useRef(false);
  const joinInFlight = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvites, setCreatedInvites] = useState<Record<string, HouseholdInvite>>({});
  const [refreshing, setRefreshing] = useState(false);

  const householdsQuery = useQuery({
    queryKey,
    queryFn: api.listHouseholds,
    enabled: isFocused && Boolean(userId),
    refetchInterval: isFocused ? 30_000 : false,
  });
  const { refetch } = householdsQuery;

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const createHousehold = useMutation({
    mutationFn: api.createHousehold,
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const joinHousehold = useMutation({
    mutationFn: api.joinHousehold,
    onSuccess: async () => {
      setInviteCode("");
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const createInvite = useMutation({
    mutationFn: (householdId: string) => api.createInvite(householdId),
    onSuccess: (invite, householdId) => {
      setCreatedInvites((current) => ({ ...current, [householdId]: invite }));
    },
  });

  const submitCreateHousehold = async () => {
    const nextName = name.trim();
    if (!nextName || createInFlight.current || createHousehold.isPending) return;
    createInFlight.current = true;
    try {
      await createHousehold.mutateAsync(nextName);
    } catch {
      // Mutation state owns the user-visible error; keep the submitted input for retry.
    } finally {
      createInFlight.current = false;
    }
  };

  const submitJoinHousehold = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code || joinInFlight.current || joinHousehold.isPending) return;
    joinInFlight.current = true;
    try {
      await joinHousehold.mutateAsync(code);
    } catch {
      // Mutation state owns the user-visible error; keep the submitted input for retry.
    } finally {
      joinInFlight.current = false;
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };
  const households = householdsQuery.data ?? [];
  const mutationError = createHousehold.error ?? joinHousehold.error ?? createInvite.error;
  const error = householdsQuery.error ?? mutationError;
  const errorMessage = error instanceof Error ? error.message : error ? "The request failed." : "";
  const busy = createHousehold.isPending
    ? "create"
    : joinHousehold.isPending
      ? "join"
      : createInvite.isPending
        ? `invite:${createInvite.variables}`
        : "";

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 p-4.5 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <Card className="gap-3 rounded-2xl p-4">
        <View className="flex-row items-center gap-3">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            <Icon as={Home} className="size-5 text-primary" />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-extrabold">Create a household</Text>
            <Text className="text-xs text-muted-foreground">
              Keep one grocery list in sync with the people at home.
            </Text>
          </View>
        </View>
        <Input
          accessibilityLabel="Household name"
          autoCapitalize="words"
          className="min-h-12 rounded-2xl bg-card px-4 text-base"
          onChangeText={setName}
          onSubmitEditing={() => void submitCreateHousehold()}
          placeholder="Household name"
          returnKeyType="done"
          value={name}
        />
        <Button
          disabled={!name.trim()}
          loading={busy === "create"}
          size="lg"
          onPress={() => void submitCreateHousehold()}
        >
          Create household
        </Button>
      </Card>

      <Card className="gap-3 rounded-2xl p-4">
        <View className="flex-row items-center gap-3">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            <Icon as={Users} className="size-5 text-primary" />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-extrabold">Join with an invite</Text>
            <Text className="text-xs text-muted-foreground">
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
          onSubmitEditing={() => void submitJoinHousehold()}
          placeholder="ABCDEFGH"
          returnKeyType="done"
          value={inviteCode}
        />
        <Button
          disabled={!inviteCode.trim()}
          loading={busy === "join"}
          size="lg"
          variant="secondary"
          onPress={() => void submitJoinHousehold()}
        >
          {busy === "join" ? "Joining…" : "Join household"}
        </Button>
      </Card>

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      <View className="flex-row items-center justify-between px-1 pt-1">
        <Text className="text-xl font-extrabold">Your households</Text>
        <Badge variant="outline">
          <Text className="text-secondary tabular-nums" variant="small">
            {households.length}
          </Text>
        </Badge>
      </View>

      {householdsQuery.isPending ? (
        <View
          accessibilityLabel="Loading households"
          accessibilityRole="progressbar"
          className="gap-3"
        >
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </View>
      ) : households.length === 0 ? (
        <Card className="rounded-2xl p-6">
          <EmptyState
            className="p-0"
            description="Create one above or join with an invite code."
            icon={<Icon as={Users} className="size-7 text-primary" />}
            title="No shared households yet"
          />
        </Card>
      ) : (
        households.map((household) => {
          const invite = createdInvites[household.id];
          return (
            <Card className="gap-3.5 rounded-2xl p-4" key={household.id}>
              <View className="flex-row items-center gap-3">
                <View className="flex-1 gap-0.5">
                  <Text className="text-lg font-extrabold" selectable>
                    {household.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground capitalize">
                    {household.role === "owner" ? "Owner" : "Member"}
                  </Text>
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
                  <Icon as={Check} className="size-4 text-primary-foreground" />
                </Button>
              </View>
              {household.role === "owner" ? (
                invite ? (
                  <View className="flex-row items-center gap-2.5 rounded-2xl bg-muted p-3">
                    <Icon as={Copy} className="size-4.5 text-primary" />
                    <View className="flex-1 gap-0.5">
                      <Text variant="muted">Invite code</Text>
                      <Text
                        className="text-lg font-extrabold tracking-widest text-secondary"
                        selectable
                      >
                        {invite.code}
                      </Text>
                    </View>
                    <Text variant="muted">7 days</Text>
                  </View>
                ) : (
                  <Button
                    disabled={busy === `invite:${household.id}`}
                    loading={busy === `invite:${household.id}`}
                    size="lg"
                    variant="secondary"
                    onPress={() => createInvite.mutate(household.id)}
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
