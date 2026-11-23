import { registerRootComponent } from 'expo';
import { createElement, type JSX } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { ThemeProvider } from './src/theme/ThemeProvider';

function Root(): JSX.Element {
  return createElement(
    SafeAreaProvider,
    null,
    createElement(ThemeProvider, null, createElement(App)),
  );
}

registerRootComponent(Root);
