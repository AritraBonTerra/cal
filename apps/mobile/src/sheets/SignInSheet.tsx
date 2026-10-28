import type { SignInFlow } from "@cal/sync";
import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { session } from "../data/cal";
import { useColors } from "../lib/theme";
import { Button, HeaderAction, SheetHeader } from "../ui/controls";

// Email and password for Convex Auth: sign in, or create an account.
export function SignInSheet() {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SignInFlow | null>(null);

  const submit = async (flow: SignInFlow) => {
    if (!email || !password || busy) return;
    setBusy(flow);
    setError(null);
    try {
      await session.signIn(email.trim(), password, flow);
      router.back();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't sign in. Check the email and password.",
      );
    } finally {
      setBusy(null);
    }
  };

  const field = "h-12 rounded-md border border-edge bg-canvas px-3 text-body text-ink";

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
        <View className="gap-1">
          <Text className="text-small text-ink-2">Email</Text>
          <TextInput
            autoFocus
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            placeholder="you@example.com"
            placeholderTextColor={colors["ink-3"]}
            className={field}
          />
        </View>
        <View className="gap-1">
          <Text className="text-small text-ink-2">Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={() => void submit("signIn")}
            returnKeyType="go"
            placeholder="••••••••"
            placeholderTextColor={colors["ink-3"]}
            className={field}
          />
        </View>
        {error && <Text className="text-small text-now">{error}</Text>}
        <View className="mt-2 gap-2">
          <Button
            title={busy === "signIn" ? "Signing in…" : "Sign in"}
            kind="primary"
            disabled={busy !== null || !email || !password}
            onPress={() => void submit("signIn")}
          />
          <Button
            title={busy === "signUp" ? "Creating…" : "Create account"}
            kind="plain"
            disabled={busy !== null || !email || !password}
            onPress={() => void submit("signUp")}
          />
        </View>
      </View>
    </View>
  );
}
