import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { API_URL } from '../config';
import { driverLogin, errorLabel } from '../lib/api';
import { saveSession, type DriverSession } from '../lib/session';

export function LoginScreen({
  onLoggedIn,
}: {
  onLoggedIn: (session: DriverSession) => void;
}) {
  const [sessionCode, setSessionCode] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogin() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await driverLogin({
        session_code: sessionCode.trim(),
        plate_number: plateNumber.trim(),
      });
      const session: DriverSession = { token: result.token, user: result.user };
      await saveSession(session);
      onLoggedIn(session);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'REQUEST_FAILED';
      setError(
        code === 'Network request failed'
          ? errorLabel('NETWORK_ERROR')
          : errorLabel(code),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={s.brandRow}>
        <Text style={s.brand}>TRANSIT</Text>
        <Text style={s.brandSub}>DRIVER CONSOLE</Text>
      </View>

      <View style={s.card}>
        <Text style={s.eyebrow}>LINKED BUS ACCESS</Text>
        <Text style={s.title}>Sign in to your bus</Text>

        <Text style={s.label}>SESSION CODE</Text>
        <TextInput
          style={s.input}
          value={sessionCode}
          onChangeText={(v) => setSessionCode(v.toUpperCase())}
          placeholder="e.g. XD4WJ4"
          placeholderTextColor="#6B7280"
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <Text style={s.label}>BUS PLATE NUMBER</Text>
        <TextInput
          style={s.input}
          value={plateNumber}
          onChangeText={(v) => setPlateNumber(v.toUpperCase())}
          placeholder="e.g. ABC-123-XY"
          placeholderTextColor="#6B7280"
          autoCapitalize="characters"
          autoCorrect={false}
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Pressable
          onPress={onLogin}
          disabled={busy || !sessionCode || !plateNumber}
          style={({ pressed }) => [
            s.button,
            (busy || !sessionCode || !plateNumber) && s.buttonDisabled,
            pressed && s.buttonPressed,
          ]}
        >
          <Text style={s.buttonText}>
            {busy ? 'Signing in…' : 'Link to bus & continue'}
          </Text>
        </Pressable>

        <Text style={s.hint}>Server: {API_URL}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F0D',
    padding: 24,
    justifyContent: 'center',
  },
  brandRow: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 4,
  },
  brand: {
    color: '#C22229',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 4,
  },
  brandSub: {
    color: '#9CA3AF',
    fontSize: 11,
    letterSpacing: 3,
  },
  card: {
    backgroundColor: '#121714',
    borderColor: '#38443F',
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  eyebrow: {
    color: '#9CA3AF',
    fontSize: 10,
    letterSpacing: 2,
  },
  title: {
    color: '#F5F5F5',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#0E1311',
    borderColor: '#38443F',
    borderWidth: 1,
    color: '#F5F5F5',
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  error: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#C22229',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  hint: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 12,
    textAlign: 'center',
  },
});