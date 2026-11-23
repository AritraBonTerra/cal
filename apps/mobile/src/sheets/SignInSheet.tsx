import { router } from "expo-router";
import { RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { auth, session } from "../data/cal";
import { IS_PAD } from "../lib/device";
import { useColors, useMode } from "../lib/theme";
import { HeaderAction, SheetHeader } from "../ui/controls";

/*
 * Sign in with Google: a browser sheet, then the account's data syncs here. On iPhone
 * the sheet hugs its content at the bottom; on iPad it is a centered card, so the
 * content sits in the middle of it.
 */
export function SignInSheet() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Closing the browser sheet is not an error: stay here, ready to try again.
  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await auth.signInWithGoogle()) {
        await session.signedIn();
        router.back();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't sign in with Google.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-raised">
      <SheetHeader title="" left={<HeaderAction title="Cancel" onPress={() => router.back()} />} />
      <View
        className={`items-center px-6 ${IS_PAD ? "flex-1 justify-center" : "pt-2"}`}
        // The iPad card balances the header above; the iPhone sheet clears the home bar.
        style={{ paddingBottom: IS_PAD ? 56 : Math.max(insets.bottom, 16) + 12 }}
      >
        <View className="w-full max-w-[340px] items-center">
          <View className="h-14 w-14 items-center justify-center rounded-xl bg-accent-soft">
            <RefreshCw size={26} color={colors.accent} strokeWidth={1.75} absoluteStrokeWidth />
          </View>
          <Text className="mt-5 text-center text-title-2 font-semibold text-ink">
            Sync across your devices
          </Text>
          <Text className="mt-2 text-center text-body text-ink-2">
            Your to-dos, blocks and habits stay on this device until you sign in. Then they keep up
            to date on your Mac, iPhone and iPad.
          </Text>
          <View className="mt-7 w-full gap-3">
            <GoogleButton busy={busy} onPress={() => void signIn()} />
            {error && <Text className="text-center text-small text-danger">{error}</Text>}
          </View>
        </View>
      </View>
    </View>
  );
}

// Google's own button colors, light and dark (their sign-in branding guidelines).
const GOOGLE = {
  light: { fill: "#FFFFFF", pressed: "#F2F2F2", stroke: "#747775", text: "#1F1F1F" },
  dark: { fill: "#131314", pressed: "#2A2A2C", stroke: "#8E918F", text: "#E3E3E3" },
};

// "Continue with Google", to Google's branding: their fill, 1pt outline and color "G".
function GoogleButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const tone = GOOGLE[useMode()];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      onPress={onPress}
      disabled={busy}
      className={`h-12 flex-row items-center justify-center gap-3 rounded-lg px-4 ${
        busy ? "opacity-60" : ""
      }`}
      style={({ pressed }) => ({
        backgroundColor: pressed ? tone.pressed : tone.fill,
        borderWidth: 1,
        borderColor: tone.stroke,
      })}
    >
      <GoogleMark />
      <Text className="text-body font-medium" style={{ color: tone.text }}>
        {busy ? "Signing in…" : "Continue with Google"}
      </Text>
    </Pressable>
  );
}

// Google's four-color "G", from their brand assets.
function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}
