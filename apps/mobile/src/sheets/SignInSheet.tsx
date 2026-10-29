import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { auth, session } from "../data/cal";
import { Button, HeaderAction, SheetHeader } from "../ui/controls";

// Sign in with Google: a browser sheet, then the account's data syncs here.
export function SignInSheet() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.signInWithGoogle();
      await session.signedIn();
      router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't sign in with Google.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-raised">
      <SheetHeader
        title="Sign in"
        left={<HeaderAction title="Cancel" onPress={() => router.back()} />}
      />
      <View className="gap-3 px-4">
        <Text className="text-small text-ink-2">
          Your to-dos, blocks and habits stay on this device until you sign in. Then they sync to
          your other devices.
        </Text>
        {error && <Text className="text-small text-now">{error}</Text>}
        <View className="mt-2">
          <Button
            title={busy ? "Signing in…" : "Continue with Google"}
            kind="primary"
            disabled={busy}
            onPress={() => void signIn()}
          />
        </View>
      </View>
    </View>
  );
}
