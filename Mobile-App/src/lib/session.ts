import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DriverUser {
  role: 'DRIVER';
  sessionId: number;
  companyId: number;
  plate_number: string;
  busId: number;
  session_code: string;
}

export interface DriverSession {
  token: string;
  user: DriverUser;
}

const STORAGE_KEY = 'transit.driver.session';

export async function saveSession(session: DriverSession): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<DriverSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DriverSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}