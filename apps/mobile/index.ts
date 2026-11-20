import { registerRootComponent } from 'expo';
import { createElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { ThemeProvider } from './src/theme/ThemeProvider';

function Root() {
  return createElement(
    SafeAreaProvider,
    null,
    createElement(ThemeProvider, null, createElement(App)),
  );
}

registerRootComponent(Root);
