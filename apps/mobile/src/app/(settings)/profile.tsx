import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

export default function ProfileScreen() {
  const [fullName, setFullName] = useState("Evan Bacon");
  const [nickname, setNickname] = useState("Evan");
  const [preferences, setPreferences] = useState("I'm a creator and software developer.");

  return (
    <ScrollView
      className="bg-background text-foreground flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 pb-10"
      keyboardDismissMode="interactive"
    >
      {/* Full Name */}
      <Text className="text-muted-foreground mt-6 mb-2 text-[13px] font-medium">Full Name</Text>
      <TextInput
        value={fullName}
        onChangeText={setFullName}
        className="bg-muted text-foreground border-continuous rounded-xl px-4 py-3 text-[17px]"
        placeholderTextColor="#999"
      />

      {/* Nickname */}
      <Text className="text-muted-foreground mt-5 mb-2 text-[13px] font-medium">Nickname</Text>
      <TextInput
        value={nickname}
        onChangeText={setNickname}
        className="bg-muted text-foreground border-continuous rounded-xl px-4 py-3 text-[17px]"
        placeholderTextColor="#999"
      />

      {/* Update Profile Button */}
      <Pressable className="bg-foreground border-continuous mt-6 items-center rounded-xl py-3.5 active:opacity-80">
        <Text className="text-background text-[17px] font-semibold">Update Profile</Text>
      </Pressable>

      {/* Divider */}
      <View className="bg-border my-6 h-px" />

      {/* Personal Preferences */}
      <Text className="text-muted-foreground mb-2 text-[15px] font-medium">
        Personal Preferences
      </Text>
      <TextInput
        value={preferences}
        onChangeText={setPreferences}
        multiline
        className="bg-muted text-foreground border-continuous min-h-[140px] rounded-xl px-4 py-3 text-[15px] leading-relaxed"
        style={{ textAlignVertical: "top" }}
        placeholderTextColor="#999"
      />
      <Text className="text-muted-foreground mt-2 text-[13px] leading-relaxed">
        Your preferences will apply to all conversations, within Agent&apos;s guidelines.
      </Text>

      {/* Save Preferences Button */}
      <Pressable className="bg-muted border-continuous mt-4 items-center rounded-xl py-3.5 active:opacity-80">
        <Text className="text-muted-foreground text-[17px] font-semibold">Save Preferences</Text>
      </Pressable>

      {/* Divider */}
      <View className="bg-border my-6 h-px" />

      {/* Delete Account */}
      <Pressable className="flex-row items-center gap-2 active:opacity-60">
        <Text className="text-[17px] text-red-500">Delete account</Text>
      </Pressable>
    </ScrollView>
  );
}
