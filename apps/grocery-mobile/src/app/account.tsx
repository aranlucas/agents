import { useClerk, useUser } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ChevronRight,
  CircleHelp,
  FileText,
  LogOut,
  Shield,
  ShoppingBasket,
  Trash2,
} from "lucide-react-native";
import { Card, InlineError, PrimaryButton, SecondaryButton } from "@/components/ui";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { getLegalLinks } from "@/lib/config";
import { colors } from "@/lib/theme";

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { connected, refresh } = useKrogerConnection();
  const [error, setError] = useState("");
  const links = getLegalLinks();

  const open = async (url: string, refreshAfter = false) => {
    setError("");
    try {
      await WebBrowser.openBrowserAsync(url);
      if (refreshAfter) await refresh();
    } catch {
      setError("That page could not be opened. Check your connection and try again.");
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "G")
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileCopy}>
          <Text selectable style={styles.name}>
            {user?.fullName ?? "Grocery Agent member"}
          </Text>
          <Text selectable style={styles.email}>
            {user?.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </View>

      <Card style={styles.connectionCard}>
        <View style={styles.connectionTop}>
          <View style={styles.connectionIcon}>
            <ShoppingBasket color={colors.green} size={22} />
          </View>
          <View style={styles.connectionCopy}>
            <Text style={styles.connectionTitle}>Kroger</Text>
            <Text style={styles.connectionBody}>
              {connected
                ? "Connected for live products and cart actions"
                : "Optional for live products and cart actions"}
            </Text>
          </View>
          <View style={[styles.status, connected ? styles.statusOn : styles.statusOff]}>
            <Text
              style={[styles.statusText, connected ? styles.statusTextOn : styles.statusTextOff]}
            >
              {connected ? "Connected" : "Action needed"}
            </Text>
          </View>
        </View>
        <SecondaryButton onPress={() => void open(links.accountSettings, true)}>
          Manage Kroger connection
        </SecondaryButton>
      </Card>

      <Text style={styles.groupTitle}>Help and legal</Text>
      <Card style={styles.rows}>
        <AccountRow
          icon={<Shield color={colors.green} size={20} />}
          label="Privacy policy"
          onPress={() => void open(links.privacy)}
        />
        <RowRule />
        <AccountRow
          icon={<FileText color={colors.green} size={20} />}
          label="Terms of use"
          onPress={() => void open(links.terms)}
        />
        <RowRule />
        <AccountRow
          icon={<CircleHelp color={colors.green} size={20} />}
          label="Help and support"
          onPress={() => void open(links.support)}
        />
        <RowRule />
        <AccountRow
          icon={<Trash2 color={colors.danger} size={20} />}
          label="Delete account"
          onPress={() => void open(links.deleteAccount)}
        />
      </Card>

      {error ? <InlineError message={error} /> : null}
      <SecondaryButton onPress={() => router.push("/report")}>Report a problem</SecondaryButton>
      <PrimaryButton onPress={() => void signOut()}>
        <View style={styles.signOut}>
          <LogOut color={colors.white} size={18} />
          <Text style={styles.signOutText}>Sign out</Text>
        </View>
      </PrimaryButton>
      <Text selectable style={styles.version}>
        Grocery Agent 1.0.0
      </Text>
    </ScrollView>
  );
}

function AccountRow({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
      <ChevronRight color={colors.muted} size={20} />
    </Pressable>
  );
}

function RowRule() {
  return <View style={styles.rule} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  profile: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 6 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: 23, fontWeight: "800" },
  profileCopy: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: "800" },
  email: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  connectionCard: { padding: 16, gap: 14 },
  connectionTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  connectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionCopy: { flex: 1, gap: 2 },
  connectionTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "800" },
  connectionBody: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusOn: { backgroundColor: colors.surfaceMuted },
  statusOff: { backgroundColor: colors.dangerSurface },
  statusText: { fontSize: 10, fontWeight: "800" },
  statusTextOn: { color: colors.green },
  statusTextOff: { color: colors.danger },
  groupTitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginTop: 5,
    marginLeft: 3,
  },
  rows: { overflow: "hidden" },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    gap: 11,
  },
  rowIcon: { width: 30, alignItems: "center" },
  rowLabel: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  rule: { height: 1, backgroundColor: colors.line, marginLeft: 56 },
  signOut: { flexDirection: "row", alignItems: "center", gap: 8 },
  signOutText: { color: colors.white, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  version: { color: colors.muted, fontSize: 11, textAlign: "center" },
});
