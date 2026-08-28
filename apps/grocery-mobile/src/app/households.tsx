import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Copy, Home, Users } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormInput } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { RefreshControl } from "@/components/ui/refresh-control";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type HouseholdInvite } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";

type CreateHouseholdForm = { name: string };
type JoinHouseholdForm = { inviteCode: string };

export default function HouseholdsScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => groceryQueryKeys.households(userId), [userId]);
  const createInFlight = useRef(false);
  const joinInFlight = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [createdInvites, setCreatedInvites] = useState<Record<string, HouseholdInvite>>({});
  const createForm = useForm<CreateHouseholdForm>({
    defaultValues: { name: "" },
    mode: "onChange",
  });
  const joinForm = useForm<JoinHouseholdForm>({
    defaultValues: { inviteCode: "" },
    mode: "onChange",
  });

  const householdsQuery = useQuery({
    queryKey,
    queryFn: api.listHouseholds,
    enabled: isFocused && Boolean(userId),
  });

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const createHousehold = useMutation({
    mutationFn: api.createHousehold,
    onSuccess: async () => {
      createForm.reset();
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const joinHousehold = useMutation({
    mutationFn: api.joinHousehold,
    onSuccess: async () => {
      joinForm.reset();
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const createInvite = useMutation({
    mutationFn: (householdId: string) => api.createInvite(householdId),
    onSuccess: (invite, householdId) => {
      setCreatedInvites((current) => ({ ...current, [householdId]: invite }));
    },
  });

  const submitCreateHousehold = createForm.handleSubmit(async ({ name }) => {
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
  });

  const submitJoinHousehold = joinForm.handleSubmit(async ({ inviteCode }) => {
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
  });

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
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={householdsQuery.isRefetching}
          onRefresh={() => void householdsQuery.refetch()}
        />
      }
    >
      <View className="flex-row items-center justify-between px-1 pt-1">
        <Text variant="h4">Your households</Text>
        <Badge variant="outline">{String(households.length)}</Badge>
      </View>

      {householdsQuery.isPending ? (
        <View
          accessibilityLabel="Loading households"
          accessibilityRole="progressbar"
          className="gap-3"
        >
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </View>
      ) : households.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              className="p-0"
              description="Create one below or join with an invite code."
              icon={<Icon as={Users} className="size-7 text-primary" />}
              title="No shared households yet"
            />
          </CardContent>
        </Card>
      ) : (
        households.map((household) => {
          const invite = createdInvites[household.id];
          return (
            <Card key={household.id}>
              <CardHeader>
                <Pressable
                  accessibilityHint="Shows this household’s shared grocery list"
                  accessibilityLabel={`Open ${household.name} shared list`}
                  accessibilityRole="button"
                  className="min-h-14 flex-row items-center gap-3 active:opacity-70"
                  onPress={() =>
                    router.push({
                      pathname: "/shared-list",
                      params: { householdId: household.id, householdName: household.name },
                    })
                  }
                >
                  <View className="flex-1 gap-0.5">
                    <CardTitle selectable>{household.name}</CardTitle>
                    <CardDescription className="capitalize">
                      {household.role === "owner" ? "Owner" : "Member"}
                    </CardDescription>
                  </View>
                  <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
                </Pressable>
              </CardHeader>
              {household.role === "owner" ? (
                <CardContent className="pt-0">
                  {invite ? (
                    <View className="flex-row items-center gap-2.5 rounded-2xl bg-muted p-3">
                      <Icon as={Copy} className="size-4.5 text-primary" />
                      <View className="flex-1 gap-0.5">
                        <Text variant="muted">Invite code</Text>
                        <Text className="tracking-widest" selectable variant="large">
                          {invite.code}
                        </Text>
                      </View>
                      <Text variant="muted">7 days</Text>
                    </View>
                  ) : (
                    <Button
                      disabled={createInvite.isPending}
                      loading={busy === `invite:${household.id}`}
                      size="lg"
                      variant="secondary"
                      onPress={() => createInvite.mutate(household.id)}
                    >
                      {busy === `invite:${household.id}`
                        ? "Creating invite…"
                        : "Create invite code"}
                    </Button>
                  )}
                </CardContent>
              ) : null}
            </Card>
          );
        })
      )}

      {errorMessage ? <Alert title={errorMessage} variant="destructive" /> : null}

      <Text variant="h4">Add a household</Text>
      <Card>
        <CardHeader className="flex-row items-center gap-3 pb-0">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            <Icon as={Home} className="size-5 text-primary" />
          </View>
          <View className="flex-1 gap-0.5">
            <CardTitle>Create a household</CardTitle>
            <CardDescription>
              Keep one grocery list in sync with the people at home.
            </CardDescription>
          </View>
        </CardHeader>
        <CardContent>
          <FormInput
            control={createForm.control}
            label="Household name"
            name="name"
            rules={{
              validate: (value) => value.trim().length > 0 || "Enter a household name.",
            }}
            autoCapitalize="words"
            onSubmitEditing={() => void submitCreateHousehold()}
            placeholder="Household name"
            returnKeyType="done"
          />
        </CardContent>
        <CardFooter className="pt-0">
          <Button
            className="flex-1"
            disabled={!createForm.formState.isValid}
            loading={busy === "create"}
            size="lg"
            variant="secondary"
            onPress={() => void submitCreateHousehold()}
          >
            Create household
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-3 pb-0">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            <Icon as={Users} className="size-5 text-primary" />
          </View>
          <View className="flex-1 gap-0.5">
            <CardTitle>Join with an invite</CardTitle>
            <CardDescription>
              Paste the eight-character code from a household owner.
            </CardDescription>
          </View>
        </CardHeader>
        <CardContent>
          <FormInput
            control={joinForm.control}
            label="Invite code"
            name="inviteCode"
            rules={{
              validate: (value) =>
                value.trim().length === 8 || "Enter the eight-character invite code.",
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={() => void submitJoinHousehold()}
            placeholder="ABCDEFGH"
            returnKeyType="done"
          />
        </CardContent>
        <CardFooter className="pt-0">
          <Button
            className="flex-1"
            disabled={!joinForm.formState.isValid}
            loading={busy === "join"}
            size="lg"
            variant="secondary"
            onPress={() => void submitJoinHousehold()}
          >
            {busy === "join" ? "Joining…" : "Join household"}
          </Button>
        </CardFooter>
      </Card>
    </Screen>
  );
}
