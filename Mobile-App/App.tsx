import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { DriverScreen } from './src/screens/DriverScreen';
import { loadSession, type DriverSession } from './src/lib/session';

export default function App() {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<DriverSession | null>(null);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setBooted(true));
  }, []);

  if (!booted) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color="#C22229" size="large" />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen onLoggedIn={setSession} />;
  }

  return <DriverScreen session={session} onSignOut={() => setSession(null)} />;
}

const s = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0A0F0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
});