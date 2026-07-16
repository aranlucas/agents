import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Check, Circle, ListPlus, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Card, InlineError, PrimaryButton } from "@/components/ui";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type GroceryList } from "@/lib/household-api";
import { colors } from "@/lib/theme";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function SharedListScreen() {
  const params = useLocalSearchParams<{
    householdId?: string | string[];
    householdName?: string | string[];
  }>();
  const householdId = firstParam(params.householdId);
  const householdName = firstParam(params.householdName) || "Household";
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [activeList, setActiveList] = useState<GroceryList | null>(null);
  const [newListTitle, setNewListTitle] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadList = useCallback(
    async (listId: string) => {
      const list = await api.getList(listId);
      setActiveList(list);
      return list;
    },
    [api],
  );

  const load = useCallback(
    async (showRefresh = false) => {
      if (!householdId) {
        setError("This household link is incomplete. Go back and open it again.");
        setLoading(false);
        return;
      }
      if (showRefresh) setRefreshing(true);
      try {
        const available = await api.listLists(householdId);
        setLists(available);
        const selected =
          available.find((list) => list.id === activeList?.id) ??
          available.find((list) => list.status === "active") ??
          available[0];
        setActiveList(selected ? await api.getList(selected.id) : null);
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The shared list could not be loaded.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeList?.id, api, householdId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const createList = async () => {
    const title = newListTitle.trim() || `${householdName} groceries`;
    setBusy("create-list");
    setError("");
    try {
      const created = await api.createList(title, householdId);
      setNewListTitle("");
      setLists((current) => [created, ...current]);
      setActiveList(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The list could not be created.");
    } finally {
      setBusy("");
    }
  };

  const addItem = async () => {
    const name = newItemName.trim();
    if (!activeList || !name) return;
    setBusy("add-item");
    setError("");
    try {
      await api.addItems(activeList.id, [{ name }]);
      setNewItemName("");
      await loadList(activeList.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The item could not be added.");
    } finally {
      setBusy("");
    }
  };

  const toggleItem = async (itemId: string, checked: boolean) => {
    if (!activeList) return;
    setBusy(`item:${itemId}`);
    setError("");
    try {
      await api.updateItem(activeList.id, itemId, { checked });
      await loadList(activeList.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The item could not be updated.");
    } finally {
      setBusy("");
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!activeList) return;
    setBusy(`item:${itemId}`);
    setError("");
    try {
      await api.deleteItem(activeList.id, itemId);
      await loadList(activeList.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The item could not be removed.");
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
      <View style={styles.heading}>
        <Text selectable style={styles.eyebrow}>
          {householdName}
        </Text>
        <Text style={styles.title}>Shared grocery lists</Text>
        <Text style={styles.subtitle}>Changes are visible to everyone in this household.</Text>
      </View>

      {lists.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {lists.map((list) => {
            const selected = list.id === activeList?.id;
            return (
              <Pressable
                accessibilityRole="button"
                key={list.id}
                onPress={() => void loadList(list.id)}
                style={[styles.tab, selected && styles.tabSelected]}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                  {list.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {activeList ? (
        <>
          <Card style={styles.listCard}>
            <View style={styles.listHeading}>
              <View style={styles.listHeadingCopy}>
                <Text selectable style={styles.listTitle}>
                  {activeList.title}
                </Text>
                <Text style={styles.itemCount}>
                  {activeList.items.length} {activeList.items.length === 1 ? "item" : "items"}
                </Text>
              </View>
              <ListPlus color={colors.green} size={22} />
            </View>
            {activeList.items.length ? (
              activeList.items.map((item, index) => {
                const checked = Boolean(item.checked_at);
                const itemBusy = busy === `item:${item.id}`;
                return (
                  <View key={item.id}>
                    <View style={[styles.item, itemBusy && styles.busy]}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        disabled={itemBusy}
                        onPress={() => void toggleItem(item.id, !checked)}
                        style={styles.itemToggle}
                      >
                        {checked ? (
                          <View style={styles.checked}>
                            <Check color={colors.white} size={15} />
                          </View>
                        ) : (
                          <Circle color={colors.line} size={24} />
                        )}
                        <View style={styles.itemCopy}>
                          <Text
                            selectable
                            style={[styles.itemName, checked && styles.itemNameChecked]}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.itemDetail}>Quantity {item.quantity}</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Remove ${item.name}`}
                        accessibilityRole="button"
                        disabled={itemBusy}
                        onPress={() => void deleteItem(item.id)}
                        hitSlop={10}
                        style={styles.deleteButton}
                      >
                        <Trash2 color={colors.muted} size={19} />
                      </Pressable>
                    </View>
                    {index < activeList.items.length - 1 ? <View style={styles.rule} /> : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.empty}>No items yet. Add the first one below.</Text>
            )}
          </Card>

          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel="New grocery item"
              onChangeText={setNewItemName}
              onSubmitEditing={() => void addItem()}
              placeholder="Add an item"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              style={styles.input}
              value={newItemName}
            />
            <Pressable
              accessibilityLabel="Add item"
              accessibilityRole="button"
              disabled={!newItemName.trim() || busy === "add-item"}
              onPress={() => void addItem()}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.addButtonPressed,
                (!newItemName.trim() || busy === "add-item") && styles.busy,
              ]}
            >
              <Plus color={colors.white} size={22} />
            </Pressable>
          </View>
        </>
      ) : loading ? (
        <Text style={styles.empty}>Loading shared lists…</Text>
      ) : (
        <Card style={styles.createCard}>
          <ListPlus color={colors.green} size={28} />
          <Text style={styles.createTitle}>Start a shared list</Text>
          <Text style={styles.empty}>Create the first list for {householdName}.</Text>
          <TextInput
            accessibilityLabel="List title"
            autoCapitalize="words"
            onChangeText={setNewListTitle}
            onSubmitEditing={() => void createList()}
            placeholder={`${householdName} groceries`}
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={styles.input}
            value={newListTitle}
          />
          <PrimaryButton loading={busy === "create-list"} onPress={() => void createList()}>
            Create shared list
          </PrimaryButton>
        </Card>
      )}

      {error ? <InlineError message={error} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 40, gap: 16 },
  heading: { gap: 4, paddingHorizontal: 2 },
  eyebrow: { color: colors.green, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  tabs: { gap: 8, paddingHorizontal: 1 },
  tab: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabSelected: { borderColor: colors.green, backgroundColor: colors.surfaceMuted },
  tabText: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  tabTextSelected: { color: colors.forest },
  listCard: { overflow: "hidden" },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
  listHeadingCopy: { flex: 1, gap: 2 },
  listTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  itemCount: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  item: { minHeight: 64, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  itemToggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  checked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCopy: { flex: 1, gap: 2 },
  itemName: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  itemNameChecked: { color: colors.muted, textDecorationLine: "line-through" },
  itemDetail: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  deleteButton: { padding: 10 },
  rule: { height: 1, backgroundColor: colors.line, marginLeft: 52 },
  empty: { color: colors.muted, fontSize: 14, lineHeight: 20, padding: 16 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 15,
  },
  addButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonPressed: { backgroundColor: colors.greenPressed },
  busy: { opacity: 0.55 },
  createCard: { padding: 18, gap: 12, alignItems: "stretch" },
  createTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: "800" },
});
