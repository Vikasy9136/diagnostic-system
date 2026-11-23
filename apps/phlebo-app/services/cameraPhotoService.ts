import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import { uploadPhleboSampleBase64, uploadPhleboSampleFile, uploadPhleboSampleUri } from '../firebase';

export interface CameraCaptureResult {
  success: boolean;
  photoUrl?: string;
  localUri?: string;
  canceled?: boolean;
  error?: string;
}

/**
 * Requests device camera permission on mobile and returns true if granted.
 */
export async function requestDeviceCameraPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
        return true;
      }
      return true;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Required',
        'LabSetu needs access to your camera to take sample tube collection proof photos. Please enable camera permission in app settings.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[cameraPhotoService] Permission request failed:', err);
    return false;
  }
}

/**
 * Launches the native device camera directly to take sample proof photo or selfie,
 * then uploads the captured photo to Firebase Storage.
 */
export async function captureSampleProofPhoto(
  orderId: string,
  onPreviewReady?: (localUri: string) => void,
  options?: {
    captureMode?: 'environment' | 'user';
    prefix?: string;
  }
): Promise<CameraCaptureResult> {
  const mode = options?.captureMode || 'environment';
  const prefix = options?.prefix || (mode === 'user' ? 'selfie' : 'snap');
  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      return new Promise<CameraCaptureResult>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', mode);
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
          const file = input.files?.[0];
          input.remove();
          if (!file) {
            resolve({ success: false, canceled: true });
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = reader.result as string;
            if (onPreviewReady) onPreviewReady(dataUrl);
            const filename = `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
            const storagePath = `samples/${orderId}/${filename}`;
            let downloadUrl = dataUrl;
            try {
              downloadUrl = await uploadPhleboSampleFile(storagePath, file);
            } catch (upErr) {
              console.warn('[cameraPhotoService] Storage upload fallback to dataUrl:', upErr);
            }
            resolve({
              success: true,
              localUri: dataUrl,
              photoUrl: downloadUrl,
            });
          };
          reader.onerror = () => {
            resolve({ success: false, error: 'Could not read captured camera image' });
          };
          reader.readAsDataURL(file);
        };

        // Fallback cleanup if cancel event fires
        setTimeout(() => {
          if (document.body.contains(input)) {
            input.remove();
          }
        }, 120000);

        input.click();
      });
    }

    const hasPermission = await requestDeviceCameraPermission();
    if (!hasPermission) {
      return { success: false, error: 'Camera permission denied' };
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: mode === 'user' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      allowsEditing: false,
      quality: 0.82,
    });

    if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
      return { success: false, canceled: true };
    }

    const asset = pickerResult.assets[0];
    const uri = asset.uri;
    if (onPreviewReady) {
      onPreviewReady(uri);
    }

    const filename = `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
    const storagePath = `samples/${orderId}/${filename}`;

    const downloadUrl = await uploadPhleboSampleUri(storagePath, uri);

    return {
      success: true,
      localUri: uri,
      photoUrl: downloadUrl,
    };
  } catch (err) {
    console.error('[cameraPhotoService] Camera capture failed:', err);
    const msg = (err as Error)?.message || 'Failed to capture or upload photo';
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Fallback to pick an existing photo from the device gallery.
 */
export async function pickSampleProofFromLibrary(
  orderId: string,
  onPreviewReady?: (localUri: string) => void
): Promise<CameraCaptureResult> {
  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      return new Promise<CameraCaptureResult>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async () => {
          const file = input.files?.[0];
          input.remove();
          if (!file) {
            resolve({ success: false, canceled: true });
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = reader.result as string;
            if (onPreviewReady) onPreviewReady(dataUrl);
            const filename = `upload-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
            const storagePath = `samples/${orderId}/${filename}`;
            let downloadUrl = dataUrl;
            try {
              downloadUrl = await uploadPhleboSampleFile(storagePath, file);
            } catch (upErr) {
              console.warn('[cameraPhotoService] Storage upload fallback to dataUrl:', upErr);
            }
            resolve({
              success: true,
              localUri: dataUrl,
              photoUrl: downloadUrl,
            });
          };
          reader.onerror = () => {
            resolve({ success: false, error: 'Could not read chosen image file' });
          };
          reader.readAsDataURL(file);
        };

        input.click();
      });
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });

    if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) {
      return { success: false, canceled: true };
    }

    const asset = pickerResult.assets[0];
    const uri = asset.uri;
    if (onPreviewReady) {
      onPreviewReady(uri);
    }

    const filename = `upload-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;
    const storagePath = `samples/${orderId}/${filename}`;

    const downloadUrl = await uploadPhleboSampleUri(storagePath, uri);

    return {
      success: true,
      localUri: uri,
      photoUrl: downloadUrl,
    };
  } catch (err) {
    console.error('[cameraPhotoService] Gallery pick failed:', err);
    return {
      success: false,
      error: (err as Error)?.message || 'Failed to upload photo from device',
    };
  }
}
