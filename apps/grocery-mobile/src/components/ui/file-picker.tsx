import React from "react";
import { View, Pressable, Text } from "react-native";
import { CloudUpload, X } from "lucide-react-native";
import { cn } from "@/lib/utils";

export interface FileInfo {
  name: string;
  size?: number;
  type?: string;
  uri?: string;
}

export interface FilePickerProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
  file?: FileInfo;
  onPress: () => void;
  onRemove?: () => void;
  label?: string;
  accept?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePicker({
  className,
  file,
  onPress,
  onRemove,
  label = "Tap to select a file",
  ...props
}: FilePickerProps) {
  return (
    <View className={cn("", className)} {...props}>
      {!file ? (
        <Pressable
          onPress={onPress}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={label}
          className="min-h-24 items-center justify-center rounded-lg border-2 border-dashed border-input bg-background px-4 py-6"
        >
          <View className="mb-2">
            <CloudUpload size={24} color="#71717a" />
          </View>
          <Text className="text-center text-sm text-muted-foreground">{label}</Text>
        </Pressable>
      ) : (
        <View className="flex-row items-center rounded-lg border border-border bg-card px-4 py-3">
          <View className="me-3 flex-1">
            <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
              {file.name}
            </Text>
            {file.size !== undefined && (
              <Text className="mt-0.5 text-xs text-muted-foreground">{formatSize(file.size)}</Text>
            )}
          </View>
          {onRemove && (
            <Pressable
              onPress={onRemove}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Remove file"
              className="min-h-8 min-w-8 items-center justify-center"
            >
              <X size={24} color="#71717a" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
