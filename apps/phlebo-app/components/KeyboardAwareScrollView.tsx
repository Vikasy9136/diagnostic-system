import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
} from 'react-native';

export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e?.endCoordinates?.height ?? 0;
      if (h > 0) setKeyboardHeight(h);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  extraBottomPadding?: number;
}

export const KeyboardAwareScrollView = React.forwardRef<
  React.ElementRef<typeof ScrollView>,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  { children, contentContainerStyle, extraBottomPadding = 32, keyboardShouldPersistTaps = 'handled', ...rest },
  ref
) {
  const keyboardHeight = useKeyboardHeight();
  const flatContent = StyleSheet.flatten(contentContainerStyle) || {};
  const basePaddingBottom =
    typeof flatContent.paddingBottom === 'number' ? flatContent.paddingBottom : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        {...rest}
        contentContainerStyle={[
          contentContainerStyle,
          keyboardHeight > 0
            ? { paddingBottom: basePaddingBottom + keyboardHeight + extraBottomPadding }
            : null,
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});
