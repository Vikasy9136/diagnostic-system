import { Platform } from 'react-native';
import { GoogleAuthProvider, signInWithCredential, type UserCredential } from 'firebase/auth';
import { auth } from '../firebase';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const GOOGLE_WEB_CLIENT_ID =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim()) || '';

let configured = false;
let signInInProgress = false;

export interface NativeGoogleSignInResult {
  status: 'success' | 'cancelled' | 'error';
  credential?: UserCredential;
  errorCode?: string;
  userMessage?: string;
}

async function getGoogleSigninModule() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('@react-native-google-signin/google-signin');
  } catch (err) {
    console.warn('[nativeGoogleAuth] Native GoogleSignin module unavailable (Expo Go or unbuilt dev client):', err);
    return null;
  }
}

export async function signOutNativeGoogle(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const mod = await getGoogleSigninModule();
    if (!mod) return;
    await mod.GoogleSignin.signOut();
  } catch {
    // Non-fatal
  }
}

export async function signInWithNativeGoogle(): Promise<NativeGoogleSignInResult> {
  if (signInInProgress) {
    return {
      status: 'error',
      errorCode: 'IN_PROGRESS',
      userMessage: 'Google Sign-In is already in progress. Please wait.',
    };
  }

  const mod = await getGoogleSigninModule();
  if (!mod) {
    return {
      status: 'error',
      errorCode: 'NATIVE_MODULE_UNAVAILABLE',
      userMessage:
        'Native Google Sign-In requires the LabSetu Android build (not Expo Go). Please use Email & Password or Email OTP here.',
    };
  }

  const { GoogleSignin, statusCodes, isErrorWithCode, isSuccessResponse, isCancelledResponse } = mod;

  signInInProgress = true;
  try {
    if (!configured) {
      GoogleSignin.configure({
        ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
        offlineAccess: false,
      });
      configured = true;
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Sign out any cached Google selection so Android shows the native Account Picker cleanly
    try {
      await GoogleSignin.signOut();
    } catch {
      // Ignore if not signed in yet
    }

    const response = await GoogleSignin.signIn();

    if (isCancelledResponse && isCancelledResponse(response)) {
      return {
        status: 'cancelled',
        errorCode: 'USER_CANCELLED',
        userMessage: 'Google sign-in was cancelled.',
      };
    }

    let idToken = '';
    if (isSuccessResponse && isSuccessResponse(response)) {
      idToken = response.data?.idToken || '';
    } else {
      idToken = (response as unknown as { idToken?: string; data?: { idToken?: string } })?.idToken ||
        (response as unknown as { data?: { idToken?: string } })?.data?.idToken ||
        '';
    }

    if (!idToken) {
      return {
        status: 'error',
        errorCode: 'MISSING_ID_TOKEN',
        userMessage:
          'Google Account selection did not return an ID token. Ensure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID & SHA-1 are configured in Firebase.',
      };
    }

    const firebaseCredential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, firebaseCredential);
    return {
      status: 'success',
      credential: userCredential,
    };
  } catch (err: unknown) {
    if (isErrorWithCode && isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        return {
          status: 'cancelled',
          errorCode: 'USER_CANCELLED',
          userMessage: 'Google sign-in was cancelled.',
        };
      }
      if (err.code === statusCodes.IN_PROGRESS) {
        return {
          status: 'error',
          errorCode: 'IN_PROGRESS',
          userMessage: 'Google Sign-In is already in progress.',
        };
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          status: 'error',
          errorCode: 'PLAY_SERVICES_NOT_AVAILABLE',
          userMessage: 'Google Play Services is unavailable or outdated on this device.',
        };
      }
      if (String(err.code) === '10' || String(err.message || '').includes('DEVELOPER_ERROR')) {
        console.error('[nativeGoogleAuth] DEVELOPER_ERROR (code 10): Check SHA-1 fingerprint & Web Client ID in Firebase.');
        return {
          status: 'error',
          errorCode: 'OAUTH_CONFIGURATION_REQUIRED',
          userMessage:
            'Google Sign-In OAuth configuration is incomplete for this app build (SHA-1 / Web Client ID needed in Firebase). Use Email OTP or Password meanwhile.',
        };
      }
    }

    const rawMsg = err instanceof Error ? err.message : '';
    if (rawMsg.toLowerCase().includes('network') || rawMsg.toLowerCase().includes('internet')) {
      return {
        status: 'error',
        errorCode: 'NETWORK_ERROR',
        userMessage: 'No internet connection. Please check your network and try again.',
      };
    }

    console.error('[nativeGoogleAuth] Sign-in error:', rawMsg);
    return {
      status: 'error',
      errorCode: 'GOOGLE_SIGNIN_FAILED',
      userMessage: 'Could not complete Google Sign-In. Please try again or use Email OTP.',
    };
  } finally {
    signInInProgress = false;
  }
}
