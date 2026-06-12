import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/global.css", () => ({}));
vi.mock("./global.css", () => ({}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-0000-0000-000000000000",
  getRandomValues: <T extends ArrayBufferView | null>(array: T) => array,
}));
vi.mock("@/shims/node-crypto", () => ({}));

let currentState: Record<string, unknown> = {};

function Host({ children, ...props }: { children?: React.ReactNode }) {
  return React.createElement("Host", props, children);
}

function ButtonHost({
  children,
  onPress,
  ...props
}: {
  children?: React.ReactNode;
  onPress?: () => void;
}) {
  return React.createElement("Pressable", { ...props, onPress }, children);
}

const menuPrimitive = Object.assign(Host, {
  Action: ButtonHost,
  MenuAction: ButtonHost,
});

const toolbarPrimitive = Object.assign(Host, {
  Button: ButtonHost,
  Menu: menuPrimitive,
  MenuAction: ButtonHost,
  SearchBarSlot: Host,
});

function ScreenHost({ children, ...props }: { children?: React.ReactNode }) {
  return React.createElement("Screen", props, children);
}

const screenPrimitive = Object.assign(ScreenHost, {
  Title: Host,
});

const stackPrimitive = Object.assign(Host, {
  Screen: screenPrimitive,
  SearchBar: ({
    onChangeText,
    onCancelButtonPress,
    ...props
  }: {
    onChangeText?: (event: { nativeEvent: { text: string } }) => void;
    onCancelButtonPress?: () => void;
  }) =>
    React.createElement("TextInput", {
      ...props,
      onChangeText: (value: string) => onChangeText?.({ nativeEvent: { text: value } }),
      onSubmitEditing: onCancelButtonPress,
    }),
  Toolbar: toolbarPrimitive,
});

const tabsPrimitive = Object.assign(Host, {
  Screen: ({ options, ...props }: { options?: { tabBarIcon?: React.ComponentType<any> } }) => (
    <Host {...props}>{options?.tabBarIcon?.({ color: "#111", size: 20 })}</Host>
  ),
});

const linkMenuPrimitive = Object.assign(Host, {
  Action: ButtonHost,
  MenuAction: ButtonHost,
});

const linkPrimitive = Object.assign(Host, {
  Trigger: Host,
  Menu: linkMenuPrimitive,
});

vi.mock("expo-router", () => ({
  Color: { ios: { label: "#111" } },
  Href: String,
  Link: linkPrimitive,
  Redirect: ({ href }: { href: string }) => React.createElement("Redirect", { href }),
  Slot: Host,
  Stack: stackPrimitive,
  Tabs: tabsPrimitive,
  usePathname: () => "/chats",
  useRouter: () => ({ navigate: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@clerk/clerk-expo", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ userId: "user_123" }),
}));

const mockCopilotkit = { runAgent: vi.fn(async () => undefined), stopAgent: vi.fn() };
const mockAgent = {
  get messages() {
    return [
      { id: "m1", role: "user", content: "Hello" },
      { id: "m2", role: "assistant", content: "Plan ready" },
    ];
  },
  get state() {
    return currentState;
  },
  isRunning: false,
  addMessage: vi.fn(),
  runAgent: vi.fn(async () => undefined),
};

vi.mock("@copilotkit/react-native", () => ({
  CopilotKitProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAgent: vi.fn(() => ({ agent: mockAgent })),
  useCopilotKit: vi.fn(() => ({ copilotkit: mockCopilotkit })),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        clerkPublishableKey: "pk_test",
        travelAgentUrl: "http://travel.test",
        groceryAgentUrl: "http://grocery.test",
        fitnessAgentUrl: "http://fitness.test",
        wellnessAgentUrl: "http://wellness.test",
        a2uiAgentUrl: "http://a2ui.test",
      },
    },
    executionEnvironment: "storeClient",
  },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => "token"),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("expo-application", () => ({
  applicationName: "Agents",
  nativeApplicationVersion: "1.0.0",
  nativeBuildVersion: "1",
}));

vi.mock("expo-status-bar", () => ({
  StatusBar: Host,
}));

vi.mock("expo-glass-effect", () => ({
  GlassContainer: Host,
  GlassView: Host,
  isLiquidGlassAvailable: () => false,
}));

vi.mock("expo-blur", () => ({
  BlurView: Host,
}));

vi.mock("expo-blur/build/NativeBlurModule", () => ({
  NativeBlurView: Host,
}));

vi.mock("expo-image", () => ({
  Image: Host,
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

vi.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: vi.fn(async () => undefined),
}));

vi.mock("expo-web-browser", () => ({
  openBrowserAsync: vi.fn(async () => undefined),
}));

vi.mock("uniwind", () => ({
  useCSSVariable: () => "#111",
  withUniwind: (Component: React.ElementType) => Component,
}));

vi.mock("@legendapp/list", () => ({
  LegendList: ({ data, renderItem, children, ...props }: Record<string, unknown>) =>
    React.createElement(
      "LegendList",
      props,
      Array.isArray(data)
        ? data.map((item, index) =>
            React.createElement(
              React.Fragment,
              { key: index },
              (renderItem as (info: { item: unknown; index: number }) => React.ReactNode)?.({
                item,
                index,
              }),
            ),
          )
        : children,
    ),
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: Host,
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }),
}));

vi.mock("react-native-keyboard-controller", () => ({
  KeyboardGestureArea: Host,
  useKeyboardHandler: vi.fn(),
}));

const animatedHost = Object.assign(Host, {
  View: Host,
  Text: Host,
});

vi.mock("react-native-reanimated", () => ({
  default: animatedHost,
  FadeIn: animationChain(),
  FadeOut: animationChain(),
  ReduceMotion: { Never: "never" },
  createAnimatedComponent: (Component: React.ElementType) => Component,
  interpolate: (value: number, input: number[], output: number[]) =>
    value <= input[0] ? output[0] : output[output.length - 1],
  runOnJS: (fn: () => void) => fn,
  useAnimatedProps: (fn: () => unknown) => fn(),
  useAnimatedStyle: (fn: () => unknown) => fn(),
  useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
  useSharedValue: (value: unknown) => ({ value }),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

function animationChain() {
  const chain = {
    delay: () => chain,
    duration: () => chain,
    springify: () => chain,
  };
  return chain;
}

vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => gestureChain(),
    Tap: () => gestureChain(),
  },
  GestureDetector: Host,
  GestureHandlerRootView: Host,
  State: { UNDETERMINED: 0 },
}));

function gestureChain() {
  const chain = {
    activeOffsetX: () => chain,
    enabled: () => chain,
    failOffsetY: () => chain,
    hitSlop: () => chain,
    onBegin: () => chain,
    onChange: () => chain,
    onEnd: () => chain,
    onFinalize: () => chain,
    onStart: () => chain,
    onUpdate: () => chain,
    runOnJS: () => chain,
  };
  return chain;
}

vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: () => void) => fn(),
}));

vi.mock("@expo/ui/swift-ui", () => ({
  Button: ButtonHost,
  Host,
  HStack: Host,
  Image: Host,
  Menu: Host,
  Section: Host,
  Text: Host,
  Toggle: ({
    children,
    onIsOnChange,
  }: {
    children?: React.ReactNode;
    onIsOnChange?: (value: boolean) => void;
  }) => React.createElement("Switch", { onValueChange: onIsOnChange }, children),
  VStack: Host,
}));

vi.mock("@expo/ui/swift-ui/modifiers", () => ({
  controlSize: (value: unknown) => value,
  font: (value: unknown) => value,
  foregroundStyle: (value: unknown) => value,
}));

function icon(name: string) {
  return (props: Record<string, unknown>) => React.createElement(name, props);
}

vi.mock("lucide-react-native", () => ({
  Archive: icon("Archive"),
  ArrowUp: icon("ArrowUp"),
  Bell: icon("Bell"),
  Box: icon("Box"),
  Brain: icon("Brain"),
  Camera: icon("Camera"),
  Check: icon("Check"),
  ChevronDown: icon("ChevronDown"),
  ChevronRight: icon("ChevronRight"),
  CircleDollarSign: icon("CircleDollarSign"),
  CircleUser: icon("CircleUser"),
  Dumbbell: icon("Dumbbell"),
  FileCog: icon("FileCog"),
  File: icon("File"),
  Glasses: icon("Glasses"),
  Globe: icon("Globe"),
  HelpCircle: icon("HelpCircle"),
  HeartPulse: icon("HeartPulse"),
  Image: icon("Image"),
  LayoutGrid: icon("LayoutGrid"),
  LayoutTemplate: icon("LayoutTemplate"),
  Link2: icon("Link2"),
  LogOut: icon("LogOut"),
  Menu: icon("Menu"),
  MessageSquare: icon("MessageSquare"),
  Minus: icon("Minus"),
  Paperclip: icon("Paperclip"),
  Paintbrush: icon("Paintbrush"),
  Pencil: icon("Pencil"),
  Plane: icon("Plane"),
  Plus: icon("Plus"),
  Search: icon("Search"),
  ShieldCheck: icon("ShieldCheck"),
  ShoppingCart: icon("ShoppingCart"),
  SlidersHorizontal: icon("SlidersHorizontal"),
  Sparkles: icon("Sparkles"),
  Star: icon("Star"),
  SunMoon: icon("SunMoon"),
  Trash2: icon("Trash2"),
  TrendingUp: icon("TrendingUp"),
  Users: icon("Users"),
  Vibrate: icon("Vibrate"),
  Wrench: icon("Wrench"),
}));

vi.mock("lucide-react", () => ({
  Archive: icon("Archive"),
  ArrowUp: icon("ArrowUp"),
  Edit3: icon("Edit3"),
  LogOut: icon("LogOut"),
  MessageSquarePlus: icon("MessageSquarePlus"),
  Paperclip: icon("Paperclip"),
  PanelLeft: icon("PanelLeft"),
  PanelLeftOpen: icon("PanelLeftOpen"),
  Pin: icon("Pin"),
  Settings: icon("Settings"),
  Share: icon("Share"),
  SquarePen: icon("SquarePen"),
  Trash2: icon("Trash2"),
  User: icon("User"),
}));

vi.mock("react-syntax-highlighter", () => ({
  default: ({
    children,
    renderer,
  }: {
    children?: React.ReactNode;
    renderer?: (props: unknown) => React.ReactNode;
  }) =>
    React.createElement(
      "SyntaxHighlighter",
      null,
      renderer?.({
        rows: [
          {
            children: [
              {
                properties: { className: ["hljs-keyword"] },
                children: [{ value: "\nconst\n" }],
              },
              { value: " value = 1;" },
            ],
          },
        ],
      }) ?? children,
    ),
}));

vi.mock("react-syntax-highlighter/dist/esm/styles/hljs", () => ({
  githubGist: {},
  irBlack: {},
}));

vi.mock("@radix-ui/react-context-menu", () => radixPrimitive());
vi.mock("@radix-ui/react-dropdown-menu", () => radixPrimitive());
vi.mock("@radix-ui/react-tooltip", () => radixPrimitive());

function radixPrimitive() {
  return {
    Arrow: Host,
    CheckboxItem: ButtonHost,
    Content: Host,
    Item: ButtonHost,
    Portal: Host,
    Provider: Host,
    Root: Host,
    Separator: Host,
    Trigger: Host,
  };
}

async function render(label: string, element: React.ReactElement) {
  try {
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(element);
    });
    for (const pressable of tree!.root.findAllByType("Pressable")) {
      if (typeof pressable.props.onPress === "function") {
        await act(async () => {
          pressable.props.onPress();
        });
      }
      if (typeof pressable.props.onPressIn === "function") {
        await act(async () => {
          pressable.props.onPressIn();
        });
      }
      if (typeof pressable.props.onPressOut === "function") {
        await act(async () => {
          pressable.props.onPressOut();
        });
      }
    }
    for (const input of tree!.root.findAllByType("TextInput")) {
      if (typeof input.props.onChangeText === "function") {
        await act(async () => {
          input.props.onChangeText("Updated");
        });
      }
      if (typeof input.props.onSubmitEditing === "function") {
        await act(async () => {
          input.props.onSubmitEditing();
        });
      }
    }
    for (const toggle of tree!.root.findAllByType("Switch")) {
      if (typeof toggle.props.onValueChange === "function") {
        await act(async () => {
          toggle.props.onValueChange(false);
        });
      }
    }
    await act(async () => {
      tree!.unmount();
    });
  } catch (error) {
    throw new Error(`render failed: ${label}`, { cause: error });
  }
}

describe("mobile all-source smoke coverage", () => {
  it("renders mobile routes and shared component states", async () => {
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      value: (callback: FrameRequestCallback) => setTimeout(callback, 0),
      configurable: true,
    });
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
    });

    const { default: RootLayout } = await import("./app/_layout");
    const { default: WebRootLayout } = await import("./app/_layout.web");
    const { default: SettingsLayout } = await import("./app/(settings)/_layout");
    const { default: SettingsScreen } = await import("./app/(settings)/settings");
    const { default: CapabilitiesScreen } = await import("./app/(settings)/capabilities");
    const { default: ProfileScreen } = await import("./app/(settings)/profile");
    const { default: IndexScreen } = await import("./app/index");
    const { default: TravelScreen } = await import("./app/travel");
    const { default: GroceryScreen } = await import("./app/grocery");
    const { default: FitnessScreen } = await import("./app/fitness");
    const { default: WellnessScreen } = await import("./app/wellness");
    const { default: A2UIScreen } = await import("./app/a2ui");
    const { default: ChatsScreen } = await import("./app/chats");
    const { default: AttachmentsScreen } = await import("./app/attachments");
    const { default: ModelPickerScreen } = await import("./app/model-picker");
    const { DrawerContent, DrawerProvider } = await import("./components/drawer-content");
    const { ModelProvider } = await import("./components/model-context");
    const { ChatProvider } = await import("./components/chat/chat-context");
    const { createStreamingStore } = await import("./components/chat/streaming-store");
    const { Conversation, ConversationScrollButton } =
      await import("./components/chat/conversation");
    const { Message, MessageResponse } = await import("./components/chat/message");
    const NativePrompt = await import("./components/chat/prompt-input");
    const { StreamingMessage } = await import("./components/chat/streaming-message");
    const WebConversation = await import("./components/chat/conversation.web");
    const WebMessage = await import("./components/chat/message.web");
    const WebPrompt = await import("./components/chat/prompt-input.web");
    const { DrawerLayout } = await import("./components/drawer-layout");
    const { BlurViewRawBackdrop } = await import("./components/blur-raw");
    const { BlurViewRawBackdrop: WebBlurViewRawBackdrop } =
      await import("./components/blur-raw.web");
    const { Markdown, ChatMarkdown } = await import("./components/markdown");
    const { CodeBlock } = await import("./components/markdown/code-block");
    await import("./components/main-header");
    await import("./components/main-header.fallback");
    await import("./components/main-header.ios");
    await import("./components/main-header.swiftui");
    const { Sidebar, SidebarToggle } = await import("./components/sidebar");
    const { default: WebSidebarModule } = await import("./components/sidebar.web").then(
      (module) => ({
        default: module,
      }),
    );

    const providers = (children: React.ReactNode) => (
      <ModelProvider
        models={[
          { id: "sonnet-4.6", label: "Sonnet", subtitle: "Daily" },
          { id: "opus", label: "Opus" },
        ]}
      >
        <DrawerProvider>{children}</DrawerProvider>
      </ModelProvider>
    );

    await render("root-layout", providers(<RootLayout />));
    await render("web-root-layout", providers(<WebRootLayout />));
    await render("settings-layout", providers(<SettingsLayout />));
    await render("settings", providers(<SettingsScreen />));
    await render("capabilities", providers(<CapabilitiesScreen />));
    await render("profile", providers(<ProfileScreen />));
    await render("index", providers(<IndexScreen />));

    currentState = {
      destination: "Kyoto",
      headline: "Temples",
      start_date: "2026-10-01",
      end_date: "2026-10-07",
      travelers: 2,
      status: "ready",
    };
    await render("travel", providers(<TravelScreen />));

    currentState = {
      status: "ready",
      kroger_connected: true,
      meal_plan: "Dinner",
      shopping_list: ["eggs", "rice"],
    };
    await render("grocery", providers(<GroceryScreen />));

    currentState = {
      status: "ready",
      strava_connected: true,
      activities: [{ id: "1" }],
      training_plan: "Run easy",
    };
    await render("fitness", providers(<FitnessScreen />));

    currentState = {
      status: "ready",
      weekly_plan: "Week",
      workout_plan: "Lift",
      meal_plan: "Eat",
    };
    await render("wellness", providers(<WellnessScreen />));

    currentState = {
      status: "ready",
      surface_brief: "Dashboard",
      last_surface: "launch-readiness",
    };
    await render("a2ui", providers(<A2UIScreen />));

    await render("chats", providers(<ChatsScreen />));
    await render("attachments", providers(<AttachmentsScreen />));
    await render("model-picker", providers(<ModelPickerScreen />));
    await render(
      "drawer-layout",
      providers(
        <>
          <DrawerLayout
            open
            onOpen={() => {}}
            onClose={() => {}}
            drawerContent={<Host>Drawer</Host>}
          >
            <Host>Content</Host>
          </DrawerLayout>
          <DrawerLayout
            open={false}
            onOpen={() => {}}
            onClose={() => {}}
            drawerWidth={240}
            swipeEnabled={false}
            drawerContent={<Host>Drawer</Host>}
          >
            <Host>Content</Host>
          </DrawerLayout>
          <BlurViewRawBackdrop />
          <WebBlurViewRawBackdrop />
        </>,
      ),
    );
    await render(
      "sidebars",
      providers(
        <>
          <DrawerContent onNavigate={() => {}} onOpenModal={() => {}} />
          <Sidebar isOpen onToggle={() => {}} isCollapsed={false} onCollapse={() => {}} />
          <SidebarToggle onPress={() => {}} />
          <WebSidebarModule.Sidebar
            isOpen
            onToggle={() => {}}
            isCollapsed={false}
            onCollapse={() => {}}
          />
        </>,
      ),
    );

    const streamingStore = createStreamingStore();
    streamingStore.set("Streaming");
    await render(
      "chat-components",
      providers(
        <ChatProvider
          value={{
            messages: [
              { id: "u1", role: "user", content: "Hi" },
              { id: "a1", role: "assistant", content: "" },
            ],
            input: "Hello",
            setInput: vi.fn(),
            isGenerating: true,
            onSend: vi.fn(),
            streamingStore,
            error: new Error("boom"),
          }}
        >
          <Conversation
            emptyState={<Message role="assistant">Empty</Message>}
            renderMessage={({ item }) => <Message role={item.role}>{item.content}</Message>}
          >
            <ConversationScrollButton />
            <NativePrompt.PromptInput>
              <NativePrompt.PromptInputAction onPress={() => {}}>N</NativePrompt.PromptInputAction>
              <NativePrompt.PromptInputBody>
                <NativePrompt.PromptInputTextarea />
                <NativePrompt.PromptInputSubmit />
              </NativePrompt.PromptInputBody>
            </NativePrompt.PromptInput>
            <WebPrompt.PromptInput>
              <WebPrompt.PromptInputBody>
                <WebPrompt.PromptInputTextarea />
                <WebPrompt.PromptInputSubmit />
              </WebPrompt.PromptInputBody>
              <WebPrompt.PromptInputAction onPress={() => {}}>A</WebPrompt.PromptInputAction>
            </WebPrompt.PromptInput>
          </Conversation>
          <MessageResponse markdown="## Heading\n\n- item" />
          <StreamingMessage store={streamingStore} />
          <Markdown>
            ## Table{"\n\n"}| A | B |{"\n"}| - | - |{"\n"}| 1 | 2 |
          </Markdown>
          <ChatMarkdown>Visit [OpenAI](https://openai.com)</ChatMarkdown>
          <CodeBlock code={'const value = "ok";\n'} language="typescript" />
        </ChatProvider>,
      ),
    );

    await render(
      "web-chat-components",
      providers(
        <ChatProvider
          value={{
            messages: [
              { id: "u1", role: "user", content: "Hi" },
              { id: "a1", role: "assistant", content: "Hello" },
            ],
            input: "Hello",
            setInput: vi.fn(),
            isGenerating: false,
            onSend: vi.fn(),
            streamingStore,
            error: null,
          }}
        >
          <WebConversation.Conversation
            emptyState={<WebConversation.ConversationEmptyState description="Start" />}
            renderMessage={({ item }) => (
              <WebMessage.Message from={item.role}>{item.content}</WebMessage.Message>
            )}
          />
          <WebConversation.ConversationScrollButton />
          <WebMessage.Message from="assistant">
            <WebMessage.MessageResponse>Assistant markdown</WebMessage.MessageResponse>
          </WebMessage.Message>
        </ChatProvider>,
      ),
    );

    expect(mockAgent.addMessage).toHaveBeenCalled();
  });
});
