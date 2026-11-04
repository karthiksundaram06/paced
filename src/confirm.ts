import { Alert, Platform } from 'react-native';

/** Yes/no confirmation that works on iPhone (native alert) and on the web (React Native Web has no Alert). */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Three-way choice used when deleting a project. */
export function chooseAction(
  title: string,
  message: string,
  a: { label: string; onPress: () => void },
  b: { label: string; onPress: () => void; destructive?: boolean },
  webQuestion: string
) {
  if (Platform.OS === 'web') {
    if (!window.confirm(`${title}\n\n${message}`)) return;
    // OK = option b (e.g. delete tasks too), Cancel = option a (keep them)
    if (window.confirm(webQuestion)) b.onPress();
    else a.onPress();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: a.label, onPress: a.onPress },
    { text: b.label, style: b.destructive ? 'destructive' : 'default', onPress: b.onPress },
  ]);
}

export function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
